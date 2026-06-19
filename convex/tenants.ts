import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import type { Id } from "./_generated/dataModel";

const tenantStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("pending"),
  v.literal("terminated"),
);

/**
 * A unit may be home to at most one active tenant. Throw if `unitId` is already
 * occupied by a different active tenant. (Issue #4)
 */
async function assertUnitAssignable(
  ctx: MutationCtx,
  unitId: Id<"units">,
  exceptTenantId?: Id<"tenants">,
): Promise<void> {
  const occupants = await ctx.db
    .query("tenants")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  const clash = occupants.find(
    (t) => t._id !== exceptTenantId && t.status === "active",
  );
  if (clash) {
    throw new Error(
      `That unit is already assigned to ${clash.fullName}. A unit can only have one active tenant.`,
    );
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("tenants")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tenants") },
  handler: async (ctx, { id }) => {
    const { companyId } = await requireCompany(ctx);
    const tenant = await ctx.db.get(id);
    assertSameCompany(tenant, companyId);
    return tenant;
  },
});

export const create = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(), // mandatory — the #1 reconciliation key
    email: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    unitId: v.optional(v.id("units")),
    buildingId: v.optional(v.id("buildings")),
    status: v.optional(tenantStatus),
    arrearsBroughtForward: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);

    const phone = normalizePhone(args.phone);
    if (!phone) {
      throw new Error(
        `Invalid M-Pesa phone "${args.phone}". Use 07XXXXXXXX / 2547XXXXXXXX.`,
      );
    }
    if (args.unitId) {
      assertSameCompany(await ctx.db.get(args.unitId), companyId);
      await assertUnitAssignable(ctx, args.unitId);
    }
    if (args.buildingId) assertSameCompany(await ctx.db.get(args.buildingId), companyId);

    const tenantId = await ctx.db.insert("tenants", {
      companyId,
      fullName: args.fullName,
      phone,
      email: args.email,
      nationalId: args.nationalId,
      unitId: args.unitId,
      buildingId: args.buildingId,
      status: args.status ?? "active",
      arrearsBroughtForward: args.arrearsBroughtForward,
      notes: args.notes,
    });

    // Pre-seed the learned phone→tenant map so the very first payment matches.
    await ctx.db.insert("phoneTenantMap", { companyId, phone, tenantId });

    // Opening-balance invoice for arrears brought forward (correct day-1 ledger).
    if (args.arrearsBroughtForward && args.arrearsBroughtForward > 0) {
      await ctx.db.insert("invoices", {
        companyId,
        tenantId,
        unitId: args.unitId,
        kind: "opening_balance",
        description: "Arrears brought forward",
        amount: args.arrearsBroughtForward,
        balance: args.arrearsBroughtForward,
        dueDate: Date.now(),
        status: "open",
      });
    }

    return tenantId;
  },
});

/**
 * The merged "Add Tenant" flow (issues #1 + #11): name the unit while creating
 * the tenant. Creates the unit (occupied), the tenant, and an active lease in
 * one transaction so recurring rent invoices start generating. A vacant unit is
 * therefore just one the building has room for but no tenant names yet —
 * vacancy = building.totalUnits − occupied units.
 */
