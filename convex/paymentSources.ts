import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCompany, requireRole, assertSameCompany } from "./lib/rbac";
import { adapterValidator } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const sources = await ctx.db
      .query("paymentSources")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return await Promise.all(
      sources.map(async (s) => ({
        ...s,
        building: s.buildingId ? await ctx.db.get(s.buildingId) : null,
      })),
    );
  },
});

/**
 * Connect a payment source — the make-or-break onboarding step (5A.1 step 3).
 * Records the read-only authorisation (Part F). The accountNumber is what
 * routes inbound payments to this company.
 */
export const connect = mutation({
  args: {
    adapter: adapterValidator,
    accountNumber: v.string(),
    paybill: v.optional(v.string()),
    label: v.optional(v.string()),
    buildingId: v.optional(v.id("buildings")),
  },
  handler: async (ctx, args) => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;

    if (args.buildingId) {
      assertSameCompany(await ctx.db.get(args.buildingId), companyId);
    }

    // Guard: an account number must map to exactly one company.
    const clash = await ctx.db
      .query("paymentSources")
      .withIndex("by_account", (q) =>
        q.eq("accountNumber", args.accountNumber),
      )
      .first();
    if (clash && clash.companyId !== companyId) {
      throw new Error("That account number is already connected elsewhere");
    }

    const sourceId = await ctx.db.insert("paymentSources", {
      companyId,
      buildingId: args.buildingId,
      adapter: args.adapter,
      accountNumber: args.accountNumber,
      paybill: args.paybill,
      label: args.label,
      active: true,
      authorisedBy: profile._id,
      authorisedAt: Date.now(),
    });

    // Backfill: route any previously-observed payments into this account that
    // arrived before the source was connected, then reconcile the successful
    // ones. Without this they'd stay unrouted (companyId null) and invisible.
    const orphans = await ctx.db
      .query("payments")
      .withIndex("by_account", (q) => q.eq("account", args.accountNumber))
      .take(500);
    for (const p of orphans) {
      if (p.companyId) continue;
      await ctx.db.patch(p._id, { companyId });
      if (/success/i.test(p.status)) {
        await ctx.scheduler.runAfter(0, internal.reconcile.match, {
          paymentId: p._id,
        });
      }
    }

    return sourceId;
  },
});

/** Link (or unlink) a connected source to a building. */
export const setBuilding = mutation({
  args: {
    id: v.id("paymentSources"),
    buildingId: v.optional(v.id("buildings")),
  },
  handler: async (ctx, { id, buildingId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    if (buildingId) {
      assertSameCompany(await ctx.db.get(buildingId), companyId);
    }
    await ctx.db.patch(id, { buildingId });
    return null;
  },
});

export const setActive = mutation({
  args: { id: v.id("paymentSources"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, { active });
    return null;
  },
});
