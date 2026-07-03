"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Jenga API "Get Transaction Details" — verify-back (anti-forgery defence).
//
// SEPARATE from the IPN Basic Auth. Jenga's API authenticates with an API key
// PLUS an RSA-SHA256 signature over a documented field concatenation, against the
// Taleel-owned Jenga *API* app (not yet provisioned). This module is the swappable
// seam: `getTransactionDetails` is the interface; the real signed call drops in
// here without touching recordObserved.
//
// Required env (all must be set for the call to be attempted — see README):
//   JENGA_API_BASE_URL          e.g. https://api.finserve.africa
//   JENGA_API_KEY               Api-Key header
//   JENGA_API_MERCHANT_CODE     merchant/account code used in the signature
//   JENGA_API_PRIVATE_KEY       PEM RSA private key for the signature
//
// INVARIANT: this is READ-ONLY (a status query). It must NEVER move money.
// ---------------------------------------------------------------------------

type VerifyBackResult =
  | { outcome: "confirmed" }
  | { outcome: "not_found" }
  | { outcome: "unconfigured" }
  | { outcome: "error"; message: string };

/**
 * Confirm a transaction exists on Jenga's side. STUB: until the Taleel-owned
 * Jenga API app + RSA signature are wired and tested, this returns a non-confirmed
 * result so the caller fails safe to needs_review. Do NOT make this return
 * "confirmed" until it actually performs the signed query and validates the
 * response (amount/currency/ref) against `args`.
 */
async function getTransactionDetails(args: {
  reference: string;
  amount: number;
  currency: string;
  paidAt: number;
}): Promise<VerifyBackResult> {
  void args;
  const baseUrl = process.env.JENGA_API_BASE_URL;
  const apiKey = process.env.JENGA_API_KEY;
  const merchantCode = process.env.JENGA_API_MERCHANT_CODE;
  const privateKey = process.env.JENGA_API_PRIVATE_KEY;
  if (!baseUrl || !apiKey || !merchantCode || !privateKey) {
    return { outcome: "unconfigured" };
  }

  // TODO(taleel-jenga): implement the real signed query, e.g.:
  //   1. signature = RSA-SHA256(privateKey, `${merchantCode}${reference}${amount}`)
  //   2. GET `${baseUrl}/.../transaction-status` with headers
  //        { "Api-Key": apiKey, signature, "Content-Type": "application/json" }
  //   3. map HTTP 200 + matching amount/currency/ref → "confirmed"; 404 →
  //      "not_found"; anything else → { outcome: "error" }.
  // Until implemented AND tested against the live Taleel app, fail safe:
  return { outcome: "error", message: "verify-back not implemented yet" };
}

/**
 * Verify-back then reconcile. Scheduled by recordObserved only when verify-back
 * is required AND the Jenga API creds are present. On "confirmed" we hand off to
 * the normal matcher; on anything else we park the payment in needs_review and
 * NEVER auto-reconcile.
 */
export const verifyBackThenReconcile = internalAction({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const pay = await ctx.runQuery(internal.payments.getForVerifyBack, {
      paymentId,
    });
    if (!pay || pay.matchState !== "unmatched") return; // gone or already handled

    const res = await getTransactionDetails({
      reference: pay.ref,
      amount: pay.amount,
      currency: pay.currency,
      paidAt: pay.paidAt,
    });

    if (res.outcome === "confirmed") {
      await ctx.runMutation(internal.reconcile.match, { paymentId });
    } else {
      await ctx.runMutation(internal.payments.markNeedsReview, { paymentId });
    }
  },
});
