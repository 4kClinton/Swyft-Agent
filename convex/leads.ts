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
        return {
          ...lead,
          matchingUnitCount,
          sendCount: sends.length,
          iSent: mySends.length > 0,
          myResponse,
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
