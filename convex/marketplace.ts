import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireCompany, requireRole, assertSameCompany } from "./lib/rbac";
import { hmacHex } from "./lib/hmac";
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
    const unit = listing.unitId ? await ctx.db.get(listing.unitId) : null;
    const company = await ctx.db.get(listing.companyId);
    const contact =
      [building?.caretakerName, building?.caretakerPhone].filter(Boolean).join(" · ") ||
      undefined;
    return {
      // Current local status — lets `publish` decide whether this is a fresh
      // push or a re-list of a previously delisted (unlisted/taken) reel.
      priorStatus: listing.status,
      externalRef: listing.externalRef,
      title: listing.title ?? building?.name ?? "Vacant unit",
      rentAmount: listing.rentAmount,
      description: listing.description,
      availableFrom: listing.availableFrom,
      city: building?.city,
      // Kenya uses counties; the customer reel needs a non-empty `state`.
      state: building?.county ?? "Kenya",
      latitude: building?.latitude,
      longitude: building?.longitude,
      // Extra context for the Swyft field team capturing this unit.
      unitType: listing.unitType ?? unit?.unitType,
      directions: building?.directions,
      address: building?.address,
      contact,
      // Structured caretaker fields so the customer recorder can prefill the
      // dedicated Caretaker Phone (numeric) field cleanly — `contact` above is a
      // display-only "Name · Phone" string. (Requests §4.)
      caretakerName: building?.caretakerName,
      caretakerPhone: building?.caretakerPhone,
      // Pre-fill the customer recorder (scout/details) with what we already know —
      // so the building's data isn't keyed in twice. (Requests §4.)
      amenities: building?.amenities,
      depositAmount: unit?.depositAmount,
      sellerName: company?.name,
      // Lets the customer app resolve pre-recorded media (keyed by this prefix)
      // and auto-publish a reel instead of queuing a field shoot.
      mediaKeyPrefix: building?.mediaKeyPrefix,
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

    // `priorStatus` is internal bookkeeping — don't leak it into the payload.
    const { priorStatus, ...payload } = snap;
    // A re-list of a previously delisted reel (we sent "taken" on takedown, or a
    // renter took it) needs an explicit "available" signal — a bare upsert won't
    // flip an archived/taken reel back to live on the customer side.
    const isRelist = priorStatus === "unlisted" || priorStatus === "taken";
    console.log("[marketplace.publish] start", {
      listingId,
      externalRef: payload.externalRef,
      priorStatus,
      isRelist,
    });

    // A capture job is useless without an accurate location — the field team
    // can't find the unit. Block the push until the building has a map pin.
    if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
      throw new Error(
        "Add the building's location (map pin) before listing it on Swyft.",
      );
    }

    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) {
      throw new Error("CUSTOMER_BACKEND_URL / SYNC_SHARED_SECRET not configured");
    }

    const body = JSON.stringify(payload);
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
      console.log("[marketplace.publish] upsert response", {
        externalRef: payload.externalRef,
        status: resp.status,
        ok: resp.ok,
      });
      if (!resp.ok) throw new Error(`customer backend ${resp.status}`);
      const data = await resp.json();
      await ctx.runMutation(internal.marketplace.markPublished, {
        listingId,
        reelId: data.reelId ? String(data.reelId) : undefined,
        status: "published",
      });
      // Reopen the existing reel when re-listing something we'd delisted.
      if (isRelist) {
        console.log("[marketplace.publish] re-list → notifying customer available", {
          externalRef: payload.externalRef,
        });
        await ctx.runAction(internal.marketplace.notifyCustomerAvailable, {
          externalRef: payload.externalRef,
        });
      }
      console.log("[marketplace.publish] done", {
        externalRef: payload.externalRef,
        reelId: data.reelId,
      });
      return { ok: true, reelId: data.reelId };
    } catch (e) {
      console.error("[marketplace.publish] failed", {
        externalRef: payload.externalRef,
        error: String(e),
      });
      await ctx.runMutation(internal.marketplace.markPublished, {
        listingId,
        status: "error",
        syncError: String(e),
      });
      throw e;
    }
  },
});

