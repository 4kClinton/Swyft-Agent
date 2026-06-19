"use client"

import type React from "react"
import { createContext, useContext } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@/convex/_generated/api"

// Minimal user shape the app relies on (id + email + role + company).
export interface AppUser {
  id: string
  email?: string
  role?: string
  isCompanyOwner?: boolean
  companyId?: string
  // "landlord" | "property_manager" — gates the admin/team area.
  companyKind?: string
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  // True when the session is authenticated but no profile row exists (legacy/
  // broken account, or seed still in flight). UI should handle this gracefully.
  profileMissing: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (
    email: string,
    password: string,
    profile?: { name?: string; phone?: string },
  ) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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
        companyId: me?.profile?.companyId,
        companyKind: me?.company?.kind,
      }
    : null

  // Loading until Convex auth resolves, and (when authed) until the profile loads.
  const loading = isLoading || (isAuthenticated && me === undefined)

  // Authenticated, query resolved, but no profile was seeded for this user.
  const profileMissing = Boolean(isAuthenticated) && !!me && me.profile === null

  const signIn = async (email: string, password: string) => {
    try {
      await convexSignIn("password", { email: email.trim().toLowerCase(), password, flow: "signIn" })
      return { error: null }
    } catch (error) {
      return { error }
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
      return { error }
    }
  }

  const signOut = async () => {
    await convexSignOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, profileMissing, signIn, signUp, signOut }}>
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
