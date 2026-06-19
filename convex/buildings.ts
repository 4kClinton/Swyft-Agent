import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

const unitMixValidator = v.array(
  v.object({
    type: v.string(),
    count: v.number(),
    rent: v.optional(v.number()),
  }),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("buildings") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const building = await ctx.db.get(id);
    assertSameCompany(building, companyId);
    return building;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    description: v.optional(v.string()),
    propertyType: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("commercial"),
        v.literal("mixed"),
      ),
    ),
    caretakerName: v.string(),
    caretakerPhone: v.string(),
    totalUnits: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    amenities: v.optional(v.array(v.string())),
    unitMix: v.optional(unitMixValidator),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    if (!args.caretakerName.trim() || !args.caretakerPhone.trim()) {
      throw new Error("Caretaker name and phone are required");
    }
    return await ctx.db.insert("buildings", { companyId, ...args });
  },
});

export const update = mutation({
  args: {
    id: v.id("buildings"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    description: v.optional(v.string()),
    caretakerName: v.optional(v.string()),
    caretakerPhone: v.optional(v.string()),
    totalUnits: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    amenities: v.optional(v.array(v.string())),
    unitMix: v.optional(unitMixValidator),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("buildings") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    // Refuse to delete a building that still has units.
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .take(1);
    if (units.length > 0) {
      throw new Error("Remove or reassign units before deleting this building");
    }
    await ctx.db.delete(id);
    return null;
  },
});
