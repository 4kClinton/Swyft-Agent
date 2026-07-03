import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import {
  importEntityValidator,
  importRowStateValidator,
} from "./schema";
import { validateMapped, type ImportEntity } from "./lib/importSchema";

// ---------------------------------------------------------------------------
// Smart data-migration backend. Flow:
//   generateUploadUrl → client uploads the ORIGINAL file to storage
//   → importParse.parseUpload (action) AI-maps columns + stages rows here
//   → user previews / fixes / toggles → commitBatch writes in dependency order.
// Nothing is ever lost: raw file retained, leftovers parked. (See plan.)
// ---------------------------------------------------------------------------

/** Signed URL the client uploads the raw spreadsheet to. Auth-guarded. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "manager");
    return await ctx.storage.generateUploadUrl();
  },
});

// Shape of one staged row handed over by the parse action.
const stagedRowValidator = v.object({
  sheetName: v.optional(v.string()),
  entityType: importEntityValidator,
  rawRow: v.any(),
  data: v.any(),
  extra: v.any(),
  naturalKeys: v.object({
    buildingName: v.optional(v.string()),
    unitNumber: v.optional(v.string()),
    tenantPhone: v.optional(v.string()),
  }),
  rowState: importRowStateValidator,
  include: v.boolean(),
  validation: v.object({ ok: v.boolean(), message: v.optional(v.string()) }),
});

/** Create the batch row up front (status "parsing") and record the retained raw file. */
export const createBatch = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    createdBy: v.optional(v.id("profiles")),
    fileName: v.optional(v.string()),
    rawStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, a): Promise<Id<"importBatches">> => {
    return await ctx.db.insert("importBatches", {
      companyId: a.companyId,
      createdBy: a.createdBy,
      fileName: a.fileName,
      rawStorageId: a.rawStorageId,
      status: "parsing",
      rowCount: 0,
      committedCount: 0,
      parkedCount: 0,
    });
  },
});

/** Persist staged rows for a batch and flip it to "parsed". */
export const insertParsedRows = internalMutation({
  args: {
    batchId: v.id("importBatches"),
    rows: v.array(stagedRowValidator),
  },
  handler: async (ctx, { batchId, rows }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) throw new Error("Batch not found");
    let parked = 0;
    for (const r of rows) {
      if (r.rowState === "parked") parked++;
      await ctx.db.insert("importRows", {
        companyId: batch.companyId,
        batchId,
        sheetName: r.sheetName,
        entityType: r.entityType,
        rawRow: r.rawRow,
        data: r.data,
        extra: r.extra,
        naturalKeys: r.naturalKeys,
        rowState: r.rowState,
        include: r.include,
        validation: r.validation,
      });
    }
    await ctx.db.patch(batchId, {
      status: "parsed",
      rowCount: rows.length,
      parkedCount: parked,
    });
    return null;
  },
});

/** Record a parse failure (the raw file is still retained on the batch). */
export const markBatchFailed = internalMutation({
  args: { batchId: v.id("importBatches"), error: v.string() },
  handler: async (ctx, { batchId, error }) => {
    await ctx.db.patch(batchId, { status: "failed", error });
    return null;
  },
});

/** Replace all rows of a batch (used by re-parse). */
export const replaceRows = internalMutation({
  args: { batchId: v.id("importBatches"), rows: v.array(stagedRowValidator) },
  handler: async (ctx, { batchId, rows }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) throw new Error("Batch not found");
    // Drop any not-yet-committed rows; keep committed ones intact.
    const existing = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    for (const row of existing) {
      if (row.rowState !== "committed") await ctx.db.delete(row._id);
    }
    let parked = 0;
    for (const r of rows) {
      if (r.rowState === "parked") parked++;
      await ctx.db.insert("importRows", {
        companyId: batch.companyId,
        batchId,
        sheetName: r.sheetName,
        entityType: r.entityType,
        rawRow: r.rawRow,
        data: r.data,
        extra: r.extra,
        naturalKeys: r.naturalKeys,
        rowState: r.rowState,
        include: r.include,
        validation: r.validation,
      });
    }
    const committed = existing.filter((r) => r.rowState === "committed").length;
    await ctx.db.patch(batchId, {
      status: committed > 0 ? "partially_committed" : "parsed",
      rowCount: committed + rows.length,
      committedCount: committed,
      parkedCount: parked,
    });
    return null;
  },
});

