import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendAtSms } from "./lib/comms";
import type { Id } from "./_generated/dataModel";

/** Generic SMS send via Africa's Talking. `to` should be 2547… (no +). */
export const sendSms = internalAction({
  args: { to: v.string(), message: v.string() },
  handler: async (ctx, { to, message }): Promise<boolean> => {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    if (!username || !apiKey) return false;
    return await sendAtSms({
      username,
      apiKey,
      senderId: process.env.AT_SENDER_ID,
      to: to.startsWith("+") ? to : `+${to}`,
      message,
    });
  },
});

/** Context the SMS action needs (actions have no db access). */
export const receiptContext = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const receipt = await ctx.db
      .query("receipts")
      .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
      .first();
    if (!receipt) return null;
    const tenant = await ctx.db.get(receipt.tenantId);
    if (!tenant) return null;
    return {
      receiptId: receipt._id,
      number: receipt.number,
      amount: receipt.amount,
      phone: tenant.phone,
      tenantName: tenant.fullName,
    };
  },
});

export const markReceiptSms = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    smsState: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { receiptId, smsState }) => {
    await ctx.db.patch(receiptId, { smsState });
    return null;
  },
});

/**
 * Send an SMS receipt via Africa's Talking. Fire-and-forget; failures mark the
 * receipt `failed` for retry. Skips gracefully if AT isn't configured yet so
 * reconciliation still works before the SMS sender is wired (Part H #3).
 */
export const sendReceipt = internalAction({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const info = await ctx.runQuery(internal.sms.receiptContext, { paymentId });
    if (!info) return;

    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    const senderId = process.env.AT_SENDER_ID;
    if (!username || !apiKey) {
      // Not configured yet — leave pending so it can be retried later.
      return;
    }

    const message =
      `Payment received: KES ${info.amount.toLocaleString()}. ` +
      `Receipt ${info.number}. Thank you, ${info.tenantName}. — via Swyft`;

    try {
      const body = new URLSearchParams({
        username,
        to: "+" + info.phone,
        message,
        ...(senderId ? { from: senderId } : {}),
      });
      const resp = await fetch(
        "https://api.africastalking.com/version1/messaging",
        {
          method: "POST",
          headers: {
            apiKey,
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body,
        },
      );
      await ctx.runMutation(internal.sms.markReceiptSms, {
        receiptId: info.receiptId as Id<"receipts">,
        smsState: resp.ok ? "sent" : "failed",
      });
    } catch {
      await ctx.runMutation(internal.sms.markReceiptSms, {
        receiptId: info.receiptId as Id<"receipts">,
        smsState: "failed",
      });
    }
  },
});
