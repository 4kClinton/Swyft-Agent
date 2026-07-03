"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  reconstructLines,
  parseEquityStatement,
  type TextItem,
  type Line,
} from "./lib/equityStatement";
import { installDomMatrixPolyfill } from "./lib/domMatrixPolyfill";

// ---------------------------------------------------------------------------
// Equity statement extraction (Node action). Decrypts the password-protected
// PDF with pdfjs-dist, reconstructs tabular lines from positioned glyph runs
// (x/y, NOT naive concatenation), runs the deterministic adapter, stages the
// rows, and DELETES the raw PDF from storage. The password is used in-memory
// only — never persisted, never logged.
// ---------------------------------------------------------------------------

type ExtractResult =
  | { ok: true; batchId: Id<"statementBatches">; rowCount: number; creditCount: number }
  | { ok: false; reason: "password_required" | "wrong_password" | "parse_failed"; batchId?: Id<"statementBatches"> };

export const extractEquityStatement = action({
  args: {
    storageId: v.id("_storage"),
    account: v.string(),
    password: v.optional(v.string()),
    buildingId: v.optional(v.id("buildings")),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<ExtractResult> => {
    const me = await ctx.runQuery(api.companies.me, {});
    const companyId = me?.company?._id as Id<"companyAccounts"> | undefined;
    if (!companyId) throw new Error("No company for caller");

    const account = a.account.trim();
    if (!account) throw new Error("Account number is required");

    const blob = await ctx.storage.get(a.storageId);
    if (!blob) throw new Error("Uploaded file not found");
    const data = new Uint8Array(await blob.arrayBuffer());

    // Always remove the raw PDF — we persist only parsed rows, regardless of
    // success. (Re-upload is cheap; storing bank statements is a liability.)
    const cleanup = async () => {
      try {
        await ctx.storage.delete(a.storageId);
      } catch {
        /* best-effort */
      }
    };

    let lines: Line[];
    try {
      lines = await extractLines(data, a.password);
    } catch (err) {
      await cleanup();
      const reason = passwordErrorReason(err);
      if (reason) {
        console.log(`[stmt] extraction stopped: ${reason}`);
        return { ok: false, reason };
      }
      console.error(
        `[stmt] extraction failed:`,
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
      const batchId = await ctx.runMutation(internal.statementUpload.markBatchFailed, {
        companyId,
        account,
        fileName: a.fileName,
        error: err instanceof Error ? err.message : "Extraction failed",
      });
      return { ok: false, reason: "parse_failed", batchId };
    }
    await cleanup();

    // Debug gate: print the reconstructed table when STATEMENT_DEBUG is set, so
    // the Equity column layout can be confirmed before the adapter is calibrated.
    // Gated to keep payer PII out of prod logs.
    if (process.env.STATEMENT_DEBUG) {
      for (const l of lines) console.log("[stmt]", l.text);
    }

    const parsed = parseEquityStatement(lines);
    const batchId = await ctx.runMutation(internal.statementUpload.insertParsedBatch, {
      companyId,
      buildingId: a.buildingId,
      account,
      fileName: a.fileName,
      rows: parsed.map((r) => ({
        date: r.date,
        amount: r.amount,
        direction: r.direction,
        ref: r.ref,
        payerName: r.payerName,
        payerPhone: r.payerPhone,
        rawLine: r.rawLine,
      })),
    });

    const creditCount = parsed.filter((r) => r.direction === "credit").length;
    // Diagnostic (no PII): how many visual lines came out vs. how many parsed as
    // transactions. lines>0 but rows==0 means the adapter heuristics need
    // calibrating against this statement's real layout (set STATEMENT_DEBUG to dump).
    console.log(
      `[stmt] extracted ${lines.length} lines -> ${parsed.length} rows (${creditCount} credit)`,
    );

    return {
      ok: true,
      batchId,
      rowCount: parsed.length,
      creditCount,
    };
  },
});

/** Load the PDF with pdfjs-dist (legacy/Node build) and reconstruct lines per page. */
async function extractLines(data: Uint8Array, password?: string): Promise<Line[]> {
  // pdfjs constructs `new DOMMatrix()` at module-eval time; the Convex Node
  // runtime has no DOMMatrix and we don't ship @napi-rs/canvas. Install our
  // polyfill BEFORE the import or it throws `DOMMatrix is not defined`.
  installDomMatrixPolyfill();
  // Dynamic import of the legacy ESM build — works in the Convex Node runtime
  // without a DOM/worker. pdfjs-dist is marked external in convex.json so it's
  // installed (not bundled) and its worker file resolves at the real path below.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // No web worker in the Node runtime: pdfjs falls back to a "fake worker" that
  // dynamically imports this module. Point it at the legacy worker explicitly so
  // the import resolves to the installed file.
  pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
  // verbosity 0 = ERRORS only. Silences the harmless "Cannot load @napi-rs/canvas"
  // / "Cannot polyfill DOMMatrix" warnings — we extract text, never render, so the
  // missing canvas/DOM shims are irrelevant.
  const loadingTask = pdfjs.getDocument({
    data,
    password,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  } as Parameters<typeof pdfjs.getDocument>[0]);
  const doc = await loadingTask.promise;

  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof it.str === "string" && it.transform) {
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
      }
    }
    // Reconstruct per page — pdfjs y-coordinates reset each page, so clustering
    // must not span pages (different rows would collide at the same y).
    lines.push(...reconstructLines(items));
  }
  await loadingTask.destroy();
  return lines;
}

/**
 * Map a pdfjs PasswordException to a UI-friendly reason. code 1 = NEED_PASSWORD
 * (encrypted, none supplied), code 2 = INCORRECT_PASSWORD.
 */
function passwordErrorReason(
  err: unknown,
): "password_required" | "wrong_password" | null {
  const e = err as { name?: string; code?: number; message?: string };
  const isPwd =
    e?.name === "PasswordException" || /password/i.test(e?.message ?? "");
  if (!isPwd) return null;
  if (e?.code === 2 || /incorrect/i.test(e?.message ?? "")) return "wrong_password";
  return "password_required";
}
