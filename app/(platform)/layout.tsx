"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { PlatformSidebar } from "@/components/platform-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert } from "lucide-react"
import Link from "next/link"

/**
 * Chrome for the Swyft platform-admin console. Kept in its own route group so it
 * does NOT inherit the tenant/landlord dashboard sidebar — this is staff
 * tooling, a completely different use case. Auth + platform-admin gating lives
 * here so every /platform page can assume an authenticated admin.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  // Returns false (never throws) for non-admins, undefined while loading.
  const isAdmin = useQuery(api.platformAdmin.amIPlatformAdmin, user ? {} : "skip")

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  if (loading || (user && isAdmin === undefined)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  // Logged in but not a platform admin — deny without the admin chrome. The URL
  // is not advertised anywhere, so keep the message generic.
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="mx-auto max-w-lg">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle>Restricted area</CardTitle>
            <CardDescription>
              This is the Swyft platform administration console. Your account doesn&apos;t have
              access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <PlatformSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <SidebarTrigger />
          <main className="flex-1 overflow-auto bg-card">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