/** Raw rows of a batch grouped by sheet — feeds re-parse. */
export const rawForReparse = query({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const { companyId } = await requireCompany(ctx);
    const batch = await ctx.db.get(batchId);
    assertSameCompany(batch, companyId);
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    return rows
      .filter((r) => r.rowState !== "committed")
      .map((r) => ({ sheetName: r.sheetName, rawRow: r.rawRow }));
  },
});

// ---------------------------------------------------------------------------
// Queries for the management page.
// ---------------------------------------------------------------------------

export const listBatches = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("importBatches")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(50);
  },
});

/**
 * Delete an uploaded file's import record: its staged rows and the retained raw
 * file. Records already committed into buildings/units/tenants/leases are NOT
 * touched — this only removes the import artefact.
 */
export const deleteBatch = mutation({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const profile = await requireRole(ctx, "manager");
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, profile.companyId);
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    if (b!.rawStorageId) {
      try {
        await ctx.storage.delete(b!.rawStorageId);
      } catch {
        /* best-effort — file may already be gone */
      }
    }
    await ctx.db.delete(batchId);
    console.log(`[import] deleteBatch: removed batch=${batchId} (${rows.length} staged rows)`);
    return null;
  },
});

export const batch = query({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const { companyId } = await requireCompany(ctx);
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    return { batch: b, rows };
  },
});

/**
 * Columns from the uploaded file that didn't map to any Swyft field — surfaced
 * so the user is told what has no home (it's preserved verbatim in `extra` and
 * folded into the record's notes, never dropped).
 */
export const unmappedColumns = query({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const { companyId } = await requireCompany(ctx);
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const k of Object.keys((r.extra ?? {}) as Record<string, unknown>)) {
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([column, count]) => ({ column, count }))
      .sort((a, b) => b.count - a.count);
  },
});

// ---------------------------------------------------------------------------
// Preview edits.
// ---------------------------------------------------------------------------

export const setRowIncluded = mutation({
  args: { rowId: v.id("importRows"), include: v.boolean() },
  handler: async (ctx, { rowId, include }) => {
    const { companyId } = await requireCompany(ctx);
    const row = await ctx.db.get(rowId);
    assertSameCompany(row, companyId);
    if (row!.rowState === "committed") throw new Error("Already imported");
    // Only valid rows may be queued for import.
    if (include && !row!.validation.ok) {
      throw new Error("Fix the row's issues before including it");
    }
    await ctx.db.patch(rowId, { include });
    return null;
  },
});

/** Change a parked/unknown row's entity type (then re-validate deterministically). */
export const reclassifyRow = mutation({
  args: { rowId: v.id("importRows"), entityType: importEntityValidator },
  handler: async (ctx, { rowId, entityType }) => {
    const { companyId } = await requireCompany(ctx);
    const row = await ctx.db.get(rowId);
    assertSameCompany(row, companyId);
    if (row!.rowState === "committed") throw new Error("Already imported");
    if (entityType === "unknown") {
      await ctx.db.patch(rowId, {
        entityType,
        rowState: "parked",
        include: false,
        validation: { ok: false, message: "Unrecognised data" },
      });
      return null;
    }
    // Re-validate the already-mapped data against the new entity. If the columns
    // don't fit, it stays parked with a clear message until re-parsed.
    const validation = validateMapped(
      entityType as ImportEntity,
      row!.data ?? {},
      row!.naturalKeys ?? {},
    );
    const message = validation.ok
      ? "Type changed — re-parse the file to map its columns correctly"
      : validation.message;
    await ctx.db.patch(rowId, {
      entityType,
      rowState: "parked",
      include: false,
      validation: { ok: false, message },
    });
    return null;
  },
});

