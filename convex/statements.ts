import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

/**
 * Full tenant statement: invoices + payments + allocations + running balance,
 * for the one-click PDF and dispute resolution (1stPlan.md §5.6).
 */
export const tenantStatement = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, { tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    const tenant = await ctx.db.get(tenantId);
    assertSameCompany(tenant, companyId);

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(1000);
    const tenantPayments = payments.filter((p) => p.tenantId === tenantId);

    const totalBilled = invoices.reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices
      .filter((i) => i.status !== "void")
      .reduce((s, i) => s + i.balance, 0);
    const totalPaid = tenantPayments.reduce((s, p) => s + p.amount, 0);

    return {
      tenant,
      invoices: invoices.sort((a, b) => a.dueDate - b.dueDate),
      payments: tenantPayments,
      summary: { totalBilled, totalPaid, outstanding },
    };
  },
});

/**
 * Arrears + aging buckets (0–30 / 31–60 / 60+ days) per tenant for the
 * who's-late board (1stPlan.md §5.5–5.6).
 */
export const arrearsAging = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const open = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();

    const byTenant = new Map<
      string,
      { tenantId: string; bucket0: number; bucket30: number; bucket60: number; total: number }
    >();

    for (const inv of open) {
      if (inv.status === "void" || inv.status === "paid" || inv.balance <= 0) {
        continue;
      }
      const ageDays = (now - inv.dueDate) / DAY;
      const key = inv.tenantId;
      const row =
        byTenant.get(key) ??
        { tenantId: key, bucket0: 0, bucket30: 0, bucket60: 0, total: 0 };
      if (ageDays <= 30) row.bucket0 += inv.balance;
      else if (ageDays <= 60) row.bucket30 += inv.balance;
      else row.bucket60 += inv.balance;
      row.total += inv.balance;
      byTenant.set(key, row);
    }

    return Array.from(byTenant.values()).sort((a, b) => b.total - a.total);
  },
});
