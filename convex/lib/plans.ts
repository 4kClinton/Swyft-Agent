/**
 * Subscription plan catalog. The plan ids here are the paid tiers offered by the
 * paywall / billing page and match the `companyAccounts.plan` literals (minus
 * "free", which is the pre-payment trial tier — not purchasable). Prices are in
 * whole KES per month. Keep this the single source of truth: the paywall,
 * billing page and the Lipana STK-push amount all read from it.
 */

export const PAID_PLAN_IDS = ["standard", "premium", "enterprise"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export interface PlanInfo {
  id: PaidPlanId;
  name: string;
  priceKes: number; // monthly, whole KES
  tagline: string;
  features: string[];
}

export const PLANS: Record<PaidPlanId, PlanInfo> = {
  standard: {
    id: "standard",
    name: "Standard",
    priceKes: 1999,
    tagline: "For small landlords or beginner property managers",
    features: [
      "Manage up to 30 units",
      "Vacant units auto-listed on Swyft",
      "Basic reports & analytics",
      "SMS & email notifications",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceKes: 3499,
    tagline: "For growing property managers",
    features: [
      "Manage up to 100 units",
      "Residential & commercial properties",
      "Advanced reports & automated rent reminders",
      "24/7 online support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceKes: 7999,
    tagline: "For large portfolios and agencies",
    features: [
      "Unlimited units",
      "Multi-branch & landlord reporting",
      "Priority support & onboarding",
      "Everything in Premium",
    ],
  },
};

export function isPaidPlan(id: string): id is PaidPlanId {
  return (PAID_PLAN_IDS as readonly string[]).includes(id);
}

export function planPriceKes(id: PaidPlanId, months: number): number {
  return PLANS[id].priceKes * Math.max(1, Math.floor(months));
}