/**
 * Ensure a draft type-listing exists for every unit type in a building's mix
 * (one per type with a positive count) and return the snapshots to push to the
 * customer backend. Idempotent on externalRef so re-runs reuse listings.
 * Scoped to the caller's company — any company member who can create a building
 * may list its vacancies.
 */
export const ensureBuildingTypeListings = mutation({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    const { companyId } = await requireCompany(ctx);
    const building = await ctx.db.get(buildingId);
    assertSameCompany(building, companyId);
    const company = await ctx.db.get(companyId);

    const contact =
      [building!.caretakerName, building!.caretakerPhone].filter(Boolean).join(" · ") ||
      undefined;

    // Occupancy snapshot: only genuinely-vacant units of a type may be advertised.
    // vacant(type) = mix count − units of that type already occupied. A type with
    // no remaining vacancy is skipped, so we never broadcast an occupied unit.
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    const occupiedByType = new Map<string, number>();
    // A representative deposit per type, taken from a real vacant unit of that
    // type (materialised by the roster step) so the customer recorder can prefill.
    const depositByType = new Map<string, number>();
    for (const u of units) {
      if (u.status === "occupied" && u.unitType) {
        occupiedByType.set(u.unitType, (occupiedByType.get(u.unitType) ?? 0) + 1);
      }
      if (u.unitType && typeof u.depositAmount === "number" && !depositByType.has(u.unitType)) {
        depositByType.set(u.unitType, u.depositAmount);
      }
    }

    const snaps: Array<{
      listingId: Id<"vacantListings">;
      externalRef: string;
      title: string;
      rentAmount: number;
      unitType: string;
      city?: string;
      state: string;
      latitude?: number;
      longitude?: number;
      directions?: string;
      address?: string;
      contact?: string;
      caretakerName?: string;
      caretakerPhone?: string;
      amenities?: string[];
      depositAmount?: number;
      sellerName?: string;
      mediaKeyPrefix?: string;
    }> = [];

    for (const m of building!.unitMix ?? []) {
      if (!m.count || m.count <= 0) continue;
      // Skip types with no net vacancy once tenant data has been processed.
      const vacant = m.count - (occupiedByType.get(m.type) ?? 0);
      if (vacant <= 0) continue;
      const externalRef = `type_${buildingId}_${m.type}`;
      let listing = await ctx.db
        .query("vacantListings")
        .withIndex("by_externalRef", (q) => q.eq("externalRef", externalRef))
        .first();
      if (!listing) {
        const id = await ctx.db.insert("vacantListings", {
          companyId,
          buildingId,
          unitType: m.type,
          rentAmount: m.rent ?? 0,
          externalRef,
          status: "draft",
        });
        listing = await ctx.db.get(id);
      }
      snaps.push({
        listingId: listing!._id,
        externalRef,
        title: building!.name ?? "Vacant unit",
        rentAmount: listing!.rentAmount,
        unitType: m.type,
        city: building!.city,
        // Kenya uses counties; the customer reel needs a non-empty `state`.
        state: building!.county ?? "Kenya",
        latitude: building!.latitude,
        longitude: building!.longitude,
        directions: building!.directions,
        address: building!.address,
        contact,
        caretakerName: building!.caretakerName,
        caretakerPhone: building!.caretakerPhone,
        // Prefill the customer recorder with data we already hold. (Requests §4.)
        amenities: building!.amenities,
        depositAmount: depositByType.get(m.type),
        sellerName: company?.name,
        // Lets the customer app resolve pre-recorded media (keyed by this prefix)
        // and auto-publish a reel; absent media falls back to a capture job.
        mediaKeyPrefix: building!.mediaKeyPrefix,
      });
    }

    return snaps;
  },
});

/**
 * Push every vacant unit type of a freshly-created building to swyft-customer.
 * For each type the customer backend either auto-publishes a reel (when its
 * pre-recorded media is ready) or queues a capture job for the Swyft field team
 * to record on-site (when no/partial media was uploaded). Best-effort: if sync
 * isn't configured we skip silently so building creation still succeeds.
 * Returns counts so the UI can tell the user what happened.
 */
