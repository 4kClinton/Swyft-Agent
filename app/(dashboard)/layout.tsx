"use client"

import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, profileMissing, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (profileMissing) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-semibold">Account setup incomplete</h2>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t find a profile for your account. This can happen with older
            accounts created before setup completed. Please sign out and sign up again, or
            contact support if this keeps happening.
          </p>
          <Button onClick={() => signOut().then(() => router.replace("/login"))}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <SidebarInset className="flex-1 flex flex-col min-w-0">
          {/* Global Header with SidebarTrigger */}
      
            <SidebarTrigger />
           
         

          <main className="flex-1 overflow-auto bg-white">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