/** Patch a row's mapped data (e.g. fill a missing required field), then re-validate. */
export const fixRow = mutation({
  args: { rowId: v.id("importRows"), patch: v.any() },
  handler: async (ctx, { rowId, patch }) => {
    const { companyId } = await requireCompany(ctx);
    const row = await ctx.db.get(rowId);
    assertSameCompany(row, companyId);
    if (row!.rowState === "committed") throw new Error("Already imported");
    if (row!.entityType === "unknown") {
      throw new Error("Set a type for this row before editing it");
    }

    const data = { ...(row!.data ?? {}), ...(patch ?? {}) };
    const naturalKeys = { ...(row!.naturalKeys ?? {}) };
    // Keep canonical natural keys in sync with edited identity fields.
    if (row!.entityType === "tenant" && typeof data.phone === "string") {
      naturalKeys.tenantPhone = normalizePhone(data.phone) ?? naturalKeys.tenantPhone;
    }
    if (row!.entityType === "building" && typeof data.name === "string") {
      naturalKeys.buildingName = data.name;
    }
    const validation = validateMapped(row!.entityType as ImportEntity, data, naturalKeys);
    await ctx.db.patch(rowId, {
      data,
      naturalKeys,
      validation,
      rowState: validation.ok ? "ready" : "parked",
      include: validation.ok,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Clarifying questions: which building do these reference? (e.g. tenants whose
// building name doesn't match any the user has.)
// ---------------------------------------------------------------------------

const REF_ENTITIES = new Set(["unit", "tenant", "lease"]);

/** Building names referenced by a batch's rows that don't match any existing building. */
export const unresolvedBuildings = query({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const { companyId } = await requireCompany(ctx);
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const existingNames = new Set(buildings.map((x) => norm(x.name)));

    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();

    const counts = new Map<string, number>();
    let missingCount = 0;
    for (const r of rows) {
      if (r.rowState === "committed") continue;
      if (!REF_ENTITIES.has(r.entityType)) continue;
      const name = r.naturalKeys?.buildingName;
      if (!name) {
        missingCount++; // no building reference at all — we should ask
        continue;
      }
      if (existingNames.has(norm(name))) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return {
      unmatched: Array.from(counts.entries()).map(([name, rowCount]) => ({ name, rowCount })),
      missingCount,
      existing: buildings.map((x) => ({ _id: x._id, name: x.name })),
    };
  },
});

/**
 * Answer "which building is <fromName>?" — point every row referencing it at an
 * existing building, or create that building. Rows that were only blocked on the
 * unknown building become ready.
 */
export const resolveBuildingRef = mutation({
  args: {
    batchId: v.id("importBatches"),
    fromName: v.string(),
    target: v.union(
      v.object({ type: v.literal("existing"), buildingId: v.id("buildings") }),
      v.object({ type: v.literal("create") }),
    ),
  },
  handler: async (ctx, { batchId, fromName, target }) => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);

    let targetName: string;
    if (target.type === "existing") {
      const bld = await ctx.db.get(target.buildingId);
      assertSameCompany(bld, companyId);
      targetName = bld!.name;
    } else {
      const clean = fromName.trim();
      if (!clean) throw new Error("Provide a building name to create");
      await ctx.db.insert("buildings", { companyId, name: clean });
      targetName = clean;
      console.log(`[import] created building "${clean}" from clarification`);
    }

    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();

    // An empty fromName targets rows with NO building reference ("assign these
    // unassigned rows to a building"); otherwise we match the given name.
    const wantMissing = norm(fromName) === "";
    let updated = 0;
    for (const r of rows) {
      if (r.rowState === "committed" || !REF_ENTITIES.has(r.entityType)) continue;
      const name = r.naturalKeys?.buildingName;
      const match = wantMissing ? !name : Boolean(name && norm(name) === norm(fromName));
      if (!match) continue;
      const naturalKeys = { ...r.naturalKeys, buildingName: targetName };
      const validation = validateMapped(r.entityType as ImportEntity, r.data ?? {}, naturalKeys);
      await ctx.db.patch(r._id, {
        naturalKeys,
        validation,
        rowState: validation.ok ? "ready" : "parked",
        include: validation.ok ? true : r.include,
      });
      updated++;
    }
    console.log(`[import] resolveBuildingRef: "${fromName}" → "${targetName}" (${updated} rows)`);
    return { updated };
  },
});

// ---------------------------------------------------------------------------
// Commit — dependency-ordered, additive, parks anything that can't be resolved.
// ---------------------------------------------------------------------------

const ENTITY_ORDER: Record<string, number> = {
  landlord: 0,
  building: 1,
  unit: 2,
  tenant: 3,
  lease: 4,
  unknown: 9,
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function rowTitleForLog(row: Doc<"importRows">): string {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const k = row.naturalKeys ?? {};
  return String(d.name ?? d.fullName ?? k.tenantPhone ?? k.unitNumber ?? k.buildingName ?? row._id);
}

async function findBuildingByName(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  name: string | undefined,
): Promise<Doc<"buildings"> | null> {
  if (!name) return null;
  const target = norm(name);
  const buildings = await ctx.db
    .query("buildings")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  return buildings.find((b) => norm(b.name) === target) ?? null;
}

async function findLandlordByName(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  name: string | undefined,
): Promise<Doc<"landlords"> | null> {
  if (!name) return null;
  const target = norm(name);
  const landlords = await ctx.db
    .query("landlords")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  return landlords.find((l) => norm(l.name) === target) ?? null;
}

async function findUnit(
  ctx: MutationCtx,
  buildingId: Id<"buildings">,
  unitNumber: string | undefined,
): Promise<Doc<"units"> | null> {
  if (!unitNumber) return null;
  const target = norm(unitNumber);
  const units = await ctx.db
    .query("units")
    .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
    .collect();
  return units.find((u) => norm(u.unitNumber) === target) ?? null;
}

async function findTenantByPhone(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  phone: string,
): Promise<Doc<"tenants"> | null> {
  return await ctx.db
    .query("tenants")
    .withIndex("by_company_and_phone", (q) =>
      q.eq("companyId", companyId).eq("phone", phone),
    )
    .first();
}

async function insertOpeningBalance(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  tenantId: Id<"tenants">,
  unitId: Id<"units"> | undefined,
  amount: number,
) {
  if (!amount || amount <= 0) return;
  await ctx.db.insert("invoices", {
    companyId,
    tenantId,
    unitId,
    kind: "opening_balance",
    description: "Arrears brought forward (import)",
    amount,
    balance: amount,
    dueDate: Date.now(),
    status: "open",
  });
}

type CommitOutcome = { resultId: string; reused?: boolean } | { parked: string };

async function commitLandlord(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  data: Record<string, any>,
): Promise<CommitOutcome> {
  const name = ((data.name as string) ?? "").trim();
  if (!name) return { parked: "Missing landlord name" };
  const existing = await findLandlordByName(ctx, companyId, name);
  if (existing) return { resultId: existing._id, reused: true };
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  const id = await ctx.db.insert("landlords", {
    companyId,
    name,
    email: str(data.email),
    phone: str(data.phone),
    nationalId: str(data.nationalId),
    kraPin: str(data.kraPin),
    nextOfKinName: str(data.nextOfKinName),
    nextOfKinPhone: str(data.nextOfKinPhone),
    status: "active",
  });
  return { resultId: id };
}

async function commitBuilding(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  data: Record<string, any>,
  keys: { buildingName?: string; landlordName?: string },
): Promise<CommitOutcome> {
  const name = ((data.name as string) ?? keys.buildingName ?? "").trim();
  if (!name) return { parked: "Missing building name" };
  const existing = await findBuildingByName(ctx, companyId, name);
  if (existing) return { resultId: existing._id, reused: true };
  // Resolve the owning landlord by name (committed earlier in this batch, or
  // pre-existing). Unresolved owner doesn't block the building — it imports
  // unowned and can be assigned later.
  const landlord = await findLandlordByName(ctx, companyId, keys.landlordName);
  const id = await ctx.db.insert("buildings", {
    companyId,
    landlordId: landlord?._id,
    name,
    address: data.address,
    city: data.city,
    county: data.county,
    description: data.description,
    propertyType: data.propertyType,
    caretakerName: data.caretakerName,
    caretakerPhone: data.caretakerPhone,
    totalUnits: typeof data.totalUnits === "number" ? data.totalUnits : undefined,
  });
  return { resultId: id };
}

async function commitUnit(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  data: Record<string, any>,
  keys: { buildingName?: string; unitNumber?: string },
): Promise<CommitOutcome> {
  const building = await findBuildingByName(ctx, companyId, keys.buildingName);
  if (!building) {
    return { parked: `Building "${keys.buildingName ?? "?"}" not found — import it first` };
  }
  if (!keys.unitNumber) return { parked: "Missing unit number" };
  const existing = await findUnit(ctx, building._id, keys.unitNumber);
  if (existing) return { resultId: existing._id, reused: true };
  const id = await ctx.db.insert("units", {
    companyId,
    buildingId: building._id,
    unitNumber: keys.unitNumber,
    unitType: data.unitType,
    bedrooms: typeof data.bedrooms === "number" ? data.bedrooms : undefined,
    bathrooms: typeof data.bathrooms === "number" ? data.bathrooms : undefined,
    // Rent is optional on import — default 0, set later. (Migration often lacks it.)
    rentAmount: typeof data.rentAmount === "number" ? data.rentAmount : 0,
    depositAmount: typeof data.depositAmount === "number" ? data.depositAmount : undefined,
    status: data.status ?? "vacant",
  });
  return { resultId: id };
}

async function commitTenant(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  data: Record<string, any>,
  keys: { buildingName?: string; unitNumber?: string; tenantPhone?: string },
): Promise<CommitOutcome> {
  const phone = keys.tenantPhone ?? (data.phone as string);
  if (!phone) return { parked: "Missing tenant phone" };
  const existing = await findTenantByPhone(ctx, companyId, phone);
  if (existing) return { resultId: existing._id, reused: true };

  // Resolve (or create) the tenant's unit when enough info is present.
  const building = await findBuildingByName(ctx, companyId, keys.buildingName);
  let unit: Doc<"units"> | null = null;
  if (building) {
    unit = await findUnit(ctx, building._id, keys.unitNumber);
    // Create the unit from the tenant's unit number even when the file carries
    // no rent (rent defaults to 0 and can be set later) — so we always capture
    // which unit the tenant is in.
    if (!unit && keys.unitNumber) {
      const unitId = await ctx.db.insert("units", {
        companyId,
        buildingId: building._id,
        unitNumber: keys.unitNumber,
        unitType: typeof data.unitType === "string" ? data.unitType : undefined,
        rentAmount: typeof data.rentAmount === "number" ? data.rentAmount : 0,
        status: "occupied",
      });
      unit = await ctx.db.get(unitId);
    }
  }

  const VALID_STATUS = ["active", "inactive", "pending", "terminated"] as const;
  const status = VALID_STATUS.includes(data.status) ? (data.status as (typeof VALID_STATUS)[number]) : "active";
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  const tenantId = await ctx.db.insert("tenants", {
    companyId,
    fullName: (data.fullName as string) ?? "Unnamed tenant",
    phone,
    email: data.email,
    nationalId: data.nationalId,
    unitId: unit?._id,
    buildingId: building?._id,
    status,
    arrearsBroughtForward:
      typeof data.arrearsBroughtForward === "number" ? data.arrearsBroughtForward : undefined,
    notes: data.notes,
    kraPin: str(data.kraPin),
    dateOfBirth: str(data.dateOfBirth),
    gender: str(data.gender),
    occupation: str(data.occupation),
    employer: str(data.employer),
    emergencyContactName: str(data.emergencyContactName),
    emergencyContactPhone: str(data.emergencyContactPhone),
    emergencyContactRelation: str(data.emergencyContactRelation),
    tenantAgreementUrl: str(data.tenantAgreementUrl),
  });
  await ctx.db.insert("phoneTenantMap", { companyId, phone, tenantId });

  if (unit) {
    await ctx.db.patch(unit._id, { status: "occupied" });
    // Start an active lease so recurring rent generates, if we know the rent and
    // the unit isn't already actively tenanted by someone else.
    const rent = typeof data.rentAmount === "number" ? data.rentAmount : unit.rentAmount;
    const occupants = await ctx.db
      .query("tenants")
      .withIndex("by_unit", (q) => q.eq("unitId", unit!._id))
      .collect();
    const clash = occupants.find((t) => t._id !== tenantId && t.status === "active");
    if (rent && !clash) {
      await ctx.db.insert("leases", {
        companyId,
        tenantId,
        unitId: unit._id,
        startDate: Date.now(),
        rentAmount: rent,
        billingDay: 1,
        status: "active",
      });
    }
  }

  if (typeof data.arrearsBroughtForward === "number") {
    await insertOpeningBalance(ctx, companyId, tenantId, unit?._id, data.arrearsBroughtForward);
  }
  return { resultId: tenantId };
}

async function commitLease(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  data: Record<string, any>,
  keys: { buildingName?: string; unitNumber?: string; tenantPhone?: string },
): Promise<CommitOutcome> {
  if (!keys.tenantPhone) return { parked: "Missing tenant phone" };
  const tenant = await findTenantByPhone(ctx, companyId, keys.tenantPhone);
  if (!tenant) return { parked: `Tenant ${keys.tenantPhone} not found — import tenants first` };
  const building = await findBuildingByName(ctx, companyId, keys.buildingName);
  if (!building) return { parked: `Building "${keys.buildingName ?? "?"}" not found` };
  const unit = await findUnit(ctx, building._id, keys.unitNumber);
  if (!unit) return { parked: `Unit "${keys.unitNumber ?? "?"}" not found — import units first` };
  if (typeof data.rentAmount !== "number") return { parked: "Missing rent amount" };

  // One active tenant per unit.
  const occupants = await ctx.db
    .query("tenants")
    .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
    .collect();
  const clash = occupants.find((t) => t._id !== tenant._id && t.status === "active");
  if (clash) return { parked: `Unit already assigned to ${clash.fullName}` };

  const billingDay =
    typeof data.billingDay === "number" && data.billingDay >= 1 && data.billingDay <= 28
      ? data.billingDay
      : 1;
  const leaseId = await ctx.db.insert("leases", {
    companyId,
    tenantId: tenant._id,
    unitId: unit._id,
    startDate: typeof data.startDate === "number" ? data.startDate : Date.now(),
    endDate: typeof data.endDate === "number" ? data.endDate : undefined,
    rentAmount: data.rentAmount,
    depositAmount: typeof data.depositAmount === "number" ? data.depositAmount : undefined,
    billingDay,
    status: "active",
  });
  await ctx.db.patch(unit._id, { status: "occupied" });
  await ctx.db.patch(tenant._id, { unitId: unit._id, status: "active" });
  return { resultId: leaseId };
}

/**
 * Commit a parsed batch. Writes ready+included rows in dependency order
 * (buildings → units → tenants → leases), resolving references by natural key
 * against the LIVE tables. Additive and idempotent: rows whose key already
 * exists are reused; rows that can't be resolved are PARKED (never lost), and
 * the batch becomes `partially_committed` if any remain.
 */
export const commitBatch = mutation({
  args: { batchId: v.id("importBatches") },
  handler: async (
    ctx,
    { batchId },
  ): Promise<{
    created: number;
    skipped: number;
    parked: number;
    skippedTenants: Array<{ name: string; phone: string; building: string | null }>;
  }> => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);
    if (b!.status !== "parsed" && b!.status !== "partially_committed") {
      throw new Error("This batch has already been processed");
    }

    const all = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();

    const toCommit = all
      .filter((r) => r.rowState === "ready" && r.include)
      .sort((x, y) => ENTITY_ORDER[x.entityType] - ENTITY_ORDER[y.entityType]);

    console.log(
      `[import] commitBatch: batch=${batchId} committing ${toCommit.length} rows ` +
        `(${toCommit.map((r) => r.entityType).join(",")})`,
    );

    let created = 0;
    let skipped = 0;
    // Which existing tenants we skipped (already in the DB) — surfaced to the
    // user so they see who/where rather than a bare "40 skipped".
    const skippedTenants: Array<{ name: string; phone: string; building: string | null }> = [];
    for (const row of toCommit) {
      const data = (row.data ?? {}) as Record<string, any>;
      const keys = row.naturalKeys ?? {};
      let outcome: CommitOutcome;
      switch (row.entityType) {
        case "landlord":
          outcome = await commitLandlord(ctx, companyId, data);
          break;
        case "building":
          outcome = await commitBuilding(ctx, companyId, data, keys);
          break;
        case "unit":
          outcome = await commitUnit(ctx, companyId, data, keys);
          break;
        case "tenant":
          outcome = await commitTenant(ctx, companyId, data, keys);
          break;
        case "lease":
          outcome = await commitLease(ctx, companyId, data, keys);
          break;
        default:
          outcome = { parked: "Unrecognised data" };
      }

      if ("resultId" in outcome) {
        await ctx.db.patch(row._id, {
          rowState: "committed",
          resultId: outcome.resultId,
          include: false,
        });
        if (outcome.reused) {
          skipped++;
          // Record the existing tenant + its building for the "already exists" modal.
          if (row.entityType === "tenant") {
            const existing = await ctx.db.get(outcome.resultId as Id<"tenants">);
            if (existing) {
              const building = existing.buildingId
                ? await ctx.db.get(existing.buildingId)
                : null;
              skippedTenants.push({
                name: existing.fullName,
                phone: existing.phone,
                building: building?.name ?? null,
              });
            }
          }
        } else created++;
      } else {
        console.log(`[import] parked ${row.entityType} "${rowTitleForLog(row)}": ${outcome.parked}`);
        await ctx.db.patch(row._id, {
          rowState: "parked",
          include: false,
          validation: { ok: false, message: outcome.parked },
        });
      }
    }

    // Recompute counts across the whole batch.
    const after = await ctx.db
      .query("importRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const committedCount = after.filter((r) => r.rowState === "committed").length;
    const parkedCount = after.filter((r) => r.rowState === "parked").length;
    const remainingReady = after.some((r) => r.rowState === "ready");
    await ctx.db.patch(batchId, {
      committedCount,
      parkedCount,
      status: parkedCount > 0 || remainingReady ? "partially_committed" : "committed",
    });

    console.log(
      `[import] commitBatch done: batch=${batchId} created=${created} skipped(existing)=${skipped} ` +
        `parked=${parkedCount} total=${committedCount}`,
    );
    return { created, skipped, parked: parkedCount, skippedTenants };
  },
});
