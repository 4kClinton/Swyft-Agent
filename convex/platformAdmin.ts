import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requirePlatformAdmin } from "./lib/rbac";

/**
 * Cross-company super-admin functions for the Swyft platform team. Unlike
 * `admin.ts` (which is scoped to a single property-manager company), everything
 * here aggregates across ALL companies and is gated by `requirePlatformAdmin`.
 *
 * A company's subscription lives on `companyAccounts` as `plan` (free/standard/
 * premium/enterprise) + `status` (active/trial/inactive/cancelled). We treat
 * active + trial as "active" subscriptions and inactive + cancelled as
 * "inactive" for the headline numbers, and also return the full breakdown.
 */

/**
 * Whether the signed-in user is a platform admin. Returns `false` (never
 * throws) so the client can gate the /platform route without a server error.
 */
export const amIPlatformAdmin = query({
  args: {},
  handler: async (ctx) => {
    try {
      await requirePlatformAdmin(ctx);
      return true;
    } catch {
      return false;
    }
  },
});

/**
 * Platform-wide metrics for the admin dashboard: user count, subscription
 * breakdown, vacancy counts and a per-company roster. Platform admins only.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);

    const [companies, profiles, units, listings, tenants, buildings] =
      await Promise.all([
        ctx.db.query("companyAccounts").collect(),
        ctx.db.query("profiles").collect(),
        ctx.db.query("units").collect(),
        ctx.db.query("vacantListings").collect(),
        ctx.db.query("tenants").collect(),
        ctx.db.query("buildings").collect(),
      ]);

    // --- Users --------------------------------------------------------------
    const platformAdmins = profiles.filter((p) => p.isPlatformAdmin).length;

    // --- Subscriptions (by company) ----------------------------------------
    const subStatus = { active: 0, trial: 0, inactive: 0, cancelled: 0 };
    const plan = { free: 0, standard: 0, premium: 0, enterprise: 0 };
    const kind = { landlord: 0, property_manager: 0 };
    for (const c of companies) {
      subStatus[c.status] += 1;
      plan[c.plan] += 1;
      // Legacy rows without `kind` are treated as landlords.
      kind[c.kind ?? "landlord"] += 1;
    }
    const activeSubscriptions = subStatus.active + subStatus.trial;
    const inactiveSubscriptions = subStatus.inactive + subStatus.cancelled;

    // --- Units / vacancy ----------------------------------------------------
    const unitStatus = { vacant: 0, occupied: 0, maintenance: 0, reserved: 0 };
    for (const u of units) unitStatus[u.status] += 1;
    const publishedListings = listings.filter(
      (l) => l.status === "published",
    ).length;

    // --- Tenants ------------------------------------------------------------
    const activeTenants = tenants.filter((t) => t.status === "active").length;

    // --- Per-company roster (most recent first) -----------------------------
    const unitsByCompany = new Map<string, number>();
    const vacantByCompany = new Map<string, number>();
    for (const u of units) {
      unitsByCompany.set(u.companyId, (unitsByCompany.get(u.companyId) ?? 0) + 1);
      if (u.status === "vacant") {
        vacantByCompany.set(
          u.companyId,
          (vacantByCompany.get(u.companyId) ?? 0) + 1,
        );
      }
    }
    const membersByCompany = new Map<string, number>();
    for (const p of profiles) {
      membersByCompany.set(
        p.companyId,
        (membersByCompany.get(p.companyId) ?? 0) + 1,
      );
    }

    const companyRoster = companies
      .slice()
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((c) => ({
        id: c._id,
        name: c.name,
        kind: c.kind ?? "landlord",
        plan: c.plan,
        status: c.status,
        createdAt: c._creationTime,
        members: membersByCompany.get(c._id) ?? 0,
        units: unitsByCompany.get(c._id) ?? 0,
        vacantUnits: vacantByCompany.get(c._id) ?? 0,
      }));

    return {
      users: {
        total: profiles.length,
        platformAdmins,
      },
      companies: {
        total: companies.length,
        byKind: kind,
      },
      subscriptions: {
        active: activeSubscriptions,
        inactive: inactiveSubscriptions,
        byStatus: subStatus,
        byPlan: plan,
      },
      units: {
        total: units.length,
        ...unitStatus,
        publishedListings,
      },
      tenants: {
        total: tenants.length,
        active: activeTenants,
      },
      buildings: { total: buildings.length },
      companyRoster,
    };
  },
});

/**
 * Grant platform-admin to the user with `email`. Internal — run it from the CLI
 * to bootstrap the first admin, e.g.:
 *
 *   npx convex run platformAdmin:grantPlatformAdmin '{"email":"you@example.com"}'
 *
 * The user must already have signed up (so their auth user + profile exist).
 */
export const grantPlatformAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalised = email.trim().toLowerCase();
    const user = (await ctx.db.query("users").collect()).find(
      (u) => (u as { email?: string }).email?.toLowerCase() === normalised,
    );
    if (!user) throw new Error(`No user with email ${normalised}`);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error(`No profile for ${normalised}`);
    await ctx.db.patch(profile._id, { isPlatformAdmin: true });
    return { profileId: profile._id, email: normalised };
  },
});

/** Revoke platform-admin from the user with `email`. Internal (CLI) only. */
export const revokePlatformAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalised = email.trim().toLowerCase();
    const user = (await ctx.db.query("users").collect()).find(
      (u) => (u as { email?: string }).email?.toLowerCase() === normalised,
    );
    if (!user) throw new Error(`No user with email ${normalised}`);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error(`No profile for ${normalised}`);
    await ctx.db.patch(profile._id, { isPlatformAdmin: false });
    return { profileId: profile._id, email: normalised };
  },
});
