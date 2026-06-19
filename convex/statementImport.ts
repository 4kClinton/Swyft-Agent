import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

type StatementRow = {
  ref: string;
  amount: number;
  payerPhone?: string;
  payerName?: string;
  paidAt?: string; // ISO or parseable date
};

/**
 * Backfill / audit adapter (1stPlan.md §5.3 E): paste a bank/M-Pesa statement,
 * AI-parse the credit rows, and feed each through the same recordObserved
 * normaliser so historical payments reconcile against tenants. Idempotent on
 * each row's transaction ref. `account` routes the rows to the landlord.
 */
export const importStatement = action({
  args: { account: v.string(), statementText: v.string() },
  handler: async (
    ctx,
    { account, statementText },
  ): Promise<{ imported: number }> => {
    const me = await ctx.runQuery(api.companies.me, {});
    if (!me?.company) throw new Error("No company for caller");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const system =
      "Extract only CREDIT (money-in) transactions from this Kenyan bank/M-Pesa " +
      "statement. Return ONLY JSON {\"rows\":[{ref, amount, payerPhone?, " +
      "payerName?, paidAt?}]}. amount is a positive KES number. paidAt is an " +
      "ISO date if available. Ignore debits, fees, and balances.";

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
          { role: "user", content: statementText.slice(0, 60000) },
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const parsed: { rows?: StatementRow[] } = JSON.parse(
      data.choices?.[0]?.message?.content ?? "{}",
    );
    const rows = (parsed.rows ?? []).filter(
      (r) => r.ref && typeof r.amount === "number" && r.amount > 0,
    );

    let imported = 0;
    for (const row of rows) {
      await ctx.runMutation(internal.payments.recordObserved, {
        source: "statement",
        ref: row.ref,
        amount: row.amount,
        currency: "KES",
        payerPhone: row.payerPhone,
        payerName: row.payerName,
        account,
        paidAt: row.paidAt ? Date.parse(row.paidAt) || Date.now() : Date.now(),
        status: "SUCCESS",
        raw: row,
      });
      imported++;
    }
    return { imported };
  },
});
