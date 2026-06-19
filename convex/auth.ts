import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

/**
 * Convex Auth — email/password (the plan also calls for OTP; add an Email
 * provider here once the SMS/email sender is wired). On first sign-up we seed
 * a `companyAccount` and an owner `profile` so all data is company-scoped from
 * day 1 (replaces lib/auth.ts + the Supabase `is_company_owner` logic).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string) ?? undefined,
          phone: (params.phone as string) ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx: MutationCtx, { userId, profile }) {
      // Only seed once — skip if this auth user already has a profile.
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (existing) return;

      await ctx.runMutation(internal.companies.seedForNewUser, {
        userId,
        email: (profile as { email?: string }).email,
        name: (profile as { name?: string }).name,
        phone: (profile as { phone?: string }).phone,
      });
    },
  },
});
