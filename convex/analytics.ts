import { query } from "./_generated/server";
import { requireCompany } from "./lib/rbac";
import type { Id } from "./_generated/dataModel";

/** Headline dashboard stats for the landlord home screen. */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);

    const units = await ctx.db
      .query("units")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const notices = await ctx.db
      .query("notices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(500);
    const leases = await ctx.db
      .query("leases")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const recentInquiriesList = await ctx.db
      .query("inquiries")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(100);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentInquiries = recentInquiriesList.filter(
      (i) => i._creationTime >= weekAgo,
    ).length;

    const occupied = units.filter((u) => u.status === "occupied").length;
    const vacant = units.filter((u) => u.status === "vacant").length;
    const monthlyRevenue = leases
      .filter((l) => l.status === "active")
      .reduce((s, l) => s + l.rentAmount, 0);

    const billed = invoices
      .filter((i) => i.status !== "void")
      .reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices
      .filter((i) => i.status !== "void")
      .reduce((s, i) => s + i.balance, 0);
    const collected = billed - outstanding;

    return {
      totalBuildings: buildings.length,
      totalUnits: units.length,
      occupiedUnits: occupied,
      vacantUnits: vacant,
      occupancyRate: units.length ? occupied / units.length : 0,
      totalTenants: tenants.length,
      totalNotices: notices.length,
      recentInquiries,
      monthlyRevenue,
      billed,
      collected,
      outstanding,
      collectionRate: billed ? collected / billed : 0,
    };
  },
});

/**
 * Pending invoices = open or partial with a remaining balance. These are the
 * reconciliation engine's outstanding side; paid/void invoices drop off.
 * Oldest due first. (Issue #3)
 */
export const pendingInvoices = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(1000);
    const pending = invoices.filter(
      (i) => (i.status === "open" || i.status === "partial") && i.balance > 0,
    );
    const withTenant = await Promise.all(
      pending.map(async (inv) => ({
        _id: inv._id,
        kind: inv.kind,
        description: inv.description,
        period: inv.period,
        amount: inv.amount,
        balance: inv.balance,
        dueDate: inv.dueDate,
        status: inv.status,
        tenant: await ctx.db.get(inv.tenantId),
      })),
    );
    return withTenant.sort((a, b) => a.dueDate - b.dueDate).slice(0, 200);
  },
});

/**
 * Tenants who are chronically late: more than one overdue invoice. Feeds the
 * "who's-late" board (1stPlan.md §5.6).
 */
export const chronicLate = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const now = Date.now();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();

    const overdueByTenant = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status === "void" || inv.balance <= 0) continue;
      if (inv.dueDate < now) {
        overdueByTenant.set(
          inv.tenantId,
          (overdueByTenant.get(inv.tenantId) ?? 0) + 1,
        );
      }
    }

    const result = [];
    for (const [tenantId, overdueCount] of overdueByTenant) {
      if (overdueCount < 2) continue;
      const tenant = await ctx.db.get(tenantId as Id<"tenants">);
      result.push({ tenant, overdueCount });
    }
    return result.sort((a, b) => b.overdueCount - a.overdueCount);
  },
});
