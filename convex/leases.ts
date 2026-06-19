import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

export const listByTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, { tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(tenantId), companyId);
    return await ctx.db
      .query("leases")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect();
  },
});

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    unitId: v.id("units"),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    rentAmount: v.number(),
    depositAmount: v.optional(v.number()),
    billingDay: v.number(),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(args.tenantId), companyId);
    assertSameCompany(await ctx.db.get(args.unitId), companyId);
    if (args.billingDay < 1 || args.billingDay > 28) {
      throw new Error("billingDay must be 1–28");
    }

    // A unit can only have one active tenant (issue #4).
    const occupants = await ctx.db
      .query("tenants")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .collect();
    const clash = occupants.find(
      (t) => t._id !== args.tenantId && t.status === "active",
    );
    if (clash) {
      throw new Error(
        `That unit is already assigned to ${clash.fullName}. A unit can only have one active tenant.`,
      );
    }

    const leaseId = await ctx.db.insert("leases", {
      companyId,
      ...args,
      status: "active",
    });
    // Mark the unit occupied and link the tenant.
    await ctx.db.patch(args.unitId, { status: "occupied" });
    await ctx.db.patch(args.tenantId, {
      unitId: args.unitId,
      status: "active",
    });
    return leaseId;
  },
});

export const end = mutation({
  args: { id: v.id("leases") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const lease = await ctx.db.get(id);
    assertSameCompany(lease, companyId);
    await ctx.db.patch(id, { status: "ended", endDate: Date.now() });
    await ctx.db.patch(lease!.unitId, { status: "vacant" });
    return null;
  },
});
