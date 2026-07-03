"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateStructured } from "./lib/gateway";
import {
  applyMapping,
  buildMappingPrompt,
  MappingResultSchema,
  type StagedRow,
} from "./lib/importMap";
import { importEntityValidator } from "./schema";
import type { ImportEntity } from "./lib/importSchema";

// ---------------------------------------------------------------------------
// AI column-mapping (Node action). Claude via the Vercel AI Gateway maps each
// sheet's columns onto our schema ONCE; deterministic `applyMapping` then expands
// that over every row. The model never receives or writes the full dataset.
// ---------------------------------------------------------------------------

type Sheet = { sheetName?: string; headers: string[]; rows: Array<Record<string, unknown>> };

async function stageSheet(
  sheet: Sheet,
  forcedEntity?: ImportEntity,
  existingBuildings?: string[],
): Promise<StagedRow[]> {
  if (!sheet.rows.length) return [];
  const prompt = buildMappingPrompt(sheet.headers, sheet.rows, {
    sheetName: sheet.sheetName,
    forcedEntity,
    existingBuildings,
  });
  let mapping = await generateStructured(MappingResultSchema, prompt);
  if (forcedEntity) mapping = { ...mapping, entityType: forcedEntity, confidence: 1 };
  const staged = applyMapping(mapping, sheet.rows);
  const ready = staged.filter((r) => r.rowState === "ready").length;
  console.log(
    `[import] sheet "${sheet.sheetName ?? ""}": ${sheet.rows.length} rows → ${staged[0]?.entityType ?? "?"} ` +
      `(${ready} ready, ${staged.length - ready} parked)`,
  );
  return staged;
}

const toStagedArg = (rows: StagedRow[], sheetName?: string) =>
  rows.map((r) => ({
    sheetName,
    entityType: r.entityType,
    rawRow: r.rawRow,
    data: r.data,
    extra: r.extra,
    naturalKeys: r.naturalKeys,
    rowState: r.rowState,
    include: r.include,
    validation: r.validation,
  }));

/**
 * Parse an uploaded migration file: the client has already stored the raw file
 * (rawStorageId) and parsed it into sheets. We AI-map each sheet, stage the rows,
 * and return the batch id for preview.
 */
export const parseUpload = action({
  args: {
    rawStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    // When set, every sheet is treated as this entity (the typed importers know
    // what they're uploading, so the AI only needs to map columns — not guess type).
    entityType: v.optional(importEntityValidator),
    sheets: v.array(
      v.object({
        sheetName: v.optional(v.string()),
        headers: v.array(v.string()),
        rows: v.array(v.any()),
      }),
    ),
  },
  handler: async (ctx, a): Promise<{ batchId: Id<"importBatches"> }> => {
    const me = await ctx.runQuery(api.companies.me, {});
    const companyId = me?.company?._id as Id<"companyAccounts"> | undefined;
    if (!companyId) throw new Error("No company for caller");

    const totalRows = a.sheets.reduce((n, s) => n + s.rows.length, 0);
    console.log(
      `[import] parseUpload: file="${a.fileName ?? ""}" sheets=${a.sheets.length} rows=${totalRows} ` +
        `forced=${a.entityType ?? "auto"} company=${companyId}`,
    );

    const batchId = await ctx.runMutation(internal.import.createBatch, {
      companyId,
      createdBy: me?.profile?._id,
      fileName: a.fileName,
      rawStorageId: a.rawStorageId,
    });

    const forced =
      a.entityType && a.entityType !== "unknown" ? (a.entityType as ImportEntity) : undefined;
    const existing = (await ctx.runQuery(api.buildings.list, {})).map((b) => b.name);

    try {
      for (const sheet of a.sheets) {
        const staged = await stageSheet(sheet, forced, existing);
        if (staged.length === 0) continue;
        await ctx.runMutation(internal.import.insertParsedRows, {
          batchId,
          rows: toStagedArg(staged, sheet.sheetName),
        });
      }
      console.log(`[import] parseUpload done: batch=${batchId}`);
      return { batchId };
    } catch (err) {
      console.error(
        `[import] parseUpload failed for batch=${batchId}:`,
        err instanceof Error ? err.message : String(err),
      );
      await ctx.runMutation(internal.import.markBatchFailed, {
        batchId,
        error: err instanceof Error ? err.message : "Parsing failed",
      });
      throw err;
    }
  },
});

/**
 * Re-parse an existing batch from its retained raw rows (possible because we
 * never delete raw). `overrides` force a sheet's entity type when the user
 * corrects a misdetection. Committed rows are untouched.
 */
export const reparseBatch = action({
  args: {
    batchId: v.id("importBatches"),
    overrides: v.optional(
      v.array(v.object({ sheetName: v.optional(v.string()), entityType: importEntityValidator })),
    ),
  },
  handler: async (ctx, a): Promise<{ batchId: Id<"importBatches"> }> => {
    const raw = await ctx.runQuery(api.import.rawForReparse, { batchId: a.batchId });
    const existing = (await ctx.runQuery(api.buildings.list, {})).map((b) => b.name);
    console.log(`[import] reparseBatch: batch=${a.batchId} rows=${raw.length} overrides=${a.overrides?.length ?? 0}`);

    // Regroup retained raw rows by sheet.
    const bySheet = new Map<string, Array<Record<string, unknown>>>();
    for (const r of raw) {
      const key = r.sheetName ?? "";
      const list = bySheet.get(key) ?? [];
      list.push((r.rawRow ?? {}) as Record<string, unknown>);
      bySheet.set(key, list);
    }

    const overrideFor = (name: string): ImportEntity | undefined => {
      const o = a.overrides?.find((x) => (x.sheetName ?? "") === name);
      return o && o.entityType !== "unknown" ? (o.entityType as ImportEntity) : undefined;
    };

    const allRows: ReturnType<typeof toStagedArg> = [];
    for (const [sheetName, rows] of bySheet) {
      const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const staged = await stageSheet(
        { sheetName: sheetName || undefined, headers, rows },
        overrideFor(sheetName),
        existing,
      );
      allRows.push(...toStagedArg(staged, sheetName || undefined));
    }

    await ctx.runMutation(internal.import.replaceRows, { batchId: a.batchId, rows: allRows });
    return { batchId: a.batchId };
  },
});
