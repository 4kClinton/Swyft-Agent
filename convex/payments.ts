import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";

/**
 * Record an observed payment from any adapter, normalised. Idempotent on `ref`
 * (banks retry). Routes to a company via the credited account, then schedules
 * async reconciliation so the IPN ack stays fast (jengaIpnSpike.md §3.3).
 */
export const recordObserved = internalMutation({
  args: {
    source: v.string(),
    ref: v.string(),
    amount: v.number(),
    currency: v.string(),
    payerPhone: v.optional(v.string()),
    payerName: v.optional(v.string()),
    account: v.optional(v.string()),
    paidAt: v.number(),
    status: v.string(),
    raw: v.any(),
  },
  handler: async (ctx, a) => {
    // Idempotency: same transaction ref → no double-count.
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_ref", (q) => q.eq("ref", a.ref))
      .unique();
    if (existing) return existing._id;

    // Route the credited account to a landlord company.
    const src = a.account
      ? await ctx.db
          .query("paymentSources")
          .withIndex("by_account", (q) => q.eq("accountNumber", a.account!))
          .first()
      : null;

    const payerPhone = a.payerPhone
      ? (normalizePhone(a.payerPhone) ?? a.payerPhone)
      : undefined;

    const paymentId = await ctx.db.insert("payments", {
      companyId: src?.companyId,
      source: a.source,
      ref: a.ref,
      amount: a.amount,
      currency: a.currency,
      payerPhone,
      payerName: a.payerName,
      account: a.account,
      paidAt: a.paidAt,
      status: a.status,
      raw: a.raw,
      matchState: "unmatched",
    });

    // Only reconcile routed, successful credits.
    if (src && /success/i.test(a.status)) {
      await ctx.scheduler.runAfter(0, internal.reconcile.match, { paymentId });
    }
    return paymentId;
  },
});

/** Live payments feed for the dashboard. */
export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const { companyId } = await requireCompany(ctx);
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(limit ?? 50);

    // Join the matched tenant for display.
    return await Promise.all(
      payments.map(async (p) => ({
        ...p,
        tenant: p.tenantId ? await ctx.db.get(p.tenantId) : null,
      })),
    );
  },
});

/** The manual-assign queue: unmatched payments needing a human. */
export const unmatched = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("payments")
      .withIndex("by_company_and_matchState", (q) =>
        q.eq("companyId", companyId).eq("matchState", "unmatched"),
      )
      .order("desc")
      .take(100);
  },
});

/**
 * Landlord assigns an unmatched payment to a tenant. Swyft permanently LEARNS
 * the phone→tenant mapping so every future payment from that phone auto-matches
 * (1stPlan.md §5.4). Then it allocates the payment to open invoices.
 */
export const manualAssign = mutation({
  args: { paymentId: v.id("payments"), tenantId: v.id("tenants") },
  handler: async (ctx, { paymentId, tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    const payment = await ctx.db.get(paymentId);
    assertSameCompany(payment, companyId);
    const tenant = await ctx.db.get(tenantId);
    assertSameCompany(tenant, companyId);

    await ctx.db.patch(paymentId, {
      matchState: "manual_matched",
      tenantId,
    });

    // Learn it — never ask again for this phone.
    if (payment!.payerPhone) {
      const learned = await ctx.db
        .query("phoneTenantMap")
        .withIndex("by_company_and_phone", (q) =>
          q.eq("companyId", companyId).eq("phone", payment!.payerPhone!),
        )
        .first();
      if (!learned) {
        await ctx.db.insert("phoneTenantMap", {
          companyId,
          phone: payment!.payerPhone!,
          tenantId,
        });
      }
    }

    // Allocate FIFO + receipt (shared engine).
    await ctx.scheduler.runAfter(0, internal.ledger.allocatePayment, {
      paymentId,
    });
    return null;
  },
});
