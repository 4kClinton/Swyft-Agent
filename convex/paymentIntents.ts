import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireCompany } from "./lib/rbac";

/**
 * Pending Lipana STK-push payments. Because Lipana has no reference passthrough
 * (see lib/lipana.ts), we record an intent when we start a push and reconcile it
 * in the webhook (http.ts /api/lipana/webhook). The primary match key is the
 * Lipana `transactionId` (the checkoutRequestId is often absent on the ACK).
 */

/** Record a pending payment intent right after a successful STK push. */
export const create = internalMutation({
  args: {
    kind: v.union(v.literal("subscription"), v.literal("boost")),
    companyId: v.id("companyAccounts"),
    transactionId: v.optional(v.string()),
    checkoutRequestId: v.optional(v.string()),
    amount: v.number(),
    plan: v.optional(v.string()),
    months: v.optional(v.number()),
    boostId: v.optional(v.id("boosts")),
  },
  handler: async (ctx, args) => {
    // Drop empty match keys so the (unique) index lookups can't collide on "".
    const { checkoutRequestId, transactionId, ...rest } = args;
    return await ctx.db.insert("paymentIntents", {
      ...rest,
      ...(transactionId ? { transactionId } : {}),
      ...(checkoutRequestId ? { checkoutRequestId } : {}),
      status: "pending",
    });
  },
});

/** Look up an intent by its Lipana transactionId (primary webhook match). */
export const byTransaction = internalQuery({
  args: { transactionId: v.string() },
  handler: async (ctx, { transactionId }) => {
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
      .unique();
  },
});

/** Look up an intent by its M-Pesa checkoutRequestId (fallback match). */
export const byCheckout = internalQuery({
  args: { checkoutRequestId: v.string() },
  handler: async (ctx, { checkoutRequestId }) => {
    return await ctx.db
      .query("paymentIntents")
      .withIndex("by_checkoutRequestId", (q) =>
        q.eq("checkoutRequestId", checkoutRequestId),
      )
      .unique();
  },
});

/**
 * Reactive, company-scoped status of a payment intent. The client watches this
 * after starting an STK push; when the Lipana webhook flips the row to
 * "settled"/"failed" this query re-runs and the UI updates. Returns null if the
 * intent doesn't belong to the caller's company (or doesn't exist).
 */
export const status = query({
  args: { id: v.id("paymentIntents") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const intent = await ctx.db.get(id);
    if (!intent || intent.companyId !== companyId) return null;
    return { status: intent.status, kind: intent.kind };
  },
});

/** Flip an intent's status once the webhook has (or hasn't) settled it. */
export const mark = internalMutation({
  args: {
    id: v.id("paymentIntents"),
    status: v.union(v.literal("settled"), v.literal("failed")),
    transactionId: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, transactionId }) => {
    await ctx.db.patch(id, {
      status,
      ...(transactionId ? { transactionId } : {}),
    });
    return null;
  },
});
