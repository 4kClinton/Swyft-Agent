// Leads (house-hunting demand) — the agent side of rules/DATA_FLOW/leads.md.
//
// A de-identified lead projection arrives from the swyft-customer backend over
// the HMAC-signed POST /api/leads/upsert. NO tenant PII is stored — a manager
// only ever sees area/type/budget-band/move/deposit and answers "do I have a
// unit that fits?". A manager sees a lead ONLY if they own a building in the
// lead's area (hard gate). Offers are capped at 3 sends per lead, platform-wide.

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
  httpAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCompany } from "./lib/rbac";
import { verifyHmac, hmacHex } from "./lib/hmac";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_SENDS_PER_LEAD = 3;

// Bed count from a unit-type label; studios/bedsitters are 0.
function bedsFromType(t?: string): number | undefined {
  if (!t) return undefined;
  const s = t.toLowerCase();
  if (s.includes("bedsit") || s.includes("studio")) return 0;
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

// Does a vacant unit fit a lead? Rent within the (banded) budget, and bedroom
// count compatible ("3BR+" leads accept 3 or more). Lenient on type when beds
// can't be derived, so we never hide a plausibly-matching unit.
function unitMatches(unit: Doc<"units">, lead: Doc<"leadMatches">): boolean {
  if (unit.rentAmount > lead.budgetMax || unit.rentAmount < lead.budgetMin) return false;
  const leadBeds = lead.bedrooms ?? bedsFromType(lead.unitType);
  const unitBeds = unit.bedrooms ?? bedsFromType(unit.unitType);
  if (leadBeds === undefined || unitBeds === undefined) return true;
  const openEnded = /\+/.test(lead.unitType) || leadBeds >= 3;
  return openEnded ? unitBeds >= leadBeds : unitBeds === leadBeds;
}

// ─── Inbound sync ────────────────────────────────────────────────────────────

// Idempotent on leadRef: land or refresh a lead projection from the customer.
export const upsertLeadMatch = internalMutation({
  args: {
    leadRef: v.string(),
    area: v.string(),
    unitType: v.string(),
    bedrooms: v.optional(v.number()),
    budgetMin: v.number(),
    budgetMax: v.number(),
    budgetBand: v.string(),
    moveWindow: v.string(),
    depositReady: v.boolean(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("leadMatches")
      .withIndex("by_leadRef", (q) => q.eq("leadRef", args.leadRef))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("leadMatches", { ...args, createdAt: now, updatedAt: now });
  },
});

// POST /api/leads/upsert — customer pushes a lead projection (HMAC-signed).
export const leadsUpsert = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const sig = request.headers.get("x-swyft-signature") ?? "";
  const ok = await verifyHmac(raw, sig, process.env.SYNC_SHARED_SECRET ?? "");
  if (!ok) return new Response("Unauthorized", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const leadRef = String(body.leadRef ?? "");
  const area = String(body.area ?? "");
  if (!leadRef || !area) return new Response("Missing leadRef/area", { status: 400 });

  await ctx.runMutation(internal.leads.upsertLeadMatch, {
    leadRef,
    area,
    unitType: String(body.unitType ?? ""),
    bedrooms: typeof body.bedrooms === "number" ? body.bedrooms : undefined,
    budgetMin: typeof body.budgetMin === "number" ? body.budgetMin : 0,
    budgetMax: typeof body.budgetMax === "number" ? body.budgetMax : Number.MAX_SAFE_INTEGER,
    budgetBand: String(body.budgetBand ?? ""),
    moveWindow: String(body.moveWindow ?? "flexible"),
    depositReady: Boolean(body.depositReady),
    status: String(body.status ?? "open"),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

// ─── Inbound tenant response ─────────────────────────────────────────────────

// Apply a tenant's Interested / Not-this-one to the matching send row.
export const applyResponse = internalMutation({
  args: {
    leadRef: v.string(),
    externalUnitId: v.string(),
    response: v.union(v.literal("interested"), v.literal("declined")),
  },
  handler: async (ctx, { leadRef, externalUnitId, response }) => {
    const send = await ctx.db
      .query("leadSends")
      .withIndex("by_leadRef_and_unit", (q) =>
        q.eq("leadRef", leadRef).eq("unitId", externalUnitId as Id<"units">),
      )
      .first();
    if (send) await ctx.db.patch(send._id, { status: response });
  },
});

// POST /api/leads/response — customer relays a tenant's tap (HMAC-signed).
export const leadsResponse = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const sig = request.headers.get("x-swyft-signature") ?? "";
  const ok = await verifyHmac(raw, sig, process.env.SYNC_SHARED_SECRET ?? "");
  if (!ok) return new Response("Unauthorized", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const leadRef = String(body.leadRef ?? "");
  const externalUnitId = String(body.externalUnitId ?? "");
  const response = String(body.response ?? "");
  if (!leadRef || !externalUnitId || (response !== "interested" && response !== "declined")) {
    return new Response("Bad Request", { status: 400 });
  }
  await ctx.runMutation(internal.leads.applyResponse, {
    leadRef,
    externalUnitId,
    response,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

// ─── Leads page ────────────────────────────────────────────────────────────

// Leads visible to my company: only in areas where I have a building (hard
// gate), each annotated with how many of my vacant units match and how many
// sends the lead has already received (platform-wide, toward the cap of 3).
export const forMyCompany = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const myAreas = [...new Set(buildings.map((b) => b.area).filter(Boolean) as string[])];
    if (myAreas.length === 0) return { hasBuildings: buildings.length > 0, areas: [], leads: [] };

    const units = await ctx.db
      .query("units")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const vacant = units.filter((u) => u.status === "vacant");

    // Show live leads (not closed/expired) in my areas. "matched" leads stay
    // visible so I can keep sending (up to the cap) and see the tenant's reply.
    const leads: Doc<"leadMatches">[] = [];
    for (const area of myAreas) {
      for (const status of ["open", "matched"] as const) {
        const areaLeads = await ctx.db
          .query("leadMatches")
          .withIndex("by_area_and_status", (q) => q.eq("area", area).eq("status", status))
          .collect();
        leads.push(...areaLeads);
      }
    }

    const annotated = await Promise.all(
      leads.map(async (lead) => {
        const matchingUnitCount = vacant.filter((u) => unitMatches(u, lead)).length;
        const sends = await ctx.db
          .query("leadSends")
          .withIndex("by_leadRef", (q) => q.eq("leadRef", lead.leadRef))
          .collect();
        const mySends = sends.filter((s) => s.companyId === companyId);
        // Surface the tenant's response to what *I* sent.
        const myResponse: "interested" | "declined" | "pending" | null = mySends.length
          ? mySends.some((s) => s.status === "interested")
            ? "interested"
            : mySends.every((s) => s.status === "declined")
              ? "declined"
              : "pending"
          : null;

        // Viewing the tenant requested against one of *my* units, and the
        // contact grant that a confirmed viewing releases (both company-scoped).
        const myViewings = (
          await ctx.db
            .query("leadViewings")
            .withIndex("by_leadRef", (q) => q.eq("leadRef", lead.leadRef))
            .collect()
        ).filter((viw) => viw.companyId === companyId);
        const viewingStatus: "requested" | "confirmed" | "declined" | null =
          myViewings.some((viw) => viw.status === "confirmed")
            ? "confirmed"
            : myViewings.some((viw) => viw.status === "requested")
              ? "requested"
              : myViewings.length
                ? "declined"
                : null;
        const requestedViewing =
          myViewings.find((viw) => viw.status === "requested") ??
          myViewings.find((viw) => viw.status === "confirmed") ??
          null;
        const contact = await ctx.db
          .query("leadContacts")
          .withIndex("by_leadRef_and_company", (q) =>
            q.eq("leadRef", lead.leadRef).eq("companyId", companyId),
          )
          .first();

        return {
          ...lead,
          matchingUnitCount,
          sendCount: sends.length,
          iSent: mySends.length > 0,
          myResponse,
          viewingStatus,
          viewingUnitId: requestedViewing?.unitId ?? null,
          contact: contact
            ? {
                name: contact.name,
                phone: contact.phone,
                message: contact.message ?? null,
                photoUrl: contact.photoUrl ?? null,
              }
            : null,
        };
      }),
    );

    // Interested replies first, then unmatched-but-sendable, then newest.
    annotated.sort((a, b) => {
      const rank = (r: string | null) => (r === "interested" ? 2 : r === "pending" ? 1 : 0);
      return (
        rank(b.myResponse) - rank(a.myResponse) ||
        b.matchingUnitCount - a.matchingUnitCount ||
        b.createdAt - a.createdAt
      );
    });
    return { hasBuildings: true, areas: myAreas, leads: annotated };
  },
});

// My vacant units that fit a given lead — for the send drawer.
export const matchingUnitsForLead = query({
  args: { leadRef: v.string() },
  handler: async (ctx, { leadRef }) => {
    const { companyId } = await requireCompany(ctx);
    const lead = await ctx.db
      .query("leadMatches")
      .withIndex("by_leadRef", (q) => q.eq("leadRef", leadRef))
      .first();
    if (!lead) return { lead: null, units: [], sendsRemaining: 0 };

    const units = await ctx.db
      .query("units")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const buildingById = new Map(buildings.map((b) => [b._id, b]));

    const alreadySent = await ctx.db
      .query("leadSends")
      .withIndex("by_leadRef", (q) => q.eq("leadRef", leadRef))
      .collect();
    const sentUnitIds = new Set(alreadySent.map((s) => s.unitId));

    const matching = units
      .filter((u) => u.status === "vacant" && unitMatches(u, lead))
      .map((u) => ({
        _id: u._id,
        unitNumber: u.unitNumber,
        unitType: u.unitType,
        bedrooms: u.bedrooms,
        rentAmount: u.rentAmount,
        buildingName: buildingById.get(u.buildingId)?.name ?? "",
        alreadySent: sentUnitIds.has(u._id),
      }));

    return {
      lead,
      units: matching,
      sendsRemaining: Math.max(0, MAX_SENDS_PER_LEAD - alreadySent.length),
    };
  },
});

// Offer vacant units against a lead. Server-enforces the platform-wide cap of 3
// sends per lead, the area gate, ownership, vacancy, and de-dup.
export const sendUnits = mutation({
  args: { leadRef: v.string(), unitIds: v.array(v.id("units")) },
  handler: async (ctx, { leadRef, unitIds }) => {
    const { companyId } = await requireCompany(ctx);

    const lead = await ctx.db
      .query("leadMatches")
      .withIndex("by_leadRef", (q) => q.eq("leadRef", leadRef))
      .first();
    if (!lead) throw new Error("Lead not found");

    // Area gate — must own a building in the lead's area.
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    if (!buildings.some((b) => b.area === lead.area)) {
      throw new Error("This lead isn't in one of your areas.");
    }

    const existing = await ctx.db
      .query("leadSends")
      .withIndex("by_leadRef", (q) => q.eq("leadRef", leadRef))
      .collect();
    let remaining = MAX_SENDS_PER_LEAD - existing.length;
    if (remaining <= 0) {
      throw new Error("This lead has already received the maximum of 3 units.");
    }
    const sentUnitIds = new Set(existing.map((s) => s.unitId));

    const now = Date.now();
    const inserted: Id<"units">[] = [];
    for (const unitId of unitIds) {
      if (remaining <= 0) break;
      if (sentUnitIds.has(unitId)) continue;
      const unit = await ctx.db.get(unitId);
      if (!unit || unit.companyId !== companyId || unit.status !== "vacant") continue;
      if (!unitMatches(unit, lead)) continue;
      await ctx.db.insert("leadSends", {
        leadRef,
        companyId,
        unitId: unitId as Id<"units">,
        buildingId: unit.buildingId,
        status: "sent",
        createdAt: now,
      });
      sentUnitIds.add(unitId);
      inserted.push(unitId as Id<"units">);
      remaining--;
    }

    if (inserted.length > 0 && lead.status === "open") {
      await ctx.db.patch(lead._id, { status: "matched", updatedAt: now });
    }

    // Deliver these units to the tenant's Activity via a signed POST to the
    // customer backend. Fire-and-forget (mutations can't fetch); carries NO
    // contact — just the unit's public listing data, keyed by leadRef.
    if (inserted.length > 0) {
      await ctx.scheduler.runAfter(0, internal.leads.deliverOffers, {
        leadRef,
        unitIds: inserted,
      });
    }

    return { sent: inserted.length, remaining };
  },
});

// ─── Outbound delivery to the tenant's Activity ──────────────────────────────

// Public listing data for the offered units — read by the delivery action.
export const offersPayload = internalQuery({
  args: { leadRef: v.string(), unitIds: v.array(v.id("units")) },
  handler: async (ctx, { leadRef, unitIds }) => {
    const offers = [];
    for (const unitId of unitIds) {
      const unit = await ctx.db.get(unitId);
      if (!unit) continue;
      const building = await ctx.db.get(unit.buildingId);
      offers.push({
        externalUnitId: unitId as string,
        buildingName: building?.name ?? "Vacant unit",
        area: building?.area ?? "",
        unitType: unit.unitType,
        bedrooms: unit.bedrooms,
        rent: unit.rentAmount,
        amenities: building?.amenities,
        imageUrl: building?.imageUrl,
      });
    }
    return { leadRef, offers };
  },
});

// Sign + POST the offers to the customer's /api/leads/send.
export const deliverOffers = internalAction({
  args: { leadRef: v.string(), unitIds: v.array(v.id("units")) },
  handler: async (ctx, { leadRef, unitIds }) => {
    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) return;

    const payload = await ctx.runQuery(internal.leads.offersPayload, { leadRef, unitIds });
    if (payload.offers.length === 0) return;

    const body = JSON.stringify({ ...payload, ts: Date.now() });
    const signature = await hmacHex(body, secret);
    try {
      await fetch(`${url}/api/leads/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-swyft-signature": signature },
        body,
      });
    } catch {
      // Best-effort; the send is recorded even if delivery momentarily fails.
    }
  },
});

// ─── Viewing request → confirm → contact grant (rules/DATA_FLOW/leads.md §5) ──

// Land a tenant's viewing request against a unit I offered. Resolves the unit to
// its company/building locally — the inbound body carries NO PII, just refs.
export const receiveViewingRequest = internalMutation({
  args: { leadRef: v.string(), externalUnitId: v.string() },
  handler: async (ctx, { leadRef, externalUnitId }) => {
    const unit = await ctx.db.get(externalUnitId as Id<"units">);
    if (!unit) return;
    // Only accept a viewing for a unit this company actually offered to the lead.
    const send = await ctx.db
      .query("leadSends")
      .withIndex("by_leadRef_and_unit", (q) =>
        q.eq("leadRef", leadRef).eq("unitId", externalUnitId as Id<"units">),
      )
      .first();
    if (!send) return;

    const existing = await ctx.db
      .query("leadViewings")
      .withIndex("by_leadRef_and_unit", (q) =>
        q.eq("leadRef", leadRef).eq("unitId", externalUnitId as Id<"units">),
      )
      .first();
    if (existing) return; // idempotent — request already recorded
    await ctx.db.insert("leadViewings", {
      leadRef,
      unitId: externalUnitId as Id<"units">,
      companyId: send.companyId,
      buildingId: send.buildingId,
      status: "requested",
      requestedAt: Date.now(),
    });
  },
});

// POST /api/leads/viewing-request — customer relays a tenant's "book viewing".
export const leadsViewingRequest = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const sig = request.headers.get("x-swyft-signature") ?? "";
  const ok = await verifyHmac(raw, sig, process.env.SYNC_SHARED_SECRET ?? "");
  if (!ok) return new Response("Unauthorized", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const leadRef = String(body.leadRef ?? "");
  const externalUnitId = String(body.externalUnitId ?? "");
  if (!leadRef || !externalUnitId) return new Response("Bad Request", { status: 400 });
  await ctx.runMutation(internal.leads.receiveViewingRequest, { leadRef, externalUnitId });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

// Manager contact + building label to release to the tenant on confirmation.
export const viewingConfirmPayload = internalQuery({
  args: { leadRef: v.string(), unitId: v.id("units") },
  handler: async (ctx, { leadRef, unitId }) => {
    const viewing = await ctx.db
      .query("leadViewings")
      .withIndex("by_leadRef_and_unit", (q) => q.eq("leadRef", leadRef).eq("unitId", unitId))
      .first();
    if (!viewing) return null;
    const company = await ctx.db.get(viewing.companyId);
    const building = await ctx.db.get(viewing.buildingId);
    const unit = await ctx.db.get(unitId);
    return {
      leadRef,
      externalUnitId: unitId as string,
      managerName: company?.name ?? "The property manager",
      managerPhone: company?.phone ?? "",
      buildingName: building?.name ?? "",
      area: building?.area ?? "",
      unitNumber: unit?.unitNumber ?? "",
    };
  },
});

// Manager confirms a requested viewing → the §5 trigger. Marks it confirmed and
// fires the signed callback that (a) reveals my contact to the tenant and (b)
// prompts the customer to send back the tenant's contact grant.
export const confirmViewing = mutation({
  args: { leadRef: v.string(), unitId: v.id("units") },
  handler: async (ctx, { leadRef, unitId }) => {
    const { companyId } = await requireCompany(ctx);
    const viewing = await ctx.db
      .query("leadViewings")
      .withIndex("by_leadRef_and_unit", (q) => q.eq("leadRef", leadRef).eq("unitId", unitId))
      .first();
    if (!viewing) throw new Error("No viewing request for this lead.");
    if (viewing.companyId !== companyId) throw new Error("Not your viewing.");
    if (viewing.status !== "confirmed") {
      await ctx.db.patch(viewing._id, { status: "confirmed", confirmedAt: Date.now() });
    }
    await ctx.scheduler.runAfter(0, internal.leads.deliverViewingConfirmed, { leadRef, unitId });
    return { ok: true };
  },
});

// Sign + POST the confirmation (with my contact) to the customer's
// /api/leads/viewing-confirmed. Carries manager contact only — the tenant's
// contact comes back on the return leg (/api/leads/contact-grant).
export const deliverViewingConfirmed = internalAction({
  args: { leadRef: v.string(), unitId: v.id("units") },
  handler: async (ctx, { leadRef, unitId }) => {
    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) return;
    const payload = await ctx.runQuery(internal.leads.viewingConfirmPayload, { leadRef, unitId });
    if (!payload) return;
    const body = JSON.stringify({ ...payload, ts: Date.now() });
    const signature = await hmacHex(body, secret);
    try {
      await fetch(`${url}/api/leads/viewing-confirmed`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-swyft-signature": signature },
        body,
      });
    } catch {
      // Best-effort; the viewing is already marked confirmed for the manager.
    }
  },
});

// Store the tenant contact grant that a confirmed viewing releases. Scoped to
// the company whose viewing was confirmed (verified against leadViewings).
export const receiveContactGrant = internalMutation({
  args: {
    leadRef: v.string(),
    externalUnitId: v.string(),
    name: v.string(),
    phone: v.string(),
    message: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, { leadRef, externalUnitId, name, phone, message, photoUrl }) => {
    const viewing = await ctx.db
      .query("leadViewings")
      .withIndex("by_leadRef_and_unit", (q) =>
        q.eq("leadRef", leadRef).eq("unitId", externalUnitId as Id<"units">),
      )
      .first();
    // Only accept a grant for a viewing this side actually confirmed.
    if (!viewing || viewing.status !== "confirmed") return;

    const existing = await ctx.db
      .query("leadContacts")
      .withIndex("by_leadRef_and_company", (q) =>
        q.eq("leadRef", leadRef).eq("companyId", viewing.companyId),
      )
      .first();
    const fields = { name, phone, message, photoUrl, grantedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("leadContacts", {
        leadRef,
        companyId: viewing.companyId,
        ...fields,
      });
    }
  },
});

// POST /api/leads/contact-grant — customer delivers the tenant's contact after a
// confirmed viewing (the ONLY inbound call that carries house-hunter PII).
export const leadsContactGrant = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const sig = request.headers.get("x-swyft-signature") ?? "";
  const ok = await verifyHmac(raw, sig, process.env.SYNC_SHARED_SECRET ?? "");
  if (!ok) return new Response("Unauthorized", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const leadRef = String(body.leadRef ?? "");
  const externalUnitId = String(body.externalUnitId ?? "");
  const name = String(body.name ?? "");
  const phone = String(body.phone ?? "");
  if (!leadRef || !externalUnitId || !name || !phone) {
    return new Response("Bad Request", { status: 400 });
  }
  await ctx.runMutation(internal.leads.receiveContactGrant, {
    leadRef,
    externalUnitId,
    name,
    phone,
    message: typeof body.message === "string" ? body.message : undefined,
    photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : undefined,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
