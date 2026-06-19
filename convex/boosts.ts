import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import type { Id } from "./_generated/dataModel";

/** Create a pending boost for a listing; payment settles it via Lipana. */
export const create = mutation({
  args: {
    listingId: v.id("vacantListings"),
    amount: v.number(),
    durationDays: v.number(),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    const listing = await ctx.db.get(args.listingId);
    assertSameCompany(listing, companyId);
    if (args.amount < 10) throw new Error("Minimum boost is KES 10");

    return await ctx.db.insert("boosts", {
      companyId,
      listingId: args.listingId,
      amount: args.amount,
      durationDays: args.durationDays,
      status: "pending",
    });
  },
});

export const boostForPayment = internalQuery({
  args: { boostId: v.id("boosts") },
  handler: async (ctx, { boostId }) => {
    const boost = await ctx.db.get(boostId);
    return boost ? { amount: boost.amount } : null;
  },
});

/**
 * Kick off an STK push for a boost via Lipana (boosts/subscriptions only —
 * never rent, 1stPlan.md §4.2). reference = "boost:<boostId>" so the webhook
 * can settle it (see http.ts /api/lipana/webhook → boosts.settle).
 */
export const payWithMpesa = action({
  args: { boostId: v.id("boosts"), phone: v.string() },
  handler: async (ctx, { boostId, phone }): Promise<{ ok: boolean }> => {
    // Ownership check via query (company-scoped).
    await ctx.runQuery(api.boosts.assertOwned, { boostId });
    const boost = await ctx.runQuery(internal.boosts.boostForPayment, {
      boostId,
    });
    if (!boost) throw new Error("Boost not found");

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error(`Invalid phone "${phone}"`);

    const secret = process.env.LIPANA_SECRET_KEY;
    if (!secret) throw new Error("LIPANA_SECRET_KEY not configured");

    const resp = await fetch("https://api.lipana.dev/payments/stk-push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        phone: normalized,
        amount: boost.amount,
        reference: `boost:${boostId}`,
        description: "Swyft listing boost",
      }),
    });
    if (!resp.ok) {
      throw new Error(`Lipana STK error ${resp.status}: ${await resp.text()}`);
    }
    return { ok: true };
  },
});

export const assertOwned = query({
  args: { boostId: v.id("boosts") },
  handler: async (ctx, { boostId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(boostId), companyId);
    return true;
  },
});

/** Settle a boost once Lipana confirms payment (called from the webhook). */
export const settle = internalMutation({
  args: { boostId: v.string(), lipanaRef: v.string() },
  handler: async (ctx, { boostId, lipanaRef }) => {
    const id = ctx.db.normalizeId("boosts", boostId);
    if (!id) return;
    const boost = await ctx.db.get(id);
    if (!boost || boost.status === "active") return;

    const now = Date.now();
    await ctx.db.patch(id, {
      status: "active",
      lipanaRef,
      startsAt: now,
      endsAt: now + boost.durationDays * 24 * 60 * 60 * 1000,
    });
    // Link the active boost onto its listing.
    await ctx.db.patch(boost.listingId as Id<"vacantListings">, {
      boostId: id,
    });
    return null;
  },
});
