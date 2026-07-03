import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { normalizePhone } from "./lib/phone";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Bulk agreement migration. PMs hold tens of thousands of signed PDFs; they
// upload them in bulk and we match each to a tenant BY FILENAME (the #1 key is
// the tenant phone — the same key the rest of import resolves on). Matched files
// become `agreements` rows; unmatched files are PARKED in `pendingAgreements`
// for manual assignment — nothing is ever dropped. See [[never-lose-import-data]].
// ---------------------------------------------------------------------------

/** Pull candidate phone numbers out of a filename (strips extension first). */
function phonesFromFilename(fileName: string): string[] {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  // Digit runs of 9–12 chars, optionally prefixed with + or 0 — covers
  // "0712345678", "254712345678", "+254712345678", "712345678".
  const matches = base.match(/\+?\d{9,12}/g) ?? [];
  return matches;
}

async function tenantForFilename(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  fileName: string,
): Promise<{ tenantId: Id<"tenants"> | null; guessedPhone?: string }> {
  for (const candidate of phonesFromFilename(fileName)) {
    const phone = normalizePhone(candidate);
    if (!phone) continue;
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_company_and_phone", (q) =>
        q.eq("companyId", companyId).eq("phone", phone),
      )
      .first();
    if (tenant) return { tenantId: tenant._id, guessedPhone: phone };
    // Remember the first plausible phone even if no tenant matched, so the
    // parked row can show the user what we read.
    return { tenantId: null, guessedPhone: phone };
  }
  return { tenantId: null };
}

/**
 * Match a batch of already-uploaded agreement files to tenants by filename.
 * Each file is { storageId, fileName }. Matched → an `agreements` row; unmatched
 * → a `pendingAgreements` row for manual resolution.
 */
export const bulkMatch = mutation({
  args: {
    files: v.array(
      v.object({ storageId: v.id("_storage"), fileName: v.string() }),
    ),
  },
  handler: async (ctx, { files }): Promise<{ matched: number; parked: number }> => {
    const { companyId } = await requireCompany(ctx);
    let matched = 0;
    let parked = 0;
    for (const f of files) {
      const { tenantId, guessedPhone } = await tenantForFilename(ctx, companyId, f.fileName);
      if (tenantId) {
        await ctx.db.insert("agreements", {
          companyId,
          tenantId,
          storageId: f.storageId,
          fileName: f.fileName,
          kind: "tenancy",
        });
        matched++;
      } else {
        await ctx.db.insert("pendingAgreements", {
          companyId,
          storageId: f.storageId,
          fileName: f.fileName,
          guessedPhone,
        });
        parked++;
      }
    }
    console.log(
      `[import] bulkMatch agreements: ${files.length} files → ${matched} matched, ${parked} parked`,
    );
    return { matched, parked };
  },
});

/** Parked (unmatched) agreement uploads awaiting manual assignment. */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const rows = await ctx.db
      .query("pendingAgreements")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return await Promise.all(
      rows.map(async (r) => ({ ...r, url: await ctx.storage.getUrl(r.storageId) })),
    );
  },
});

/** Assign a parked file to a tenant: create the agreement, drop the pending row. */
export const resolvePending = mutation({
  args: { pendingId: v.id("pendingAgreements"), tenantId: v.id("tenants") },
  handler: async (ctx, { pendingId, tenantId }) => {
    const { companyId } = await requireCompany(ctx);
    const pending = await ctx.db.get(pendingId);
    assertSameCompany(pending, companyId);
    assertSameCompany(await ctx.db.get(tenantId), companyId);
    await ctx.db.insert("agreements", {
      companyId,
      tenantId,
      storageId: pending!.storageId,
      fileName: pending!.fileName,
      kind: "tenancy",
    });
    await ctx.db.delete(pendingId);
    return null;
  },
});

/** Discard a parked file (also deletes the stored PDF). */
export const removePending = mutation({
  args: { pendingId: v.id("pendingAgreements") },
  handler: async (ctx, { pendingId }) => {
    const { companyId } = await requireCompany(ctx);
    const pending = await ctx.db.get(pendingId);
    assertSameCompany(pending, companyId);
    await ctx.storage.delete(pending!.storageId);
    await ctx.db.delete(pendingId);
    return null;
  },
});
