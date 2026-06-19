import { query } from "./_generated/server";
import { requireCompany } from "./lib/rbac";

/** Recent receipts for the company, with tenant joined. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(300);
    return await Promise.all(
      receipts.map(async (r) => ({
        ...r,
        tenant: await ctx.db.get(r.tenantId),
      })),
    );
  },
});
