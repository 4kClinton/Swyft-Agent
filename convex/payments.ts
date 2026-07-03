import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import { isVerifiedSource } from "./lib/paymentSource";

// Mirror the first ~50 raw payloads per adapter into ipnDebug (diagnostic).
const IPN_DEBUG_CAP = 50;

/**
 * Whether an observed credit must pass verify-back (Jenga "Get Transaction
 * Details") before we auto-reconcile it. Jenga-only (its IPN has no payload
 * signature); the floor is JENGA_VERIFYBACK_MIN_KES (default 0 ⇒ always).
 */
function verifyBackRequired(source: string, amount: number): boolean {
  if (source !== "jenga") return false;
  const raw = process.env.JENGA_VERIFYBACK_MIN_KES;
  const min = raw === undefined || raw === "" ? 0 : Number(raw);
  return amount >= (Number.isFinite(min) ? min : 0);
}

/** Are the Jenga query-API credentials (key + merchant + RSA key) all present? */
function jengaApiConfigured(): boolean {
  return Boolean(
    process.env.JENGA_API_KEY &&
      process.env.JENGA_API_MERCHANT_CODE &&
      process.env.JENGA_API_PRIVATE_KEY,
  );
}

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

    // Diagnostic capture (TEMPORARY): mirror the first ~50 raw payloads per
    // adapter so we can confirm WHICH field actually carries the account number
    // and whether the stored `ref` is one a landlord could supply (resolves the
    // recent-credit vs statement-upload question). Capped per adapter, after the
    // dedupe check so bank retries don't burn the budget. Not company-scoped.
    const captured = await ctx.db
      .query("ipnDebug")
      .withIndex("by_source", (q) => q.eq("source", a.source))
      .take(IPN_DEBUG_CAP);
    if (captured.length < IPN_DEBUG_CAP) {
      await ctx.db.insert("ipnDebug", {
        source: a.source,
        extractedAccount: a.account,
        raw: a.raw,
      });
    }

    // Route the credited account to a landlord company — but ONLY to a VERIFIED
    // source. Multiple PENDING claims may now coexist on one number, so we must
    // not use .first(); we select the one whose ownership has been proven. No
    // verified owner ⇒ leave the payment unrouted (companyId null) and reconcile
    // nothing. (Legacy sources are grandfathered verified, so the live pipeline
    // keeps routing with zero downtime.)
    const src = a.account
      ? ((
          await ctx.db
            .query("paymentSources")
            .withIndex("by_account", (q) => q.eq("accountNumber", a.account!))
            .take(100)
        ).find(isVerifiedSource) ?? null)
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

    // Only reconcile routed, successful credits. For Jenga (no payload signature),
    // gate auto-reconcile on verify-back as anti-forgery defence-in-depth.
    if (src && /success/i.test(a.status)) {
      if (verifyBackRequired(a.source, a.amount)) {
        if (jengaApiConfigured()) {
          // Confirm the transaction with Jenga's query API before reconciling.
          await ctx.scheduler.runAfter(
            0,
            internal.jengaApi.verifyBackThenReconcile,
            { paymentId },
          );
        } else {
          // Can't confirm yet (creds unwired) ⇒ hold for a human, NEVER
          // auto-reconcile a possibly-forged credit.
          await ctx.db.patch(paymentId, { matchState: "needs_review" });
        }
      } else {
        await ctx.scheduler.runAfter(0, internal.reconcile.match, { paymentId });
      }
    }
    return paymentId;
  },
});

/** Minimal payment projection the verify-back action needs (avoids over-reading). */
export const getForVerifyBack = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const p = await ctx.db.get(paymentId);
    if (!p) return null;
    return {
      ref: p.ref,
      amount: p.amount,
      currency: p.currency,
      paidAt: p.paidAt,
      matchState: p.matchState,
    };
  },
});

/** Park a payment in the needs-review queue (verify-back couldn't confirm it). */
export const markNeedsReview = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const p = await ctx.db.get(paymentId);
    if (!p || p.matchState !== "unmatched") return; // don't clobber a real match
    await ctx.db.patch(paymentId, { matchState: "needs_review" });
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
