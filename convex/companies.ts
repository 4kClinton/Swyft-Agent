import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProfile, requireRole } from "./lib/rbac";
import { companyKindValidator } from "./schema";

/**
 * Provision a profile for a newly created auth user. Called from auth.ts
 * `afterUserCreatedOrUpdated`. Internal only.
 *
 * If a pending `memberInvites` row matches the user's email, the user is
 * attached to that (property-manager) company with the invited role. Otherwise
 * we seed a brand-new landlord company + landlord profile (the default for
 * self-service sign-ups).
 */
export const seedForNewUser = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email?.trim().toLowerCase();

    // 1) Invited team member → join the inviting company.
    if (email) {
      const invite = await ctx.db
        .query("memberInvites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .first();
      if (invite) {
        await ctx.db.insert("profiles", {
          userId: args.userId,
          companyId: invite.companyId,
          fullName: args.name,
          phone: args.phone,
          role: invite.role,
          isCompanyOwner: false,
        });
        await ctx.db.patch(invite._id, { status: "accepted" });
        return invite.companyId;
      }
    }

    // 2) Default self-service sign-up → new landlord company.
    const companyId = await ctx.db.insert("companyAccounts", {
      name: args.name ? `${args.name}'s Company` : "My Company",
      kind: "landlord",
      email: args.email,
      phone: args.phone,
      plan: "free",
      status: "trial",
    });

    await ctx.db.insert("profiles", {
      userId: args.userId,
      companyId,
      fullName: args.name,
      phone: args.phone,
      role: "landlord",
      isCompanyOwner: true,
    });

    return companyId;
  },
});

/**
 * The signed-in user's profile + company. Returns null (instead of throwing)
 * when there's no authenticated user or the profile hasn't been seeded yet, so
 * the client can handle those states gracefully rather than crashing on a
 * server error. Callers should treat `null` as "not ready / no profile".
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const authUser = await ctx.db.get(userId);
    const email = (authUser as { email?: string } | null)?.email;
    if (!profile) {
      // Authenticated but unseeded (legacy/broken account or seed in flight).
      return { profile: null, company: null, email };
    }
    const company = await ctx.db.get(profile.companyId);
    return {
      profile,
      company,
      email,
    };
  },
});

/** Company owner only: update company profile. */
export const updateCompany = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    size: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireRole(ctx, "landlord");
    await ctx.db.patch(profile.companyId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.email !== undefined && { email: args.email }),
      ...(args.phone !== undefined && { phone: args.phone }),
      ...(args.address !== undefined && { address: args.address }),
      ...(args.size !== undefined && { size: args.size }),
      ...(args.description !== undefined && { description: args.description }),
    });
    return null;
  },
});

/**
 * Company owner only: switch the company between landlord and property manager.
 * The owner's own role follows the model — a PM company owner is a `manager`,
 * a landlord company owner is a `landlord`.
 */
export const setCompanyKind = mutation({
  args: { kind: companyKindValidator },
  handler: async (ctx, { kind }) => {
    const profile = await requireProfile(ctx);
    if (!profile.isCompanyOwner) {
      throw new Error("Only the company owner can change the company type");
    }
    await ctx.db.patch(profile.companyId, { kind });
    await ctx.db.patch(profile._id, {
      role: kind === "property_manager" ? "manager" : "landlord",
    });
    return null;
  },
});
