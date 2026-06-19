import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("inquiries")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(200);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("inquiries"),
    status: v.union(
      v.literal("new"),
      v.literal("responded"),
      v.literal("closed"),
      v.literal("spam"),
    ),
  },
  handler: async (ctx, { id, status }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, { status });
    return null;
  },
});

/**
 * Ingest an inquiry/booking that arrived from the swyft-customer backend via
 * the sync callback (1stPlan.md §3.1 step 4). Idempotent on externalRef.
 */
export const ingestFromSync = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    externalRef: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    message: v.optional(v.string()),
    listingId: v.optional(v.id("vacantListings")),
    unitId: v.optional(v.id("units")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inquiries")
      .withIndex("by_externalRef", (q) =>
        q.eq("externalRef", args.externalRef),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("inquiries", {
      companyId: args.companyId,
      fullName: args.fullName,
      phone: args.phone,
      message: args.message,
      listingId: args.listingId,
      unitId: args.unitId,
      status: "new",
      source: "sync_callback",
      externalRef: args.externalRef,
    });
  },
});
