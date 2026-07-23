import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { evaluateSubscription } from "./subscription";

/**
 * Function-level RBAC — Convex's equivalent of RLS. EVERY query/mutation that
 * touches company data must call requireProfile() and then scope all reads to
 * the returned companyId. Derive identity server-side only (never trust a
 * companyId/userId passed as an argument). See stepByStepPlan.md Phase 1.
 */

export type Role = Doc<"profiles">["role"];

const ROLE_RANK: Record<Role, number> = {
  agent: 1,
  manager: 2,
  landlord: 3,
  owner: 3, // transitional alias for landlord; remove after the owner→landlord migration
};

export type Ctx = QueryCtx | MutationCtx;

/** The authenticated profile, or throw. The single source of companyId. */
export async function requireProfile(ctx: Ctx): Promise<Doc<"profiles">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new Error("No profile for authenticated user");
  return profile;
}

/** Profile + the companyId you should scope every query to. */
export async function requireCompany(
  ctx: Ctx,
): Promise<{ profile: Doc<"profiles">; companyId: Id<"companyAccounts"> }> {
  const profile = await requireProfile(ctx);
  return { profile, companyId: profile.companyId };
}

/**
 * Defense-in-depth paywall guard for WRITE mutations: throw if the caller's
 * company subscription has lapsed past its grace window. The client already
 * hard-blocks the UI (components/subscription-gate), but a lapsed company must
 * never be able to mutate data via a stale tab or direct API call. Read paths
 * are intentionally NOT guarded — expired companies keep read-only access.
 *
 * Grace-period companies (inGrace) are still allowed to write. Call this in the
 * mutation right after resolving `companyId`.
 */
export async function requireActiveSubscription(
  ctx: Ctx,
  companyId: Id<"companyAccounts">,
): Promise<Doc<"companyAccounts">> {
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  const sub = evaluateSubscription(company, Date.now());
  if (sub.blocked) {
    throw new Error(
      "Your subscription has expired. Please renew your plan to continue.",
    );
  }
  return company;
}

/** requireCompany + the paywall write-guard in one call, for mutations. */
export async function requireActiveCompany(
  ctx: Ctx,
): Promise<{ profile: Doc<"profiles">; companyId: Id<"companyAccounts"> }> {
  const { profile, companyId } = await requireCompany(ctx);
  await requireActiveSubscription(ctx, companyId);
  return { profile, companyId };
}

/** Throw unless the profile's role meets the minimum (owner > manager > agent). */
export async function requireRole(ctx: Ctx, min: Role): Promise<Doc<"profiles">> {
  const profile = await requireProfile(ctx);
  if (profile.isCompanyOwner) return profile; // owner bypasses
  if (ROLE_RANK[profile.role] < ROLE_RANK[min]) {
    throw new Error(`Requires role ${min} or higher`);
  }
  return profile;
}

/**
 * Assert a document belongs to the caller's company. Use after ctx.db.get()
 * on any record fetched by id, since ids are not company-scoped by themselves.
 */
export function assertSameCompany(
  doc: { companyId?: Id<"companyAccounts"> } | null,
  companyId: Id<"companyAccounts">,
): void {
  if (!doc || doc.companyId !== companyId) {
    throw new Error("Not found or not authorised");
  }
}

/**
 * Guard for the /platform area: the caller must be a Swyft platform admin.
 * This is a cross-company super-admin (see profiles.isPlatformAdmin) and is
 * unrelated to company `role` — it is never granted by self-service sign-up.
 * Grant it with the `platformAdmin.grantPlatformAdmin` internal mutation.
 */
export async function requirePlatformAdmin(ctx: Ctx): Promise<Doc<"profiles">> {
  const profile = await requireProfile(ctx);
  if (!profile.isPlatformAdmin) {
    throw new Error("Requires platform admin");
  }
  return profile;
}

/**
 * Guard for the /admin (team management) area: the caller's company must be a
 * property manager, and the caller must be at least a manager. Landlords have
 * no admin section. Returns the profile + companyId for scoping.
 */
export async function requirePropertyManager(
  ctx: Ctx,
): Promise<{ profile: Doc<"profiles">; companyId: Id<"companyAccounts"> }> {
  const profile = await requireProfile(ctx);
  const company = await ctx.db.get(profile.companyId);
  if (company?.kind !== "property_manager") {
    throw new Error("Admin is only available to property managers");
  }
  // Within a PM company, only managers (incl. the company owner) administer the team.
  if (!profile.isCompanyOwner && ROLE_RANK[profile.role] < ROLE_RANK["manager"]) {
    throw new Error("Requires manager role");
  }
  return { profile, companyId: profile.companyId };
}
