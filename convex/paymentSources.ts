import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCompany, requireRole, assertSameCompany } from "./lib/rbac";
import { adapterValidator } from "./schema";
import { isVerifiedSource } from "./lib/paymentSource";

// Verification challenge tuning.
const VERIFY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_MAX_ATTEMPTS = 5; // per claim, per window

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const sources = await ctx.db
      .query("paymentSources")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return await Promise.all(
      sources.map(async (s) => ({
        ...s,
        building: s.buildingId ? await ctx.db.get(s.buildingId) : null,
      })),
    );
  },
});

/**
 * Connect a payment source — the make-or-break onboarding step (5A.1 step 3).
 * Records the read-only authorisation (Part F).
 *
 * SECURITY (account ownership): a claim does NOT take effect immediately. The
 * source is inserted as status="pending", active=false and routes/backfills/
 * reconciles NOTHING until ownership is proven via the verification flow (see
 * `verifyByRecentCredit`). This prevents the land-grab where the first claimant
 * locks an account number and vacuums up its historical payments.
 *
 * Clash guard: ONLY a VERIFIED source locks an accountNumber. Multiple PENDING
 * claims on the same number may coexist — verification decides the true owner
 * (and auto-rejects the losers).
 *
 * Returns a structured result so the UI can message accurately:
 *   { id, status, created }
 * `created: false` means we returned an existing claim (idempotent), not a new one.
 */
export const connect = mutation({
  args: {
    adapter: adapterValidator,
    accountNumber: v.string(),
    paybill: v.optional(v.string()),
    label: v.optional(v.string()),
    buildingId: v.optional(v.id("buildings")),
  },
  handler: async (ctx, args) => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;

    // Normalise so " 102030404 " and "102030404" don't become distinct claims.
    const accountNumber = args.accountNumber.trim();
    if (!accountNumber) throw new Error("Account number is required");

    if (args.buildingId) {
      assertSameCompany(await ctx.db.get(args.buildingId), companyId);
    }

    // All existing claims on this account number. Bounded: realistically a
    // handful of companies could ever claim the same number.
    const claims = await ctx.db
      .query("paymentSources")
      .withIndex("by_account", (q) => q.eq("accountNumber", accountNumber))
      .take(100);

    // A VERIFIED owner locks the number. Same-company → idempotent no-op;
    // different company → hard stop (the real owner already proved it).
    const verifiedOwner = claims.find(isVerifiedSource);
    if (verifiedOwner) {
      if (verifiedOwner.companyId === companyId) {
        return { id: verifiedOwner._id, status: "verified" as const, created: false };
      }
      throw new Error(
        "That account number is already verified by another company",
      );
    }

    // Don't let one company stack duplicate pending claims on the same number.
    const ownPending = claims.find(
      (s) => s.companyId === companyId && s.status === "pending",
    );
    if (ownPending) {
      return { id: ownPending._id, status: "pending" as const, created: false };
    }

    // Insert as an UNVERIFIED claim. Inactive + pending ⇒ recordObserved will
    // not route to it, and there is no orphan backfill here — that runs only
    // AFTER verification flips status to "verified".
    const sourceId = await ctx.db.insert("paymentSources", {
      companyId,
      buildingId: args.buildingId,
      adapter: args.adapter,
      accountNumber,
      paybill: args.paybill?.trim() || undefined,
      label: args.label?.trim() || undefined,
      active: false,
      status: "pending",
      authorisedBy: profile._id,
      authorisedAt: Date.now(),
    });

    return { id: sourceId, status: "pending" as const, created: true };
  },
});

// Result of a verification attempt. We RETURN these (never throw) for any
// outcome that must persist state — in Convex a thrown error rolls back the
// whole transaction, which would silently discard the attempt counter, the
// rate-limit lock, and the race-loser rejection.
type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "failed" | "claimed_elsewhere" };

/**
 * Verify ownership by confirming a recent real credit (the FAST PATH).
 *
 * NOTE: this path can only succeed once we've already OBSERVED an unrouted credit
 * on the account — which depends on the unresolved PGW-vs-account-alerts question
 * (whether IPNs fire for a landlord's OWN account) and on the observed ref being
 * one the landlord can supply. Until ipnDebug confirms both, statement-upload
 * (approveVerificationManually) is the DEFAULT v0 path; do NOT surface this in the
 * onboarding UI yet.
 *
 * DESIGN (deliberately zero-knowledge): we NEVER show the claimant any observed
 * amount or reference. The real owner already knows them from their own bank
 * SMS / statement, so they must SUPPLY the exact amount AND reference of a recent
 * credit. A non-owner who only knows the account number cannot. On failure we
 * reveal nothing about which field was wrong.
 */
