import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Allocate a matched payment to that tenant's open invoices oldest-first
 * (FIFO). Supports partial payments and overpayment (the remainder becomes
 * tenant credit, stored on the payment as `unallocated`). Idempotent: if the
 * payment already has allocations it does nothing. On completion it issues a
 * sequential receipt and schedules an SMS receipt. (1stPlan.md §5.5)
 */
export const allocatePayment = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const pay = await ctx.db.get(paymentId);
    if (!pay || !pay.tenantId || !pay.companyId) return;
    const { companyId, tenantId } = { companyId: pay.companyId, tenantId: pay.tenantId };

    // Idempotency: don't re-allocate.
    const already = await ctx.db
      .query("allocations")
      .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
      .first();
    if (already) return;

    // Oldest open + partial invoices first.
    const open = await ctx.db
      .query("invoices")
      .withIndex("by_tenant_and_status", (q) =>
        q.eq("tenantId", tenantId).eq("status", "open"),
      )
      .collect();
    const partial = await ctx.db
      .query("invoices")
      .withIndex("by_tenant_and_status", (q) =>
        q.eq("tenantId", tenantId).eq("status", "partial"),
      )
      .collect();
    const invoices = [...open, ...partial].sort((a, b) => a.dueDate - b.dueDate);

    let remaining = pay.amount;
    const allocatedInvoiceIds: Id<"invoices">[] = [];

    for (const inv of invoices) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, inv.balance);
      if (applied <= 0) continue;

      await ctx.db.insert("allocations", {
        companyId,
        paymentId,
        invoiceId: inv._id,
        tenantId,
        amount: applied,
      });
      const newBalance = inv.balance - applied;
      await ctx.db.patch(inv._id, {
        balance: newBalance,
        status: newBalance <= 0 ? "paid" : "partial",
      });
      allocatedInvoiceIds.push(inv._id);
      remaining -= applied;
    }

    // Overpayment / no open invoices → tenant credit.
    await ctx.db.patch(paymentId, {
      unallocated: remaining > 0 ? remaining : 0,
    });

    // Receipt with a per-company sequential number.
    const number = await nextReceiptNumber(ctx, companyId);
    const receiptId = await ctx.db.insert("receipts", {
      companyId,
      number,
      paymentId,
      tenantId,
      amount: pay.amount,
      invoiceIds: allocatedInvoiceIds,
      smsState: "pending",
    });

    // Deliver the receipt outside the transaction: SMS (Africa's Talking) and,
    // when the tenant has an email on file, a branded PDF receipt via Resend.
    await ctx.scheduler.runAfter(0, internal.sms.sendReceipt, { paymentId });
    await ctx.scheduler.runAfter(0, internal.documents.sendReceiptEmail, {
      receiptId,
    });
  },
});

/** Monotonic per-company receipt counter — avoids count() scans. */
async function nextReceiptNumber(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
): Promise<string> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_company_and_name", (q) =>
      q.eq("companyId", companyId).eq("name", "receipt"),
    )
    .unique();
  let next: number;
  if (counter) {
    next = counter.value + 1;
    await ctx.db.patch(counter._id, { value: next });
  } else {
    next = 1;
    await ctx.db.insert("counters", { companyId, name: "receipt", value: next });
  }
  return `SW-${String(next).padStart(6, "0")}`;
}
