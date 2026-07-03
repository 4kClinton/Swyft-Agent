import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { buildLandlordReportPdf, type LandlordReportData } from "./lib/pdf";
import { sendResendEmail, sendAtSms, bytesToBase64 } from "./lib/comms";

// ---------------------------------------------------------------------------
// Landlord performance reports (operational, PUSHED — no portal, no money
// movement; see [[pm-landlord-layer]]). Metrics are gathered SCALE-SAFELY:
// scoped to ONE landlord's portfolio via indexes (buildings.by_landlord →
// units.by_building → tenants.by_unit → invoices.by_tenant_and_status), never a
// company-wide `.collect()`.
// ---------------------------------------------------------------------------

const periodValidator = v.string(); // "2026-06"

/** Gather a single landlord's portfolio metrics + the data the PDF needs. */
export const landlordReportData = internalQuery({
  args: { landlordId: v.id("landlords") },
  handler: async (ctx, { landlordId }) => {
    const landlord = await ctx.db.get(landlordId);
    if (!landlord) throw new Error("Landlord not found");
    const company = await ctx.db.get(landlord.companyId);

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", landlordId))
      .collect();

    const perBuilding: LandlordReportData["buildings"] = [];
    let units = 0;
    let occupied = 0;
    let vacant = 0;
    let expectedMonthlyRent = 0;
    let arrears = 0;

    for (const b of buildings) {
      const bUnits = await ctx.db
        .query("units")
        .withIndex("by_building", (q) => q.eq("buildingId", b._id))
        .collect();

      let bOccupied = 0;
      let bVacant = 0;
      let bRent = 0;
      let bArrears = 0;

      for (const u of bUnits) {
        if (u.status === "occupied") {
          bOccupied++;
          bRent += u.rentAmount || 0;
          // Outstanding for the occupant: open + partial invoice balances.
          const tenant = await ctx.db
            .query("tenants")
            .withIndex("by_unit", (q) => q.eq("unitId", u._id))
            .first();
          if (tenant) {
            for (const status of ["open", "partial"] as const) {
              const invs = await ctx.db
                .query("invoices")
                .withIndex("by_tenant_and_status", (q) =>
                  q.eq("tenantId", tenant._id).eq("status", status),
                )
                .collect();
              for (const inv of invs) bArrears += inv.balance || 0;
            }
          }
        } else if (u.status === "vacant") {
          bVacant++;
        }
      }

      units += bUnits.length;
      occupied += bOccupied;
      vacant += bVacant;
      expectedMonthlyRent += bRent;
      arrears += bArrears;
      perBuilding.push({
        name: b.name,
        units: bUnits.length,
        occupied: bOccupied,
        vacant: bVacant,
        expectedRent: bRent,
        arrears: bArrears,
      });
    }

    const occupancyRate = units > 0 ? occupied / units : 0;
    const summary = {
      buildings: buildings.length,
      units,
      occupied,
      vacant,
      expectedMonthlyRent,
      arrears,
    };

    return {
      companyId: landlord.companyId,
      landlord: {
        name: landlord.name,
        email: landlord.email,
        phone: landlord.phone,
        reportChannel: landlord.reportChannel,
      },
      summary,
      pdf: {
        company: {
          name: company?.name ?? "Swyft",
          email: company?.email,
          phone: company?.phone,
          address: company?.address,
        },
        landlord: { name: landlord.name, email: landlord.email, phone: landlord.phone },
        period: "",
        metrics: { ...summary, occupancyRate },
        buildings: perBuilding,
      } satisfies LandlordReportData,
    };
  },
});

export const recordDelivery = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    landlordId: v.id("landlords"),
    period: periodValidator,
    storageId: v.id("_storage"),
    summary: v.object({
      buildings: v.number(),
      units: v.number(),
      occupied: v.number(),
      vacant: v.number(),
      expectedMonthlyRent: v.number(),
      arrears: v.number(),
    }),
  },
  handler: async (ctx, args): Promise<Id<"reportDeliveries">> => {
    return await ctx.db.insert("reportDeliveries", {
      ...args,
      state: "generated",
    });
  },
});

export const patchDelivery = internalMutation({
  args: {
    deliveryId: v.id("reportDeliveries"),
    state: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    channel: v.optional(
      v.union(v.literal("email"), v.literal("whatsapp"), v.literal("sms")),
    ),
    recipient: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { deliveryId, ...patch }) => {
    await ctx.db.patch(deliveryId, patch);
    return null;
  },
});

// --- Shared helpers (plain functions — no action→action calls) -------------

/** Generate the report PDF, store it, and record a `generated` delivery row. */
async function generateAndStore(
  ctx: ActionCtx,
  landlordId: Id<"landlords">,
  period: string,
): Promise<{
  url: string;
  storageId: Id<"_storage">;
  deliveryId: Id<"reportDeliveries">;
  data: Awaited<ReturnType<typeof gatherFor>>;
}> {
  const data = await gatherFor(ctx, landlordId);
  const pdfData: LandlordReportData = { ...data.pdf, period };
  const bytes = await buildLandlordReportPdf(pdfData);
  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const deliveryId = await ctx.runMutation(internal.reports.recordDelivery, {
    companyId: data.companyId,
    landlordId,
    period,
    storageId,
    summary: data.summary,
  });
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Failed to store report PDF");
  return { url, storageId, deliveryId, data };
}

function gatherFor(ctx: ActionCtx, landlordId: Id<"landlords">) {
  return ctx.runQuery(internal.reports.landlordReportData, { landlordId });
}

