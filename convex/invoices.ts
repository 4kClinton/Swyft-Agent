import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

export const listByTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, { tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(tenantId), companyId);
    return await ctx.db
      .query("invoices")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .collect();
  },
});

/** All invoices for the company (most recent first) with the tenant joined. */
export const listForCompany = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(300);
    return await Promise.all(
      invoices.map(async (inv) => ({
        ...inv,
        tenant: await ctx.db.get(inv.tenantId),
      })),
    );
  },
});

/** Ad-hoc invoice: deposit / penalty / repair / water / service / other. */
export const createAdHoc = mutation({
  args: {
    tenantId: v.id("tenants"),
    kind: v.union(
      v.literal("deposit"),
      v.literal("penalty"),
      v.literal("repair"),
      v.literal("water"),
      v.literal("service"),
      v.literal("other"),
    ),
    amount: v.number(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    assertSameCompany(tenant, companyId);
    return await ctx.db.insert("invoices", {
      companyId,
      tenantId: args.tenantId,
      unitId: tenant!.unitId,
      kind: args.kind,
      description: args.description,
      amount: args.amount,
      balance: args.amount,
      dueDate: args.dueDate ?? Date.now(),
      status: "open",
    });
  },
});

export const voidInvoice = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, { status: "void", balance: 0 });
    return null;
  },
});

/**
 * Recurring-rent generator, called by the daily cron. For each active lease
 * whose billingDay matches today, generate this period's rent invoice unless
 * one already exists (idempotent on tenant+period). Batches across companies.
 */
export const generateRecurring = internalMutation({
  args: { day: v.number(), period: v.string() }, // period e.g. "2026-06"
  handler: async (ctx, { day, period }) => {
    // Leases billed today — across all companies (cron is system-wide).
    const leases = await ctx.db
      .query("leases")
      .withIndex("by_billingDay_and_status", (q) =>
        q.eq("billingDay", day).eq("status", "active"),
      )
      .take(2000);

    let created = 0;
    for (const lease of leases) {
      // Idempotency: skip if this tenant already has this period's rent.
      const dupes = await ctx.db
        .query("invoices")
        .withIndex("by_company_and_period", (q) =>
          q.eq("companyId", lease.companyId).eq("period", period),
        )
        .collect();
      if (dupes.some((d) => d.tenantId === lease.tenantId && d.kind === "rent")) {
        continue;
      }

      await ctx.db.insert("invoices", {
        companyId: lease.companyId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        unitId: lease.unitId,
        period,
        kind: "rent",
        description: `Rent for ${period}`,
        amount: lease.rentAmount,
        balance: lease.rentAmount,
        dueDate: Date.now(),
        status: "open",
      });
      created++;
    }
    return { created };
  },
});
