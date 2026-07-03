import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { cleanUnitNumber } from "./lib/importSchema";

const unitStatus = v.union(
  v.literal("vacant"),
  v.literal("occupied"),
  v.literal("maintenance"),
  v.literal("reserved"),
);

export const listByBuilding = query({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(buildingId), companyId);
    return await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
  },
});

export const listForCompany = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("units")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
  },
});

export const create = mutation({
  args: {
    buildingId: v.id("buildings"),
    unitNumber: v.string(),
    unitType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    rentAmount: v.number(),
    depositAmount: v.optional(v.number()),
    status: v.optional(unitStatus),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(args.buildingId), companyId);
    const { status, ...rest } = args;
    return await ctx.db.insert("units", {
      companyId,
      status: status ?? "vacant",
      ...rest,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("units"),
    unitNumber: v.optional(v.string()),
    unitType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    rentAmount: v.optional(v.number()),
    depositAmount: v.optional(v.number()),
    status: v.optional(unitStatus),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("units") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.delete(id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Named vacant-unit roster (Phase 1). Imports only materialise *occupied* units
// (one per tenant), so a building has no record of its vacant units by name.
// `rosterContext` snapshots what we know for the AI; `inferRoster`
// (vacancyRoster.ts) proposes the full naming scheme; the PM confirms; then
// `materialiseVacantRoster` writes the missing units as `vacant`. Occupied units
// are never touched — capture-before-interpret, never lose data.
// ---------------------------------------------------------------------------

/** Snapshot a building's known units + mix for the roster-inference action. */
export const rosterContext = internalQuery({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    const building = await ctx.db.get(buildingId);
    if (!building) return null;
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    return {
      companyId: building.companyId,
      name: building.name,
      totalUnits: building.totalUnits,
      unitMix: building.unitMix ?? [],
      units: units.map((u) => ({
        unitNumber: u.unitNumber,
        unitType: u.unitType,
        status: u.status,
      })),
    };
  },
});

/**
 * Materialise a PM-confirmed roster: insert any unit numbers that don't yet
 * exist as `vacant`. Matching is by normalised unit number (case-insensitive)
 * so we never duplicate or overwrite an occupied unit. Rent defaults to the
 * building's unit-mix rent for that type, else 0 (set later).
 */
export const materialiseVacantRoster = mutation({
  args: {
    buildingId: v.id("buildings"),
    units: v.array(
      v.object({
        unitNumber: v.string(),
        unitType: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { buildingId, units }) => {
    const { companyId } = await requireCompany(ctx);
    const building = await ctx.db.get(buildingId);
    assertSameCompany(building, companyId);

    const existing = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    const seen = new Set(
      existing.map((u) => cleanUnitNumber(u.unitNumber).toLowerCase()),
    );
    const rentForType = new Map(
      (building!.unitMix ?? []).map((m) => [m.type, m.rent ?? 0]),
    );

    let created = 0;
    for (const u of units) {
      const clean = cleanUnitNumber(u.unitNumber);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      await ctx.db.insert("units", {
        companyId,
        buildingId,
        unitNumber: clean,
        unitType: u.unitType,
        rentAmount: (u.unitType && rentForType.get(u.unitType)) || 0,
        status: "vacant",
      });
      created++;
    }
    return { created };
  },
});
