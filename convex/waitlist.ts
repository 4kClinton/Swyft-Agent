import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { normalizePhone } from "./lib/phone";

/**
 * Public waitlist capture for the landing page (Part A). The "bank used" +
 * "# units" fields tell us which adapters to prioritise and who to
 * concierge-onboard first. No auth — anyone can join.
 */
export const join = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    units: v.optional(v.number()),
    bankUsed: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone) ?? args.phone;
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        units: args.units,
        bankUsed: args.bankUsed,
        role: args.role,
      });
      return existing._id;
    }
    return await ctx.db.insert("waitlist", {
      name: args.name,
      phone,
      units: args.units,
      bankUsed: args.bankUsed,
      role: args.role,
    });
  },
});
