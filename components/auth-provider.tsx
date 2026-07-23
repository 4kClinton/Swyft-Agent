"use client"

import type React from "react"
import { createContext, useContext } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@/convex/_generated/api"
import type { SubscriptionState } from "@/convex/lib/subscription"

// Minimal user shape the app relies on (id + email + role + company).
export interface AppUser {
  id: string
  email?: string
  role?: string
  isCompanyOwner?: boolean
  // Cross-company Swyft super-admin — gates the hidden /platform area.
  isPlatformAdmin?: boolean
  companyId?: string
  companyName?: string
  // "landlord" | "property_manager" — gates the admin/team area.
  companyKind?: string
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  // True when the session is authenticated but no profile row exists (legacy/
  // broken account, or seed still in flight). UI should handle this gracefully.
  profileMissing: boolean
  // Subscription entitlement (trial/active/grace/expired). Null until loaded or
  // when there's no company. The SubscriptionGate reads this to gate the app.
  subscription: SubscriptionState | null
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (
    email: string,
    password: string,
    profile?: { name?: string; phone?: string },
  ) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Convex Auth surfaces raw server errors (with stack traces and internal codes
// like "InvalidSecret") in error.message. Translate the ones users can act on
// into friendly copy; fall back to a generic message so we never leak internals.
export function friendlyAuthError(error: unknown, flow: "signIn" | "signUp"): string {
  const raw = error instanceof Error ? error.message : String(error ?? "")

  // Wrong password, or account lookup failed during sign-in.
  if (/InvalidSecret|InvalidAccountId/i.test(raw)) {
    return flow === "signIn"
      ? "Incorrect email or password. Please try again."
      : "We couldn't complete sign-up. Please check your details and try again."
  }

  // Email already registered (sign-up).
  if (/already (exists|in use|registered)|duplicate|unique/i.test(raw)) {
    return "An account with this email already exists. Try signing in instead."
  }

  // Password strength / validation from the Password provider.
  if (/password/i.test(raw) && /(short|weak|least|invalid|characters)/i.test(raw)) {
    return "Password is too weak. Use at least 6 characters."
  }

  // Malformed email.
  if (/email/i.test(raw) && /invalid/i.test(raw)) {
    return "Please enter a valid email address."
  }

  // Network / connectivity.
  if (/network|fetch|timeout|failed to fetch/i.test(raw)) {
    return "Network error. Check your connection and try again."
  }

  return flow === "signIn"
    ? "Something went wrong signing in. Please try again."
    : "Something went wrong creating your account. Please try again."
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions()

  // Only query the profile once authenticated.
  const me = useQuery(api.companies.me, isAuthenticated ? {} : "skip")

  const user: AppUser | null = isAuthenticated
    ? {
        id: me?.profile?.userId ?? "",
        email: me?.email,
        role: me?.profile?.role,
        isCompanyOwner: me?.profile?.isCompanyOwner,
        isPlatformAdmin: me?.profile?.isPlatformAdmin,
        companyId: me?.profile?.companyId,
        companyName: me?.company?.name,
        companyKind: me?.company?.kind,
      }
    : null

  // Loading until Convex auth resolves, and (when authed) until the profile loads.
  const loading = isLoading || (isAuthenticated && me === undefined)

  // Authenticated, query resolved, but no profile was seeded for this user.
  const profileMissing = Boolean(isAuthenticated) && !!me && me.profile === null

  const subscription = (me?.subscription ?? null) as SubscriptionState | null

  const signIn = async (email: string, password: string) => {
    try {
      await convexSignIn("password", { email: email.trim().toLowerCase(), password, flow: "signIn" })
      return { error: null }
    } catch (error) {
      return { error: new Error(friendlyAuthError(error, "signIn")) }
    }
  }

  const signUp = async (
    email: string,
    password: string,
    profile?: { name?: string; phone?: string },
  ) => {
    try {
      await convexSignIn("password", {
        email: email.trim().toLowerCase(),
        password,
        ...(profile?.name ? { name: profile.name } : {}),
        ...(profile?.phone ? { phone: profile.phone } : {}),
        flow: "signUp",
      })
      return { error: null }
    } catch (error) {
      return { error: new Error(friendlyAuthError(error, "signUp")) }
    }
  }

  const signOut = async () => {
    await convexSignOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, profileMissing, subscription, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
