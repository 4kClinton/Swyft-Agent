import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireProfile } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import { initiateStkPush } from "./lib/lipana";
import { evaluateSubscription, MONTH_MS } from "./lib/subscription";
import { PLANS, PAID_PLAN_IDS, isPaidPlan, planPriceKes, type PaidPlanId } from "./lib/plans";
import type { Id } from "./_generated/dataModel";

const paidPlanValidator = v.union(
  v.literal("standard"),
  v.literal("premium"),
  v.literal("enterprise"),
);

/**
 * Billing state for the signed-in company: the entitlement evaluation plus the
 * purchasable plan catalog. Drives the /billing page and the paywall. Never
 * throws for a merely-lapsed company (they must still be able to renew).
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const company = await ctx.db.get(profile.companyId);
    if (!company) return null;
    return {
      subscription: evaluateSubscription(company, Date.now()),
      isCompanyOwner: profile.isCompanyOwner,
      companyPhone: company.phone ?? null,
      plans: PAID_PLAN_IDS.map((id) => PLANS[id]),
    };
  },
});

/** Owner-only context resolver for the renewal action (which can't touch the db). */
export const renewalContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    if (!profile.isCompanyOwner) {
      throw new Error("Only the company owner can manage billing");
    }
    const company = await ctx.db.get(profile.companyId);
    if (!company) throw new Error("Company not found");
    return { companyId: company._id, phone: company.phone ?? null };
  },
});

/**
 * Kick off an M-Pesa STK push (via Lipana) to renew the company subscription.
 * Lipana has no reference passthrough, so we record a `paymentIntents` row
 * keyed by the returned checkoutRequestId; the Lipana webhook (http.ts
 * /api/lipana/webhook) reconciles it → subscriptions.settle. Lipana is for
 * boosts & subscriptions ONLY, never rent (1stPlan.md §4.2).
 */
export const startRenewal = action({
  args: {
    plan: paidPlanValidator,
    phone: v.string(),
    months: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { plan, phone, months },
  ): Promise<{ ok: boolean; intentId: Id<"paymentIntents"> }> => {
    const period = Math.max(1, Math.floor(months ?? 1));
    const { companyId } = await ctx.runQuery(
      internal.subscriptions.renewalContext,
      {},
    );

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error(`Invalid M-Pesa phone "${phone}"`);

    const amount = planPriceKes(plan as PaidPlanId, period);

    const { transactionId, checkoutRequestId } = await initiateStkPush(
      normalized,
      amount,
    );

    // Return the intent id so the client can watch its status reactively
    // (paymentIntents.status) and tell the user when the webhook settles it.
    const intentId = await ctx.runMutation(internal.paymentIntents.create, {
      kind: "subscription",
      companyId,
      checkoutRequestId,
      transactionId,
      amount,
      plan,
      months: period,
    });
    return { ok: true, intentId };
  },
});

/**
 * Settle a subscription renewal once Lipana confirms payment (called from the
 * webhook). Extends `currentPeriodEnd` by `months` from whichever is later —
 * now or the existing period end (so early renewals stack, don't truncate) —
 * activates the company and switches it to the paid plan. Idempotent on the
 * Lipana ref so a re-delivered webhook can't double-extend.
 */
export const settle = internalMutation({
  args: {
    companyId: v.string(),
    plan: v.string(),
    months: v.number(),
    lipanaRef: v.string(),
  },
  handler: async (ctx, { companyId, plan, months, lipanaRef }) => {
    const id = ctx.db.normalizeId("companyAccounts", companyId);
    if (!id) return null;
    const company = await ctx.db.get(id);
    if (!company) return null;
    // Idempotency: ignore a webhook we've already applied.
    if (company.lastPaymentRef === lipanaRef) return null;

    const now = Date.now();
    const period = Math.max(1, Math.floor(months));
    const base = Math.max(now, company.currentPeriodEnd ?? 0);
    const nextPlan = isPaidPlan(plan)
      ? (plan as PaidPlanId)
      : company.plan;

    await ctx.db.patch(id, {
      currentPeriodEnd: base + period * MONTH_MS,
      status: "active",
      plan: nextPlan,
      lastPaymentRef: lipanaRef,
    });
    return null;
  },
});

/**
 * Platform-admin / CLI escape hatch to grant or extend a subscription without a
 * live payment (comped accounts, support, testing). Internal only, e.g.:
 *
 *   npx convex run subscriptions:grant '{"companyId":"...","plan":"premium","months":1}'
 */
export const grant = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    plan: v.optional(paidPlanValidator),
    months: v.number(),
  },
  handler: async (ctx, { companyId, plan, months }) => {
    const company = await ctx.db.get(companyId as Id<"companyAccounts">);
    if (!company) throw new Error("Company not found");
    const now = Date.now();
    const base = Math.max(now, company.currentPeriodEnd ?? 0);
    await ctx.db.patch(companyId, {
      currentPeriodEnd: base + Math.max(1, Math.floor(months)) * MONTH_MS,
      status: "active",
      ...(plan ? { plan } : {}),
    });
    return null;
  },
});
