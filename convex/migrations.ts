import { internalMutation } from "./_generated/server";

/**
 * One-off migration for the owner→landlord rename + company `kind` backfill.
 *
 * Run once against the deployment after deploying the schema/code:
 *   npx convex run migrations:migrateOwnerToLandlord
 *
 * After it reports done across all environments, remove the transitional
 * `v.literal("owner")` from `roleValidator` (schema.ts) and the `owner` entry
 * from `ROLE_RANK` (lib/rbac.ts).
 */
export const migrateOwnerToLandlord = internalMutation({
  args: {},
  handler: async (ctx) => {
    let rolesUpdated = 0;
    for (const profile of await ctx.db.query("profiles").collect()) {
      if ((profile.role as string) === "owner") {
        await ctx.db.patch(profile._id, { role: "landlord" });
        rolesUpdated++;
      }
    }

    let companiesUpdated = 0;
    for (const company of await ctx.db.query("companyAccounts").collect()) {
      if (company.kind === undefined) {
        await ctx.db.patch(company._id, { kind: "landlord" });
        companiesUpdated++;
      }
    }

    return { rolesUpdated, companiesUpdated };
  },
});

/**
 * One-off: stamp every EXISTING paymentSources row as status="verified" so the
 * ownership gate (lib/paymentSource.ts:isVerifiedSource) can be made fail-closed
 * WITHOUT breaking the live (Munchez bootstrap) pipeline.
 *
 * DEPLOY SEQUENCE — order is load-bearing:
 *   1. Deploy the code that adds the optional `status` field + this migration,
 *      while isVerifiedSource STILL grandfathers `undefined` as verified.
 *   2. Run, per environment:  npx convex run migrations:backfillPaymentSourceStatus
 *   3. ONLY THEN deploy the follow-up commit that flips isVerifiedSource to
 *      require status === "verified" exactly (removing the grandfather).
 * Running step 3 before step 2 completes would stop the live source from routing.
 *
 * Idempotent: only patches rows that have no `status` yet, so re-running is safe.
 */
export const backfillPaymentSourceStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const src of await ctx.db.query("paymentSources").collect()) {
      if (src.status === undefined) {
        await ctx.db.patch(src._id, {
          status: "verified",
          verificationMethod: "admin_manual",
          verifiedAt: src.authorisedAt ?? src._creationTime,
        });
        updated++;
      }
    }
    return { updated };
  },
});