/** Generate + deliver via the landlord's configured channel; record the outcome. */
async function deliver(
  ctx: ActionCtx,
  landlordId: Id<"landlords">,
  period: string,
): Promise<{ deliveryId: Id<"reportDeliveries">; state: string }> {
  const { url, deliveryId, data, storageId } = await generateAndStore(ctx, landlordId, period);
  const channel = data.landlord.reportChannel;
  const recipient =
    channel === "email" ? data.landlord.email : data.landlord.phone;

  if (!channel || !recipient) {
    await ctx.runMutation(internal.reports.patchDelivery, {
      deliveryId,
      state: "skipped",
      error: "No report channel or recipient on file",
    });
    return { deliveryId, state: "skipped" };
  }

  let ok = false;
  const m = data.summary;
  const summaryLine =
    `${data.pdf.company.name} report ${period}: ${m.occupied}/${m.units} occupied, ` +
    `expected KES ${Math.round(m.expectedMonthlyRent).toLocaleString()}, ` +
    `arrears KES ${Math.round(m.arrears).toLocaleString()}.`;

  if (channel === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? "Swyft <onboarding@resend.dev>";
    if (apiKey) {
      const bytes = await ctx.storage.get(storageId);
      const attachments = bytes
        ? [
            {
              filename: `Report-${period}.pdf`,
              content: bytesToBase64(new Uint8Array(await bytes.arrayBuffer())),
            },
          ]
        : undefined;
      ok = await sendResendEmail({
        apiKey,
        from,
        to: recipient,
        subject: `Your property report — ${period}`,
        html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1f26;max-width:520px;margin:auto">
          <h2 style="color:#0d8050;margin-bottom:4px">Property report — ${period}</h2>
          <p>Hi ${data.landlord.name},</p>
          <p>${summaryLine}</p>
          <p>Your full report is attached as a PDF.</p>
          <p style="color:#9ca3af;font-size:12px">Sent via Swyft on behalf of ${data.pdf.company.name}.</p>
        </div>`,
        attachments,
      });
    }
  } else {
    // sms + whatsapp (no WhatsApp integration yet — SMS fallback).
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    if (username && apiKey) {
      ok = await sendAtSms({
        username,
        apiKey,
        senderId: process.env.AT_SENDER_ID,
        to: recipient,
        message: `${summaryLine} Full report: ${url}`,
      });
    }
  }

  await ctx.runMutation(internal.reports.patchDelivery, {
    deliveryId,
    state: ok ? "sent" : "failed",
    channel,
    recipient,
    sentAt: ok ? Date.now() : undefined,
    error: ok ? undefined : "Delivery provider not configured or rejected the send",
  });
  return { deliveryId, state: ok ? "sent" : "failed" };
}

// --- Public actions (company-guarded) --------------------------------------

/** Generate (or regenerate) a landlord's report PDF and return its URL. */
export const generateLandlordReport = action({
  args: { landlordId: v.id("landlords"), period: periodValidator },
  handler: async (
    ctx,
    { landlordId, period },
  ): Promise<{ url: string; deliveryId: Id<"reportDeliveries"> }> => {
    // Throws unless the landlord belongs to the caller's company.
    await ctx.runQuery(api.landlords.get, { id: landlordId });
    const { url, deliveryId } = await generateAndStore(ctx, landlordId, period);
    return { url, deliveryId };
  },
});

/** Generate + send a landlord's report via their configured channel. */
export const sendLandlordReport = action({
  args: { landlordId: v.id("landlords"), period: periodValidator },
  handler: async (ctx, { landlordId, period }): Promise<{ state: string }> => {
    await ctx.runQuery(api.landlords.get, { id: landlordId });
    const { state } = await deliver(ctx, landlordId, period);
    return { state };
  },
});

/** Delivery history for a landlord (with a fresh download URL per row). */
export const listDeliveries = query({
  args: { landlordId: v.id("landlords") },
  handler: async (ctx, { landlordId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(landlordId), companyId);
    const rows = await ctx.db
      .query("reportDeliveries")
      .withIndex("by_landlord", (q) => q.eq("landlordId", landlordId))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async (r) => ({
        ...r,
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
      })),
    );
  },
});

// --- Cron: monthly cadence-aware report run --------------------------------

/** Landlords due a report this month (cadence-aware), scoped per company. */
export const landlordsDueForReports = internalQuery({
  args: { quarterMonth: v.boolean() },
  handler: async (ctx, { quarterMonth }) => {
    // System-wide scan is acceptable here: landlords are low-cardinality vs
    // operational tables, and this runs once a month off-peak.
    const all = await ctx.db.query("landlords").collect();
    return all
      .filter((l) => l.status === "active" && l.reportChannel)
      .filter((l) => (l.reportCadence === "quarterly" ? quarterMonth : true))
      .map((l) => l._id);
  },
});

export const runMonthlyLandlordReports = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // EAT
    const month = now.getUTCMonth() + 1; // 1..12
    const year = now.getUTCFullYear();
    // Report the PREVIOUS month's performance.
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const period = `${prev.y}-${String(prev.m).padStart(2, "0")}`;
    const quarterMonth = [1, 4, 7, 10].includes(month);

    const due = await ctx.runQuery(internal.reports.landlordsDueForReports, { quarterMonth });
    console.log(`[reports] monthly run: ${due.length} landlords due for ${period}`);
    for (const landlordId of due) {
      try {
        await deliver(ctx, landlordId, period);
      } catch (err) {
        console.error(
          `[reports] failed for landlord=${landlordId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  },
});
