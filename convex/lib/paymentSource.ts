import type { Doc } from "../_generated/dataModel";

/**
 * A payment source may OBSERVE-route, backfill, and reconcile payments ONLY once
 * its ownership has been verified (see paymentSources.ts verification flow).
 *
 * Legacy rows created before the verification flow have no `status` field and are
 * grandfathered as verified, so the existing (Munchez bootstrap) pipeline keeps
 * working with zero downtime. A migration will set those rows to an explicit
 * "verified". Every NEW row is inserted as "pending" and must be proven first.
 *
 * SECURITY: routing (payments.recordObserved), the orphan backfill, and the
 * clash-guard lock all gate on this — a "pending" or "rejected" source must
 * never receive, claim, or reconcile money.
 */
export function isVerifiedSource(
  src: Pick<Doc<"paymentSources">, "status">,
): boolean {
  return src.status === undefined || src.status === "verified";
}
