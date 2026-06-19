import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Match an observed payment to a tenant, in order of confidence (1stPlan §5.4):
 *   1. learned phone → tenant (phoneTenantMap; strongest, self-improving)
 *   2. tenant.phone direct lookup
 *   3. payer name (fuzzy) confirmed by amount ≈ an open invoice
 * No confident match → stays "unmatched" for the manual-assign queue.
 * On a match it auto-matches, learns, and triggers FIFO allocation + receipt.
 */
export const match = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const pay = await ctx.db.get(paymentId);
    if (!pay || pay.matchState !== "unmatched" || !pay.companyId) return;
    const companyId = pay.companyId;

    let tenantId: Id<"tenants"> | null = null;

    // 1) Learned phone → tenant. Use .first() (not .unique()) so a stray
    // duplicate map row can't throw and abort the whole match.
    if (pay.payerPhone) {
      const learned = await ctx.db
        .query("phoneTenantMap")
        .withIndex("by_company_and_phone", (q) =>
          q.eq("companyId", companyId).eq("phone", pay.payerPhone!),
        )
        .first();
      if (learned) tenantId = learned.tenantId;
    }

    // 2) Direct tenant.phone lookup.
    if (!tenantId && pay.payerPhone) {
      const t = await ctx.db
        .query("tenants")
        .withIndex("by_company_and_phone", (q) =>
          q.eq("companyId", companyId).eq("phone", pay.payerPhone!),
        )
        .first();
      if (t) {
        tenantId = t._id;
        // Learn it for next time — but only if not already mapped, so the
        // table can't accumulate duplicate (company, phone) rows.
        const existing = await ctx.db
          .query("phoneTenantMap")
          .withIndex("by_company_and_phone", (q) =>
            q.eq("companyId", companyId).eq("phone", pay.payerPhone!),
          )
          .first();
        if (!existing) {
          await ctx.db.insert("phoneTenantMap", {
            companyId,
            phone: pay.payerPhone,
            tenantId: t._id,
          });
        }
      }
    }

    // 3) Fuzzy name + amount ≈ an open invoice (single unambiguous candidate).
    if (!tenantId && pay.payerName) {
      const candidate = await matchByNameAndAmount(
        ctx,
        companyId,
        pay.payerName,
        pay.amount,
      );
      if (candidate) tenantId = candidate;
    }

    if (!tenantId) return; // leave for manual queue

    await ctx.db.patch(paymentId, { matchState: "auto_matched", tenantId });
    await ctx.scheduler.runAfter(0, internal.ledger.allocatePayment, {
      paymentId,
    });
  },
});

async function matchByNameAndAmount(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  payerName: string,
  amount: number,
): Promise<Id<"tenants"> | null> {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  const payTokens = new Set(norm(payerName));
  if (payTokens.size === 0) return null;

  const tenants = await ctx.db
    .query("tenants")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(1000);

  const matches: Id<"tenants">[] = [];
  for (const t of tenants) {
    const tTokens = norm(t.fullName);
    // require at least two shared name tokens (first + last) to be confident
    const shared = tTokens.filter((x) => payTokens.has(x)).length;
    if (shared < 2) continue;

    // Confirm by amount ≈ one of the tenant's open invoices (±1 KES).
    const open = await ctx.db
      .query("invoices")
      .withIndex("by_tenant_and_status", (q) =>
        q.eq("tenantId", t._id).eq("status", "open"),
      )
      .take(50);
    const partial = await ctx.db
      .query("invoices")
      .withIndex("by_tenant_and_status", (q) =>
        q.eq("tenantId", t._id).eq("status", "partial"),
      )
      .take(50);
    const amountOk = [...open, ...partial].some(
      (inv) => Math.abs(inv.balance - amount) <= 1,
    );
    if (amountOk) matches.push(t._id);
  }

  // Only auto-match when exactly one tenant fits — otherwise it's ambiguous.
  return matches.length === 1 ? matches[0] : null;
}