export const publishBuildingVacancies = action({
  args: { buildingId: v.id("buildings") },
  handler: async (
    ctx,
    { buildingId },
  ): Promise<{ ok: boolean; published: number; queued: number; failed: number }> => {
    const snaps = await ctx.runMutation(api.marketplace.ensureBuildingTypeListings, {
      buildingId,
    });

    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) {
      return { ok: false, published: 0, queued: 0, failed: 0 };
    }

    let published = 0;
    let queued = 0;
    let failed = 0;

    for (const { listingId, ...payload } of snaps) {
      // A capture job is useless without a location — the field team can't find
      // the unit. Skip the push for un-pinned buildings (shouldn't happen: the
      // wizard requires a map pin).
      if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
        failed++;
        continue;
      }
      const body = JSON.stringify(payload);
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
        if (data.reelId) {
          // Media was ready → a live reel was published.
          await ctx.runMutation(internal.marketplace.markPublished, {
            listingId,
            reelId: String(data.reelId),
            status: "published",
          });
          published++;
        } else {
          // No ready media → queued for a Swyft field recording. Leave the
          // listing as a local draft; it goes live once the reel is shot.
          queued++;
        }
      } catch (e) {
        await ctx.runMutation(internal.marketplace.markPublished, {
          listingId,
          status: "error",
          syncError: String(e),
        });
        failed++;
      }
    }

    return { ok: true, published, queued, failed };
  },
});

/**
 * Manually take a listing off the Swyft marketplace. Marks it `unlisted` locally
 * and — if it ever went live — tells the customer backend to delist the reel
 * (same `notifyCustomerTaken` path the auto-occupancy retire uses). Idempotent;
 * the manager can re-list later with `publish`. Manager+ only.
 */
