import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";

const agreementKindValidator = v.union(
  v.literal("tenancy"),
  v.literal("lease"),
  v.literal("other"),
);

/** Signed URL the client uploads an agreement PDF to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCompany(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Agreements for a tenant, newest first. Falls back to the legacy
 * `tenants.tenantAgreementUrl` as a synthetic "tenancy" row when the tenant has
 * no agreements stored here yet, so retrieval works for un-migrated tenants.
 */
export const listForTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, { tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    const tenant = await ctx.db.get(tenantId);
    assertSameCompany(tenant, companyId);

    const rows = await ctx.db
      .query("agreements")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .collect();

    const resolved = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        url: r.storageId
          ? await ctx.storage.getUrl(r.storageId)
          : (r.externalUrl ?? null),
      })),
    );

    // Back-compat: surface the legacy single-URL field when nothing's migrated.
    if (resolved.length === 0 && tenant?.tenantAgreementUrl) {
      return [
        {
          _id: null,
          legacy: true as const,
          kind: "tenancy" as const,
          fileName: undefined,
          signedAt: undefined,
          url: tenant.tenantAgreementUrl,
        },
      ];
    }
    return resolved;
  },
});

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    leaseId: v.optional(v.id("leases")),
    storageId: v.optional(v.id("_storage")),
    externalUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    kind: v.optional(agreementKindValidator),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(args.tenantId), companyId);
    if (!args.storageId && !args.externalUrl) {
      throw new Error("Provide an uploaded file or an external link");
    }
    if (args.leaseId) {
      assertSameCompany(await ctx.db.get(args.leaseId), companyId);
    }
    const { kind, ...rest } = args;
    return await ctx.db.insert("agreements", {
      companyId,
      kind: kind ?? "tenancy",
      ...rest,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("agreements") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const row = await ctx.db.get(id);
    assertSameCompany(row, companyId);
    if (row?.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return null;
  },
});
