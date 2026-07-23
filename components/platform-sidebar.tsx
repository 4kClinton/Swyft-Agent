"use client"

import type * as React from "react"
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  ShieldCheck,
  ChevronUp,
  LogOut,
  ExternalLink,
  User,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SwyftLogo } from "@/components/swyft-logo"
import { useAuth } from "@/components/auth-provider"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"

// Platform-console navigation. Deliberately separate from the tenant/landlord
// AppSidebar — this is Swyft staff tooling, not a company workspace. Everything
// here lives under /platform. `#` anchors scroll the single overview page for
// now; split into real routes as the console grows.
const NAV = [
  { title: "Overview", url: "/platform", icon: LayoutDashboard },
  { title: "Companies", url: "/platform#companies", icon: Building2 },
  { title: "Subscriptions", url: "/platform#subscriptions", icon: CreditCard },
]

export function PlatformSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const displayName = user?.email ?? "Admin"

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card shadow-sm" {...props}>
      <SidebarHeader className="border-b border-border bg-card">
        <div className="flex items-center gap-2 px-2 py-2">
          <SwyftLogo className="h-7 w-auto" priority />
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Admin
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-card">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground font-medium">
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.url === pathname}
                    className="hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-100 data-[active=true]:text-green-800"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border bg-card">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="hover:bg-green-50 hover:text-green-700"
            >
              <Link href="/dashboard">
                <ExternalLink className="h-4 w-4" />
                <span>Exit to app</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="text-foreground hover:bg-green-50 hover:text-green-700 data-[state=open]:bg-green-50 data-[state=open]:text-green-700"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">Platform admin</span>
                  </div>
                  <ChevronUp className="ml-auto size-4 text-gray-400" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="z-[9999] w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-card border border-border shadow-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem
                  className="hover:bg-green-50 hover:text-green-700"
                  onClick={() => signOut().then(() => router.replace("/login"))}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
