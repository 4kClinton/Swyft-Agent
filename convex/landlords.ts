import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

const reportChannelValidator = v.union(
  v.literal("email"),
  v.literal("whatsapp"),
  v.literal("sms"),
);
const reportCadenceValidator = v.union(
  v.literal("monthly"),
  v.literal("quarterly"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("landlords")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("landlords") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const landlord = await ctx.db.get(id);
    assertSameCompany(landlord, companyId);
    return landlord;
  },
});

/** Buildings owned by a given landlord (for the landlord detail view). */
export const buildingsForLandlord = query({
  args: { id: v.id("landlords") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    return await ctx.db
      .query("buildings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", id))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    kraPin: v.optional(v.string()),
    nextOfKinName: v.optional(v.string()),
    nextOfKinPhone: v.optional(v.string()),
    reportChannel: v.optional(reportChannelValidator),
    reportCadence: v.optional(reportCadenceValidator),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    if (!args.name.trim()) {
      throw new Error("Landlord name is required");
    }
    return await ctx.db.insert("landlords", {
      companyId,
      status: "active",
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("landlords"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    kraPin: v.optional(v.string()),
    nextOfKinName: v.optional(v.string()),
    nextOfKinPhone: v.optional(v.string()),
    reportChannel: v.optional(reportChannelValidator),
    reportCadence: v.optional(reportCadenceValidator),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("landlords") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    // Refuse to delete a landlord that still owns buildings — reassign first.
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", id))
      .take(1);
    if (buildings.length > 0) {
      throw new Error("Reassign this landlord's buildings before deleting");
    }
    await ctx.db.delete(id);
    return null;
  },
});
