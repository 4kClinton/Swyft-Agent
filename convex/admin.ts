import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requirePropertyManager } from "./lib/rbac";

// Roles a property manager may assign to staff. Owners/landlords are not
// assignable here.
const assignableRole = v.union(v.literal("manager"), v.literal("agent"));

/**
 * Team roster for the admin screen: every profile in the property-manager
 * company plus any still-pending invites. Property-manager managers only.
 */
export const team = query({
  args: {},
  handler: async (ctx) => {
    const { companyId, profile: me } = await requirePropertyManager(ctx);

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();

    const members = profiles.map((p) => ({
      profileId: p._id,
      userId: p.userId,
      fullName: p.fullName,
      phone: p.phone,
      role: p.role,
      isCompanyOwner: p.isCompanyOwner,
      isSelf: p._id === me._id,
    }));

    const invites = (
      await ctx.db
        .query("memberInvites")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect()
    )
      .filter((i) => i.status === "pending")
      .map((i) => ({ inviteId: i._id, email: i.email, role: i.role }));

    return { members, invites };
  },
});

/**
 * Record a pending invite for `email` with `role` in the caller's company.
 * Called on its own (e.g. to re-issue) or as the first step of `createMember`.
 * Returns the companyId so the caller can proceed to create the account.
 */
export const inviteMember = mutation({
  args: { email: v.string(), role: assignableRole },
  handler: async (ctx, { email, role }) => {
    const { companyId, profile } = await requirePropertyManager(ctx);
    const normalised = email.trim().toLowerCase();
    if (!normalised) throw new Error("Email is required");

    // Replace any existing pending invite for this email in this company.
    const existing = await ctx.db
      .query("memberInvites")
      .withIndex("by_email", (q) => q.eq("email", normalised))
      .collect();
    for (const inv of existing) {
      if (inv.companyId === companyId && inv.status === "pending") {
        await ctx.db.patch(inv._id, { role });
        return { companyId };
      }
    }

    await ctx.db.insert("memberInvites", {
      companyId,
      email: normalised,
      role,
      invitedBy: profile._id,
      status: "pending",
    });
    return { companyId };
  },
});

/**
 * Create a team-member account (manager or agent) under the caller's
 * property-manager company. Runs as an action because Convex Auth account
 * creation requires one. The pending invite recorded first is consumed by the
 * auth `afterUserCreatedOrUpdated` hook, which attaches the new user to this
 * company with the invited role.
 */
export const createMember = action({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: assignableRole,
    tempPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (args.tempPassword.length < 8) {
      throw new Error("Temporary password must be at least 8 characters");
    }

    // Authorise + record the invite (throws if caller isn't a PM manager).
    await ctx.runMutation(api.admin.inviteMember, { email, role: args.role });

    await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: email, secret: args.tempPassword },
      profile: {
        email,
        ...(args.name ? { name: args.name } : {}),
        ...(args.phone ? { phone: args.phone } : {}),
      } as DataModel["users"]["document"],
    });

    return { email };
  },
});

/** Change a member's role. Cannot target the company owner or yourself. */
export const updateMemberRole = mutation({
  args: { profileId: v.id("profiles"), role: assignableRole },
  handler: async (ctx, { profileId, role }) => {
    const { companyId, profile: me } = await requirePropertyManager(ctx);
    const target = await ctx.db.get(profileId);
    if (!target || target.companyId !== companyId) {
      throw new Error("Member not found");
    }
    if (target.isCompanyOwner) throw new Error("Cannot change the owner's role");
    if (target._id === me._id) throw new Error("Use account settings to change your own role");
    await ctx.db.patch(profileId, { role });
    return null;
  },
});

/** Remove a member from the company. Cannot remove the owner or yourself. */
export const removeMember = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const { companyId, profile: me } = await requirePropertyManager(ctx);
    const target = await ctx.db.get(profileId);
    if (!target || target.companyId !== companyId) {
      throw new Error("Member not found");
    }
    if (target.isCompanyOwner) throw new Error("Cannot remove the company owner");
    if (target._id === me._id) throw new Error("You cannot remove yourself");
    await ctx.db.delete(profileId);
    return null;
  },
});

/** Cancel a pending invite. */
export const revokeInvite = mutation({
  args: { inviteId: v.id("memberInvites") },
  handler: async (ctx, { inviteId }) => {
    const { companyId } = await requirePropertyManager(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.companyId !== companyId) {
      throw new Error("Invite not found");
    }
    await ctx.db.patch(inviteId, { status: "revoked" });
    return null;
  },
});
