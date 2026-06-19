import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireCompany, requireRole, assertSameCompany } from "./lib/rbac";
import type { Id } from "./_generated/dataModel";

export const listListings = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const listings = await ctx.db
      .query("vacantListings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .collect();
    return await Promise.all(
      listings.map(async (l) => {
        const building = await ctx.db.get(l.buildingId);
        const boost = l.boostId ? await ctx.db.get(l.boostId) : null;
        const boosted =
          !!boost &&
          boost.status === "active" &&
          (!boost.endsAt || boost.endsAt > Date.now());
        return { ...l, buildingName: building?.name ?? "—", boost, boosted };
      }),
    );
  },
});

/**
 * Advertise a vacant unit by type (issue #6/#11): not tied to a named unit.
 * One listing per (building, type) — reused if it already exists.
 */
export const createTypeListing = mutation({
  args: {
    buildingId: v.id("buildings"),
    unitType: v.string(),
    rentAmount: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    availableFrom: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"vacantListings">> => {
    const { companyId } = await requireCompany(ctx);
    const building = await ctx.db.get(args.buildingId);
    assertSameCompany(building, companyId);

    const externalRef = `type_${args.buildingId}_${args.unitType}`;
    const existing = await ctx.db
      .query("vacantListings")
      .withIndex("by_externalRef", (q) => q.eq("externalRef", externalRef))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        rentAmount: args.rentAmount,
        title: args.title,
        description: args.description,
        availableFrom: args.availableFrom,
      });
      return existing._id;
    }

    return await ctx.db.insert("vacantListings", {
      companyId,
      buildingId: args.buildingId,
      unitType: args.unitType,
      title: args.title,
      description: args.description,
      availableFrom: args.availableFrom,
      rentAmount: args.rentAmount,
      externalRef,
      status: "draft",
    });
  },
});

/**
 * "List on Swyft": create (or reuse) a draft listing for a vacant unit. One
 * unit → at most one listing. The push to swyft-customer happens via the
 * `publish` action below (idempotent on externalRef).
 */
export const createListing = mutation({
  args: {
    unitId: v.id("units"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    availableFrom: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    const unit = await ctx.db.get(args.unitId);
    assertSameCompany(unit, companyId);

    const existing = await ctx.db
      .query("vacantListings")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("vacantListings", {
      companyId,
      unitId: args.unitId,
      buildingId: unit!.buildingId,
      title: args.title,
      description: args.description,
      availableFrom: args.availableFrom,
      rentAmount: unit!.rentAmount,
      externalRef: `unit_${args.unitId}`,
      status: "draft",
    });
  },
});

/** Internal: snapshot a listing for the publish action (no db in actions). */
export const listingForPublish = internalQuery({
  args: { listingId: v.id("vacantListings") },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return null;
    const building = await ctx.db.get(listing.buildingId);
    return {
      externalRef: listing.externalRef,
      title: listing.title ?? building?.name ?? "Vacant unit",
      rentAmount: listing.rentAmount,
      description: listing.description,
      availableFrom: listing.availableFrom,
      city: building?.city,
      latitude: building?.latitude,
      longitude: building?.longitude,
    };
  },
});

export const markPublished = internalMutation({
  args: {
    listingId: v.id("vacantListings"),
    reelId: v.optional(v.string()),
    status: v.union(v.literal("published"), v.literal("error")),
    syncError: v.optional(v.string()),
  },
  handler: async (ctx, { listingId, reelId, status, syncError }) => {
    await ctx.db.patch(listingId, {
      status,
      reelId,
      syncError,
      lastSyncedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Push a listing to the swyft-customer backend (1stPlan.md §3.1). One-way +
 * idempotent on externalRef; HMAC-signed shared secret. Stores the returned
 * reelId. Manager+ only.
 */
export const publish = action({
  args: { listingId: v.id("vacantListings") },
  handler: async (ctx, { listingId }): Promise<{ ok: boolean; reelId?: string }> => {
    // Authorise via a query that enforces role + company ownership.
    await ctx.runQuery(api.marketplace.assertCanPublish, { listingId });

    const snap = await ctx.runQuery(internal.marketplace.listingForPublish, {
      listingId,
    });
    if (!snap) throw new Error("Listing not found");

    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) {
      throw new Error("CUSTOMER_BACKEND_URL / SYNC_SHARED_SECRET not configured");
    }

    const body = JSON.stringify(snap);
    const signature = await hmacHex(body, secret);
    try {
      const resp = await fetch(`${url}/api/listings/upsert`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-swyft-signature": signature,
        },
        body,
      });
      if (!resp.ok) throw new Error(`customer backend ${resp.status}`);
      const data = await resp.json();
      await ctx.runMutation(internal.marketplace.markPublished, {
        listingId,
        reelId: data.reelId ? String(data.reelId) : undefined,
        status: "published",
      });
      return { ok: true, reelId: data.reelId };
    } catch (e) {
      await ctx.runMutation(internal.marketplace.markPublished, {
        listingId,
        status: "error",
        syncError: String(e),
      });
      throw e;
    }
  },
});

/** Authorisation guard used by the publish action. */
export const assertCanPublish = query({
  args: { listingId: v.id("vacantListings") },
  handler: async (ctx, { listingId }) => {
    const profile = await requireRole(ctx, "manager");
    const listing = await ctx.db.get(listingId);
    assertSameCompany(listing, profile.companyId);
    return true;
  },
});

/** Inbound sync callback handler (status change / inquiry). */
export const handleCallback = internalMutation({
  args: {
    externalRef: v.string(),
    kind: v.string(),
    reelId: v.optional(v.string()),
    status: v.optional(v.string()),
    inquiry: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db
      .query("vacantListings")
      .withIndex("by_externalRef", (q) =>
        q.eq("externalRef", args.externalRef),
      )
      .first();
    if (!listing) return;

    if (args.kind === "status" && args.status === "taken") {
      await ctx.db.patch(listing._id, { status: "taken" });
    }
    if (args.kind === "inquiry" && args.inquiry) {
      await ctx.runMutation(internal.inquiries.ingestFromSync, {
        companyId: listing.companyId,
        externalRef: `inq_${args.inquiry.id ?? args.externalRef}_${Date.now()}`,
        fullName: String(args.inquiry.fullName ?? "Renter"),
        phone: args.inquiry.phone ? String(args.inquiry.phone) : undefined,
        message: args.inquiry.message ? String(args.inquiry.message) : undefined,
        listingId: listing._id,
        unitId: listing.unitId as Id<"units">,
      });
    }
  },
});

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
