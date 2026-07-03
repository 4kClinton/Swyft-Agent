import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCompany, requireRole, assertSameCompany } from "./lib/rbac";
import { isVerifiedSource } from "./lib/paymentSource";
import { normalizePhone } from "./lib/phone";
import { statementDirectionValidator } from "./schema";

// ---------------------------------------------------------------------------
// Statement-upload front — deterministic bank-statement import (Equity v0).
// Flow: generateUploadUrl → client PUTs the PDF to storage → statementExtract
// (Node action) parses + stages rows here → landlord previews → commitBatch
// feeds the included credits through the LIVE engine (payments.recordObserved).
// ---------------------------------------------------------------------------

/** Signed URL the client uploads the raw PDF to. Auth-guarded. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "manager"); // landlord/manager only
    return await ctx.storage.generateUploadUrl();
  },
});

/** Persist a parsed batch + its staged rows (called by the extract action). */
export const insertParsedBatch = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    buildingId: v.optional(v.id("buildings")),
    account: v.string(),
    fileName: v.optional(v.string()),
    rows: v.array(
      v.object({
        date: v.number(),
        amount: v.number(),
        direction: statementDirectionValidator,
        ref: v.string(),
        payerName: v.optional(v.string()),
        payerPhone: v.optional(v.string()),
        rawLine: v.string(),
      }),
    ),
  },
  handler: async (ctx, a): Promise<Id<"statementBatches">> => {
    const creditCount = a.rows.filter((r) => r.direction === "credit").length;
    const batchId = await ctx.db.insert("statementBatches", {
      companyId: a.companyId,
      buildingId: a.buildingId,
      account: a.account,
      source: "equity",
      status: "parsed",
      fileName: a.fileName,
      rowCount: a.rows.length,
      creditCount,
    });
    for (const r of a.rows) {
      await ctx.db.insert("statementRows", {
        companyId: a.companyId,
        batchId,
        date: r.date,
        amount: r.amount,
        direction: r.direction,
        ref: r.ref,
        payerName: r.payerName,
        payerPhone: r.payerPhone
          ? (normalizePhone(r.payerPhone) ?? r.payerPhone)
          : undefined,
        rawLine: r.rawLine,
        // Default: include credits (those reconcile), exclude debits.
        include: r.direction === "credit",
      });
    }
    return batchId;
  },
});

/** Record an extraction failure so the UI can surface it. */
export const markBatchFailed = internalMutation({
  args: {
    companyId: v.id("companyAccounts"),
    account: v.string(),
    fileName: v.optional(v.string()),
    error: v.string(),
  },
  handler: async (ctx, a): Promise<Id<"statementBatches">> => {
    return await ctx.db.insert("statementBatches", {
      companyId: a.companyId,
      account: a.account,
      source: "equity",
      status: "failed",
      fileName: a.fileName,
      rowCount: 0,
      creditCount: 0,
      error: a.error,
    });
  },
});

/** Recent batches for the company (most recent first). */
export const listBatches = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    return await ctx.db
      .query("statementBatches")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(50);
  },
});

/** A batch + its staged rows, for the preview table. */
export const batch = query({
  args: { batchId: v.id("statementBatches") },
  handler: async (ctx, { batchId }) => {
    const { companyId } = await requireCompany(ctx);
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);
    const rows = await ctx.db
      .query("statementRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    rows.sort((a, c) => a.date - c.date);
    return { batch: b, rows };
  },
});

/** Toggle whether a staged row will be committed. */
export const setRowIncluded = mutation({
  args: { rowId: v.id("statementRows"), include: v.boolean() },
  handler: async (ctx, { rowId, include }) => {
    const { companyId } = await requireCompany(ctx);
    const row = await ctx.db.get(rowId);
    assertSameCompany(row, companyId);
    await ctx.db.patch(rowId, { include });
    return null;
  },
});

/**
 * Ensure a VERIFIED payment source owns `account` for this company — "statement
 * upload implies ownership". Reuses the clash guard from paymentSources.ts: if
 * another company has already verified this number we refuse; otherwise we
 * create (or promote) the caller's source as verified via the statement_upload
 * method, and auto-reject rival pending claims. Returns nothing; throws to abort.
 */
async function ensureVerifiedStatementSource(
  ctx: MutationCtx,
  companyId: Id<"companyAccounts">,
  account: string,
  buildingId: Id<"buildings"> | undefined,
  authorisedBy: Id<"profiles">,
): Promise<void> {
  const now = Date.now();
  const claims = await ctx.db
    .query("paymentSources")
    .withIndex("by_account", (q) => q.eq("accountNumber", account))
    .take(100);

  const verifiedOwner = claims.find(isVerifiedSource);
  if (verifiedOwner) {
    if (verifiedOwner.companyId !== companyId) {
      throw new Error(
        "That account number is already verified by another company",
      );
    }
    return; // already ours and verified
  }

  // Promote an existing pending claim of ours, else create a fresh verified one.
  const ownPending = claims.find(
    (s) => s.companyId === companyId && s.status === "pending",
  );
  if (ownPending) {
    await ctx.db.patch(ownPending._id, {
      status: "verified",
      active: true,
      verifiedAt: now,
      verificationMethod: "statement_upload",
      buildingId: buildingId ?? ownPending.buildingId,
      verifyLockedUntil: undefined,
    });
  } else {
    await ctx.db.insert("paymentSources", {
      companyId,
      buildingId,
      adapter: "statement",
      accountNumber: account,
      active: true,
      status: "verified",
      verificationMethod: "statement_upload",
      verifiedAt: now,
      authorisedBy,
      authorisedAt: now,
    });
  }

  // Auto-reject every OTHER pending claim on the same number.
  for (const c of claims) {
    if (c.companyId !== companyId && c.status === "pending") {
      await ctx.db.patch(c._id, { status: "rejected", active: false });
    }
  }
}

/**
 * Commit a parsed batch: verify ownership of the account, then feed each
 * INCLUDED CREDIT row through `payments.recordObserved` (the same normaliser the
 * live IPNs use), which routes to this company and schedules reconciliation.
 * Idempotent end to end — recordObserved dedupes on `ref`, so re-committing or
 * re-uploading the same statement adds nothing.
 */
export const commitBatch = mutation({
  args: { batchId: v.id("statementBatches") },
  handler: async (
    ctx,
    { batchId },
  ): Promise<{ committed: number }> => {
    const profile = await requireRole(ctx, "manager");
    const companyId = profile.companyId;
    const b = await ctx.db.get(batchId);
    assertSameCompany(b, companyId);
    if (b!.status !== "parsed") {
      throw new Error("This statement has already been processed");
    }

    await ensureVerifiedStatementSource(
      ctx,
      companyId,
      b!.account,
      b!.buildingId,
      profile._id,
    );

    const rows = await ctx.db
      .query("statementRows")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();

    let committed = 0;
    for (const r of rows) {
      if (!r.include || r.direction !== "credit") continue;
      const paymentId: Id<"payments"> = await ctx.runMutation(
        internal.payments.recordObserved,
        {
          source: "statement",
          ref: r.ref,
          amount: r.amount,
          currency: "KES",
          payerPhone: r.payerPhone,
          payerName: r.payerName,
          account: b!.account,
          paidAt: r.date || Date.now(),
          status: "SUCCESS",
          raw: { statementBatchId: batchId, rawLine: r.rawLine },
        },
      );
      await ctx.db.patch(r._id, { paymentId });
      committed++;
    }

    await ctx.db.patch(batchId, { status: "committed", committedAt: Date.now() });
    return { committed };
  },
});
