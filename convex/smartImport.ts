"use node";

import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateStructured } from "./lib/gateway";

// AI smart-import (paste a tenant CSV on the /tenants page): Claude via the
// Vercel AI Gateway structures the rows, then bulkImport inserts them (phones
// normalised + validated downstream, arrears carried forward). Shares the gateway
// helper + model fallback with the full /import pipeline.

// Keep every field a string — models reliably emit strings, and numbers in
// spreadsheets arrive as "25,000" / "KES 5000" anyway. We coerce below. Strict
// number fields are the usual cause of "response did not match schema".
const TenantRowsSchema = z.object({
  rows: z.array(
    z.object({
      fullName: z.string().nullish(),
      phone: z.string().nullish(),
      unitNumber: z.string().nullish(),
      rentAmount: z.string().nullish(),
      arrearsBroughtForward: z.string().nullish(),
    }),
  ),
});

function toNum(s: string | null | undefined): number | undefined {
  if (s == null) return undefined;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export const importTenantsCsv = action({
  args: { csvText: v.string() },
  handler: async (
    ctx,
    { csvText },
  ): Promise<{ created: number; skipped: number; errors: string[] }> => {
    // Derive the company server-side from the caller's auth (never trust args).
    const me = await ctx.runQuery(api.companies.me, {});
    const companyId = me?.company?._id as Id<"companyAccounts"> | undefined;
    if (!companyId) throw new Error("No company for caller");

    const prompt =
      "Convert this messy Kenyan landlord tenant spreadsheet/CSV into clean tenant rows. " +
      "Keep phone numbers EXACTLY as given (normalisation happens downstream). " +
      "rentAmount and arrearsBroughtForward are numbers in KES (strip any currency symbols/commas). " +
      "Only include rows that have at least a name and a phone.\n\nCSV:\n" +
      csvText.slice(0, 50000);

    console.log(`[import] smartImport: structuring ${csvText.length} chars of CSV`);
    const { rows } = await generateStructured(TenantRowsSchema, prompt);
    const clean = rows
      .filter((r): r is { fullName: string; phone: string } & typeof r => Boolean(r.fullName && r.phone))
      .map((r) => ({
        fullName: r.fullName!,
        phone: r.phone!,
        unitNumber: r.unitNumber ?? undefined,
        rentAmount: toNum(r.rentAmount),
        arrearsBroughtForward: toNum(r.arrearsBroughtForward),
      }));
    console.log(`[import] smartImport: ${rows.length} parsed → ${clean.length} usable tenant rows`);

    const result = await ctx.runMutation(internal.tenants.bulkImport, {
      companyId,
      rows: clean,
    });
    console.log(
      `[import] smartImport done: created=${result.created} skipped=${result.skipped} errors=${result.errors.length}`,
    );
    return result;
  },
});