export const verifyByRecentCredit = mutation({
  args: {
    sourceId: v.id("paymentSources"),
    amount: v.number(),
    reference: v.string(),
  },
  handler: async (ctx, args): Promise<VerifyOutcome> => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;

    const source = await ctx.db.get(args.sourceId);
    assertSameCompany(source, companyId); // exists + same company (safe to throw: no writes yet)
    if (source!.status !== "pending") {
      throw new Error("This claim is not awaiting verification");
    }

    const now = Date.now();

    // --- Rate limit (per claim) -------------------------------------------
    // Scoped to this pending claim, NOT globally per account number. Two reasons:
    // (1) the exact-reference requirement makes brute force impractical regardless;
    // (2) a global per-account counter would let any one actor lock the real owner
    //     out of verifying (a DoS) by burning the budget with bad guesses. A
    //     multi-company attacker getting 5×N attempts is the accepted trade-off.
    if (source!.verifyLockedUntil && source!.verifyLockedUntil > now) {
      return { ok: false, reason: "rate_limited" };
    }
    let windowStart = source!.verifyWindowStart ?? now;
    let attempts = source!.verifyAttempts ?? 0;
    if (now - windowStart > VERIFY_WINDOW_MS) {
      windowStart = now; // window rolled over
      attempts = 0;
    }
    if (attempts >= VERIFY_MAX_ATTEMPTS) {
      // RETURN (don't throw) so the lock actually commits.
      await ctx.db.patch(args.sourceId, {
        verifyWindowStart: windowStart,
        verifyAttempts: attempts,
        verifyLockedUntil: now + VERIFY_WINDOW_MS,
      });
      return { ok: false, reason: "rate_limited" };
    }

    // --- The challenge: match an observed, still-unrouted credit ----------
    const suppliedRef = args.reference.trim().toLowerCase();
    const candidates = await ctx.db
      .query("payments")
      .withIndex("by_account", (q) =>
        q.eq("account", source!.accountNumber),
      )
      .order("desc")
      .take(200);
    const match = candidates.find(
      (p) =>
        p.companyId === undefined && // still unclaimed
        /success/i.test(p.status) &&
        Math.abs(p.amount - args.amount) < 0.01 &&
        p.ref.trim().toLowerCase() === suppliedRef,
    );

    if (!match) {
      // RETURN (don't throw) so the attempt increment actually commits.
      // Generic failure — do NOT reveal which field was wrong.
      await ctx.db.patch(args.sourceId, {
        verifyWindowStart: windowStart,
        verifyAttempts: attempts + 1,
      });
      return { ok: false, reason: "failed" };
    }

    return await finalizeVerification(ctx, source!, "recent_credit");
  },
});

/**
 * Statement-upload + manual approval — the DEFAULT v0 verification path. Modelled
 * as an internal mutation invoked by an operator after reviewing an uploaded
 * statement (`npx convex run paymentSources:approveVerificationManually
 * '{"sourceId":"..."}'`), so it stays out of the public API until a platform-admin
 * role exists.
 */
export const approveVerificationManually = internalMutation({
  args: { sourceId: v.id("paymentSources") },
  handler: async (ctx, { sourceId }): Promise<VerifyOutcome> => {
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("Source not found");
    if (source.status !== "pending") {
      throw new Error("This claim is not awaiting verification");
    }
    return await finalizeVerification(ctx, source, "statement_upload");
  },
});

/**
 * Atomically promote a pending claim to the verified owner of its account number,
 * reject all rival pending claims, and run the gated backfill. Caller must have
 * already confirmed `source.status === "pending"`. Safe because Convex runs each
 * mutation as a serialised transaction.
 *
 * Returns the outcome (never throws on the race branch) so the loser's rejection
 * commits instead of being rolled back.
 */
async function finalizeVerification(
  ctx: MutationCtx,
  source: Doc<"paymentSources">,
  method: "recent_credit" | "statement_upload" | "admin_manual",
): Promise<VerifyOutcome> {
  const now = Date.now();

  // Re-check the race: did a verified owner appear since this claim was created?
  const claims = await ctx.db
    .query("paymentSources")
    .withIndex("by_account", (q) =>
      q.eq("accountNumber", source.accountNumber),
    )
    .take(100);
  const otherVerified = claims.find(
    (c) => c._id !== source._id && isVerifiedSource(c),
  );
  if (otherVerified) {
    // Someone else already proved ownership — reject this claim and RETURN so the
    // rejection persists (a throw would roll it back, leaving it stuck "pending").
    await ctx.db.patch(source._id, { status: "rejected", active: false });
    return { ok: false, reason: "claimed_elsewhere" };
  }

  // Lock ownership for this claim.
  await ctx.db.patch(source._id, {
    status: "verified",
    active: true,
    verifiedAt: now,
    verificationMethod: method,
    verifyLockedUntil: undefined,
  });

  // Auto-reject every OTHER pending claim on the same number.
  for (const c of claims) {
    if (c._id !== source._id && c.status === "pending") {
      await ctx.db.patch(c._id, { status: "rejected", active: false });
    }
  }

  // Gated backfill (moved out of connect()): route the previously-observed,
  // still-unrouted payments into this company and reconcile the successful ones.
  const orphans = await ctx.db
    .query("payments")
    .withIndex("by_account", (q) => q.eq("account", source.accountNumber))
    .take(500);
  for (const p of orphans) {
    if (p.companyId) continue;
    await ctx.db.patch(p._id, { companyId: source.companyId });
    if (/success/i.test(p.status)) {
      await ctx.scheduler.runAfter(0, internal.reconcile.match, {
        paymentId: p._id,
      });
    }
  }

  return { ok: true };
}

/** Link (or unlink) a connected source to a building. */
export const setBuilding = mutation({
  args: {
    id: v.id("paymentSources"),
    buildingId: v.optional(v.id("buildings")),
  },
  handler: async (ctx, { id, buildingId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    if (buildingId) {
      assertSameCompany(await ctx.db.get(buildingId), companyId);
    }
    await ctx.db.patch(id, { buildingId });
    return null;
  },
});

export const setActive = mutation({
  args: { id: v.id("paymentSources"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, { active });
    return null;
  },
});