export const createWithUnit = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    buildingId: v.id("buildings"),
    unitNumber: v.string(),
    unitType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    rentAmount: v.number(),
    depositAmount: v.optional(v.number()),
    billingDay: v.optional(v.number()), // 1–28; defaults to 1
    arrearsBroughtForward: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"tenants">> => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(args.buildingId), companyId);

    const phone = normalizePhone(args.phone);
    if (!phone) {
      throw new Error(
        `Invalid M-Pesa phone "${args.phone}". Use 07XXXXXXXX / 2547XXXXXXXX.`,
      );
    }

    const billingDay = args.billingDay ?? 1;
    if (billingDay < 1 || billingDay > 28) {
      throw new Error("Billing day must be between 1 and 28");
    }

    // 1) The named unit (immediately occupied).
    const unitId = await ctx.db.insert("units", {
      companyId,
      buildingId: args.buildingId,
      unitNumber: args.unitNumber,
      unitType: args.unitType,
      bedrooms: args.bedrooms,
      bathrooms: args.bathrooms,
      rentAmount: args.rentAmount,
      depositAmount: args.depositAmount,
      status: "occupied",
    });

    // 2) The tenant.
    const tenantId = await ctx.db.insert("tenants", {
      companyId,
      fullName: args.fullName,
      phone,
      email: args.email,
      nationalId: args.nationalId,
      unitId,
      buildingId: args.buildingId,
      status: "active",
      arrearsBroughtForward: args.arrearsBroughtForward,
    });
    await ctx.db.insert("phoneTenantMap", { companyId, phone, tenantId });

    // 3) The active lease so recurring rent invoices generate.
    await ctx.db.insert("leases", {
      companyId,
      tenantId,
      unitId,
      startDate: Date.now(),
      rentAmount: args.rentAmount,
      depositAmount: args.depositAmount,
      billingDay,
      status: "active",
    });

    // 4) Opening-balance invoice for any arrears brought forward.
    if (args.arrearsBroughtForward && args.arrearsBroughtForward > 0) {
      await ctx.db.insert("invoices", {
        companyId,
        tenantId,
        unitId,
        kind: "opening_balance",
        description: "Arrears brought forward",
        amount: args.arrearsBroughtForward,
        balance: args.arrearsBroughtForward,
        dueDate: Date.now(),
        status: "open",
      });
    }

    return tenantId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tenants"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    unitId: v.optional(v.id("units")),
    buildingId: v.optional(v.id("buildings")),
    status: v.optional(tenantStatus),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, phone, ...patch }) => {
    const { companyId } = await requireCompany(ctx);
    const tenant = await ctx.db.get(id);
    assertSameCompany(tenant, companyId);
    if (patch.unitId && patch.unitId !== tenant!.unitId) {
      assertSameCompany(await ctx.db.get(patch.unitId), companyId);
      await assertUnitAssignable(ctx, patch.unitId, id);
      // Mark the newly-assigned unit occupied; free the old one if it had one.
      await ctx.db.patch(patch.unitId, { status: "occupied" });
      if (tenant!.unitId) {
        await ctx.db.patch(tenant!.unitId, { status: "vacant" });
      }
    }
    if (patch.buildingId) assertSameCompany(await ctx.db.get(patch.buildingId), companyId);

    let normalized: string | undefined;
    if (phone !== undefined) {
      const n = normalizePhone(phone);
      if (!n) throw new Error(`Invalid M-Pesa phone "${phone}".`);
      normalized = n;
    }
    await ctx.db.patch(id, {
      ...patch,
      ...(normalized !== undefined && { phone: normalized }),
    });

    // Keep the learned map in sync when the phone changes.
    if (normalized && normalized !== tenant!.phone) {
      await ctx.db.insert("phoneTenantMap", {
        companyId,
        phone: normalized,
        tenantId: id,
      });
    }
    return null;
  },
});

/**
 * Bulk-insert tenants from a parsed CSV (the AI smart-import action calls this
 * after OpenAI structures the rows). Idempotency is by phone within company.
 */
export const bulkImport = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    rows: v.array(
      v.object({
        fullName: v.string(),
        phone: v.string(),
        unitNumber: v.optional(v.string()),
        rentAmount: v.optional(v.number()),
        arrearsBroughtForward: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { companyId, rows }) => {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const phone = normalizePhone(row.phone);
      if (!phone) {
        errors.push(`${row.fullName}: invalid phone "${row.phone}"`);
        continue;
      }
      const existing = await ctx.db
        .query("tenants")
        .withIndex("by_company_and_phone", (q) =>
          q.eq("companyId", companyId).eq("phone", phone),
        )
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      const tenantId = await ctx.db.insert("tenants", {
        companyId,
        fullName: row.fullName,
        phone,
        status: "active",
        arrearsBroughtForward: row.arrearsBroughtForward,
      });
      await ctx.db.insert("phoneTenantMap", { companyId, phone, tenantId });

      if (row.arrearsBroughtForward && row.arrearsBroughtForward > 0) {
        await ctx.db.insert("invoices", {
          companyId,
          tenantId,
          kind: "opening_balance",
          description: "Arrears brought forward (import)",
          amount: row.arrearsBroughtForward,
          balance: row.arrearsBroughtForward,
          dueDate: Date.now(),
          status: "open",
        });
      }
      created++;
    }
    return { created, skipped, errors };
  },
});