export const takedown = mutation({
  args: { listingId: v.id("vacantListings") },
  handler: async (ctx, { listingId }) => {
    const profile = await requireRole(ctx, "manager");
    const listing = await ctx.db.get(listingId);
    assertSameCompany(listing, profile.companyId);
    // A reel only exists on the customer side once the listing went live.
    const wasLive = listing!.status === "published" || listing!.status === "taken";
    console.log("[marketplace.takedown]", {
      listingId,
      externalRef: listing!.externalRef,
      priorStatus: listing!.status,
      wasLive,
    });
    await ctx.db.patch(listingId, { status: "unlisted", lastSyncedAt: Date.now() });
    if (wasLive) {
      await ctx.scheduler.runAfter(0, internal.marketplace.notifyCustomerTaken, {
        externalRef: listing!.externalRef,
      });
    }
    return { ok: true };
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

/**
 * Tell the customer backend a listing is taken so it auto-delists the reel.
 * POSTs to /api/sync/from-agent (HMAC-signed). Best-effort — scheduled from the
 * occupancy mutations; if sync isn't configured we skip silently.
 */
export const notifyCustomerTaken = internalAction({
  args: { externalRef: v.string() },
  handler: async (_ctx, { externalRef }): Promise<null> => {
    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) {
      console.warn("[marketplace.notifyCustomerTaken] sync not configured — skipping", { externalRef });
      return null;
    }
    const body = JSON.stringify({ kind: "status", status: "taken", externalRef });
    const signature = await hmacHex(body, secret);
    const resp = await fetch(`${url}/api/sync/from-agent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-swyft-signature": signature },
      body,
    });
    console.log("[marketplace.notifyCustomerTaken]", { externalRef, status: resp.status, ok: resp.ok });
    return null;
  },
});

/**
 * Tell the customer backend a previously-taken listing is available again so it
 * re-lists the existing reel. Mirror of `notifyCustomerTaken`; scheduled from the
 * vacate mutations when a unit (or a whole type) opens back up.
 */
export const notifyCustomerAvailable = internalAction({
  args: { externalRef: v.string() },
  handler: async (_ctx, { externalRef }): Promise<null> => {
    const url = process.env.CUSTOMER_BACKEND_URL;
    const secret = process.env.SYNC_SHARED_SECRET;
    if (!url || !secret) {
      console.warn("[marketplace.notifyCustomerAvailable] sync not configured — skipping", { externalRef });
      return null;
    }
    const body = JSON.stringify({ kind: "status", status: "available", externalRef });
    const signature = await hmacHex(body, secret);
    const resp = await fetch(`${url}/api/sync/from-agent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-swyft-signature": signature },
      body,
    });
    console.log("[marketplace.notifyCustomerAvailable]", { externalRef, status: resp.status, ok: resp.ok });
    return null;
  },
});

/**
 * Mirror of `retireListingsOnOccupied`: called whenever a unit becomes vacant.
 * Re-opens any listing that was retired (`taken`) but now has vacancy again:
 *  • the unit-specific listing (externalRef `unit_<id>`), and
 *  • the type listing (`type_<building>_<type>`) once net vacancy of that type
 *    (mix count − occupied) is positive again.
 * Only a listing that was actually published+taken (so a reel already exists on
 * the customer side) is reopened; drafts that never went live are left alone.
 * Safe to call from within a mutation transaction.
 */
export async function reopenListingsOnVacant(
  ctx: MutationCtx,
  unitId: Id<"units">,
): Promise<void> {
  const unit = await ctx.db.get(unitId);
  if (!unit || unit.status !== "vacant") return;

  const reopen = async (externalRef: string) => {
    const listing = await ctx.db
      .query("vacantListings")
      .withIndex("by_externalRef", (q) => q.eq("externalRef", externalRef))
      .first();
    // Only reels that were live then retired (`taken`) can come back.
    if (!listing || listing.status !== "taken") return;
    await ctx.db.patch(listing._id, { status: "published" });
    await ctx.scheduler.runAfter(0, internal.marketplace.notifyCustomerAvailable, {
      externalRef,
    });
  };

  // 1) Unit-specific listing.
  await reopen(`unit_${unitId}`);

  // 2) Type listing — now that this unit is vacant there's at least one vacancy.
  if (unit.unitType) {
    await reopen(`type_${unit.buildingId}_${unit.unitType}`);
  }
}

/**
 * Called whenever a unit becomes occupied. Retires any published Swyft listing
 * that no longer has a vacancy:
 *  • the unit-specific listing (externalRef `unit_<id>`), and
 *  • the type listing (externalRef `type_<building>_<type>`) once the count of
 *    vacant units of that type — unitMix count minus occupied units of the type —
 *    reaches zero.
 * Marks the listing `taken` locally and schedules the customer callback.
 * Safe to call from within a mutation transaction (shared-helper pattern).
 */
export async function retireListingsOnOccupied(
  ctx: MutationCtx,
  unitId: Id<"units">,
): Promise<void> {
  const unit = await ctx.db.get(unitId);
  if (!unit) return;

  const retire = async (externalRef: string) => {
    const listing = await ctx.db
      .query("vacantListings")
      .withIndex("by_externalRef", (q) => q.eq("externalRef", externalRef))
      .first();
    if (!listing || listing.status !== "published") return;
    await ctx.db.patch(listing._id, { status: "taken" });
    await ctx.scheduler.runAfter(0, internal.marketplace.notifyCustomerTaken, {
      externalRef,
    });
  };

  // 1) Unit-specific listing.
  await retire(`unit_${unitId}`);

  // 2) Type listing — only when no vacancy of this type remains.
  if (unit.unitType) {
    const building = await ctx.db.get(unit.buildingId);
    const mixCount =
      building?.unitMix?.find((m) => m.type === unit.unitType)?.count ?? 0;
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", unit.buildingId))
      .collect();
    const occupied = units.filter(
      (u) => u.unitType === unit.unitType && u.status === "occupied",
    ).length;
    if (mixCount - occupied <= 0) {
      await retire(`type_${unit.buildingId}_${unit.unitType}`);
    }
  }
}
