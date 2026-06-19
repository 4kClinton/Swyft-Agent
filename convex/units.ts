import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

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
