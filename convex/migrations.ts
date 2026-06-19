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
