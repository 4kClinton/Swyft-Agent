"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-provider"
import { canAccessRoute, type RBACUser } from "@/lib/rbac"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoute?: string
  fallbackRoute?: string
}

export function ProtectedRoute({ children, requiredRoute, fallbackRoute = "/" }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Build an RBAC context from the Convex-backed user.
  const rbacUser: RBACUser | null = user
    ? {
        id: user.id,
        role: user.role,
        is_company_owner: user.isCompanyOwner,
        company_account_id: user.companyId,
      }
    : null

  const accessDenied =
    !!requiredRoute && !!rbacUser && !canAccessRoute(rbacUser, requiredRoute)

  if (accessDenied) {
    return (
      <div className="container mx-auto p-6 max-w-md">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access this page. Contact your administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => router.push(fallbackRoute)}>Go to Dashboard</Button>
          <Button variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
