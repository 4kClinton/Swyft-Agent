import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany, requireActiveSubscription } from "./lib/rbac";

// Area keys are admin-managed in the customer app (fetched via convex/areas.ts),
// so we can't validate against a fixed list here — a newly-added area must pass.
// Enforce the slug SHAPE only; the form only ever submits keys from the shared list.
const AREA_KEY_RE = /^[a-z0-9-]+$/;

const unitMixValidator = v.array(
  v.object({
    type: v.string(),
    count: v.number(),
    rent: v.optional(v.number()),
  }),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("buildings") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const building = await ctx.db.get(id);
    assertSameCompany(building, companyId);
    return building;
  },
});

export const create = mutation({
  args: {
    // Owning landlord (property-manager companies). Optional for landlord-kind
    // companies (implicit self-owner).
    landlordId: v.optional(v.id("landlords")),
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    // Structured area key (lib/areas.ts) — the lead-matching join key.
    area: v.optional(v.string()),
    description: v.optional(v.string()),
    propertyType: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("commercial"),
        v.literal("mixed"),
      ),
    ),
    caretakerName: v.string(),
    caretakerPhone: v.string(),
    totalUnits: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    directions: v.optional(v.string()),
    amenities: v.optional(v.array(v.string())),
    unitMix: v.optional(unitMixValidator),
    mediaKeyPrefix: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    await requireActiveSubscription(ctx, companyId);
    if (!args.caretakerName.trim() || !args.caretakerPhone.trim()) {
      throw new Error("Caretaker name and phone are required");
    }
    if (args.landlordId) {
      assertSameCompany(await ctx.db.get(args.landlordId), companyId);
    }
    if (args.area !== undefined && !AREA_KEY_RE.test(args.area)) {
      throw new Error("Invalid area. Pick one from the area list.");
    }
    return await ctx.db.insert("buildings", { companyId, ...args });
  },
});

export const update = mutation({
  args: {
    id: v.id("buildings"),
    landlordId: v.optional(v.id("landlords")),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    area: v.optional(v.string()),
    description: v.optional(v.string()),
    caretakerName: v.optional(v.string()),
    caretakerPhone: v.optional(v.string()),
    totalUnits: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    directions: v.optional(v.string()),
    amenities: v.optional(v.array(v.string())),
    unitMix: v.optional(unitMixValidator),
    // Marketplace media (see schema): a client-generated prefix keying the
    // building/unit-type photos on the customer deployment, the cover URL, and
    // the photo-count manifest so the edit UI can show what's recorded.
    mediaKeyPrefix: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    buildingImageCount: v.optional(v.number()),
    unitTypeMedia: v.optional(
      v.array(v.object({ type: v.string(), imageCount: v.number() })),
    ),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    if (patch.landlordId) {
      assertSameCompany(await ctx.db.get(patch.landlordId), companyId);
    }
    if (patch.area !== undefined && !AREA_KEY_RE.test(patch.area)) {
      throw new Error("Invalid area. Pick one from the area list.");
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

// Counts that make a building unsafe to delete. Used by the UI to warn before
// confirming, and re-checked authoritatively in `remove`.
export const deletionStats = query({
  args: { id: v.id("buildings") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .collect();
    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .collect();
    return { unitCount: units.length, tenantCount: tenants.length };
  },
});

export const remove = mutation({
  args: { id: v.id("buildings") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    // Refuse to delete a building that still has tenants attached: this is real
    // occupancy data and must be moved off the building first.
    const tenants = await ctx.db
      .query("tenants")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .take(1);
    if (tenants.length > 0) {
      throw new Error(
        "This building still has tenants. Move or remove them before deleting it.",
      );
    }
    // Refuse to delete a building that still has units.
    const units = await ctx.db
      .query("units")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .take(1);
    if (units.length > 0) {
      throw new Error("Remove or reassign units before deleting this building");
    }
    await ctx.db.delete(id);
    return null;
  },
});
