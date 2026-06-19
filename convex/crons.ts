import { cronJobs } from "convex/server";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Daily recurring-invoice run. We compute today's day-of-month + period in an
 * action (timezone-aware), then call the generator mutation. Runs once a day.
 */
export const runDailyInvoicing = internalAction({
  args: {},
  handler: async (ctx) => {
    // Use East Africa Time (UTC+3) so billing day lines up with Kenya.
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const day = now.getUTCDate();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    // Billing days are capped at 28 (schema), so no month-length edge cases.
    if (day > 28) return;
    await ctx.runMutation(internal.invoices.generateRecurring, { day, period });
  },
});

const crons = cronJobs();

// 06:00 EAT == 03:00 UTC.
crons.cron(
  "daily recurring invoicing",
  "0 3 * * *",
  internal.crons.runDailyInvoicing,
  {},
);

export default crons;
