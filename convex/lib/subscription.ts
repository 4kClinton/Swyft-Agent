import type { Doc } from "../_generated/dataModel";

/**
 * Subscription entitlement — the single source of truth for "is this company's
 * plan still active?", shared by the server write-guard (lib/rbac) and the
 * client paywall (components/subscription-gate). Pure & deterministic: pass in
 * the company row and `now`, get back the access state. No ctx / no I/O.
 *
 * Lifecycle: a company gets a TRIAL_DAYS free window from signup. When the paid
 * (or trial) period ends it enters a GRACE_DAYS window — still fully usable, but
 * the UI nags with a banner. After grace it is `blocked`: the client shows a
 * full-screen paywall and the server rejects writes. Renewing (Lipana STK push,
 * see subscriptions.ts) pushes `currentPeriodEnd` forward and clears the block.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;
/** A purchased "month" of subscription. */
export const MONTH_MS = 30 * DAY_MS;

export type SubscriptionPhase = "active" | "grace" | "expired";

export interface SubscriptionState {
  status: Doc<"companyAccounts">["status"];
  plan: Doc<"companyAccounts">["plan"];
  /** Epoch ms the current paid/trial period ends. */
  periodEnd: number;
  /** Epoch ms the post-expiry grace window ends (hard cutoff). */
  graceEnd: number;
  phase: SubscriptionPhase;
  /** True → show a full-screen paywall & reject writes. */
  blocked: boolean;
  /** True → still usable, but show the "renew soon" banner. */
  inGrace: boolean;
  /** On the free trial (no purchase yet). */
  isTrial: boolean;
  /** Whole days until periodEnd (negative once past). */
  daysLeft: number;
  /** Whole days until the hard cutoff (negative once past). */
  graceDaysLeft: number;
}

/** Resolve the period end for a company, defaulting legacy/new rows to a
 * TRIAL_DAYS window from creation when no explicit period has been set. */
export function periodEndFor(company: Doc<"companyAccounts">): number {
  return company.currentPeriodEnd ?? company._creationTime + TRIAL_DAYS * DAY_MS;
}

export function evaluateSubscription(
  company: Doc<"companyAccounts">,
  now: number,
): SubscriptionState {
  const periodEnd = periodEndFor(company);
  const graceEnd = periodEnd + GRACE_DAYS * DAY_MS;
  const isTrial = company.status === "trial" && company.currentPeriodEnd == null;

  let phase: SubscriptionPhase;
  if (company.status === "inactive") {
    // Admin hard-suspend — block immediately regardless of period.
    phase = "expired";
  } else if (now < periodEnd) {
    // "cancelled" still gets access until the period it already paid for ends.
    phase = "active";
  } else if (now < graceEnd) {
    phase = "grace";
  } else {
    phase = "expired";
  }

  return {
    status: company.status,
    plan: company.plan,
    periodEnd,
    graceEnd,
    phase,
    blocked: phase === "expired",
    inGrace: phase === "grace",
    isTrial,
    daysLeft: Math.ceil((periodEnd - now) / DAY_MS),
    graceDaysLeft: Math.ceil((graceEnd - now) / DAY_MS),
  };
}
