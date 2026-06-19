import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type ImportRow = {
  fullName: string;
  phone: string;
  unitNumber?: string;
  rentAmount?: number;
  arrearsBroughtForward?: number;
};

/**
 * AI smart-import: take pasted CSV/Excel text of a landlord's existing tenant
 * list and structure it into tenant rows via OpenAI, then bulk-insert (phones
 * normalised + validated, arrears brought forward). Replaces the legacy
 * /api/analyze-data route. fetch() works in the default runtime — no node.
 */
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const system =
      "You convert messy Kenyan landlord tenant spreadsheets into clean JSON. " +
      "Return ONLY JSON of shape {\"rows\":[{fullName, phone, unitNumber?, " +
      "rentAmount?, arrearsBroughtForward?}]}. Keep phones exactly as given " +
      "(normalisation happens downstream). rentAmount/arrears are numbers in KES.";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: csvText.slice(0, 50000) },
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { rows?: ImportRow[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Model did not return valid JSON");
    }
    const rows = (parsed.rows ?? []).filter((r) => r.fullName && r.phone);

    return await ctx.runMutation(internal.tenants.bulkImport, {
      companyId,
      rows,
    });
  },
});
