"use client"

import type * as React from "react"
import {
  Building2,
  Home,
  Bell,
  Plus,
  Settings,
  User,
  ChevronUp,
  LogOut,
  BarChart3,
  Menu,
  Users,
  FileText,
  TrendingUp,
  Truck,
  CreditCard,
  Megaphone,
  Upload,
  Database,
  Inbox,
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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { SwyftLogo } from "@/components/swyft-logo"
import Link from "next/link"

interface UserProfile {
  role?: string
  name?: string
  email?: string
  company_account_id?: string
  is_company_owner?: boolean
  company_accounts?: {
    company_name?: string
    contact_name?: string
  }
}

// Menu items for different user roles. `companyKind` gates the admin/team area,
// which only property-manager companies see.
const getMenuItems = (userRole: string, companyKind?: string) => {
  const baseItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
    },
    {
      title: "Leads",
      url: "/leads",
      icon: Inbox,
    },
  ]

  const propertyItems = {
    title: "Properties",
    items: [
      {
        title: "Vacant Units",
        url: "/vacant-units",
        icon: Home,
      },
      {
        title: "Ads",
        url: "/ads",
        icon: Megaphone,
      },
    ],
  }

  const servicesItems = {
    title: "Services",
    items: [
      {
        title: "Request Move",
        url: "/request-move",
        icon: Truck,
      },
    ],
  }

  const basicAnalytics = {
    title: "Analytics",
    items: [
      {
        title: "Performance",
        url: "/analytics",
        icon: BarChart3,
      },
    ],
  }

  const settingsItems = {
    title: "Settings",
    items: [
      {
        title: "Account Settings",
        url: "/settings",
        icon: Settings,
      },
      {
        title: "Billing & Plan",
        url: "/billing",
        icon: CreditCard,
      },
    ],
  }

  // Team management is property-manager-only (landlords don't manage staff).
  const isPropertyManager = companyKind === "property_manager"
  const teamManagementGroups = isPropertyManager
    ? [
        {
          title: "Team Management",
          items: [
            {
              title: "Team Members",
              url: "/admin",
              icon: Users,
            },
            {
              title: "Roles & Permissions",
              url: "/admin/roles",
              icon: Settings,
            },
          ],
        },
      ]
    : []

  // Role-specific menu configurations
  switch (userRole) {
    case "landlord":
      return [
        ...baseItems,
        {
          title: "Properties",
          items: [
            {
              title: "My Properties",
              url: "/buildings",
              icon: Building2,
            },
            {
              title: "Add Building",
              url: "/new-building",
              icon: Plus,
            },
            {
              title: "Vacant Units",
              url: "/vacant-units",
              icon: Home,
            },
            {
              title: "Ads",
              url: "/ads",
              icon: Megaphone,
            },
            {
              title: "Import Data",
              url: "/import",
              icon: Database,
            },
          ],
        },
        {
          title: "Tenants",
          items: [
            {
              title: "All Tenants",
              url: "/tenants",
              icon: Users,
            },
          ],
        },
        {
          title: "Money",
          items: [
            {
              title: "Payments",
              url: "/payments",
              icon: CreditCard,
            },
            {
              title: "Upload Statement",
              url: "/statements",
              icon: Upload,
            },
            {
              title: "Invoices",
              url: "/finances/invoices",
              icon: FileText,
            },
            {
              title: "Receipts",
              url: "/finances/receipts",
              icon: FileText,
            },
          ],
        },
        servicesItems,
        basicAnalytics,
        settingsItems,
      ]

    case "owner":
    case "admin":
    case "manager":
      return [
        ...baseItems,
        {
          title: "Properties",
          items: [
            // Landlords (property owners) are a property-manager-only concept.
            ...(isPropertyManager
              ? [
                  {
                    title: "Landlords",
                    url: "/landlords",
                    icon: User,
                  },
                ]
              : []),
            {
              title: "Buildings",
              url: "/buildings",
              icon: Building2,
            },
            {
              title: "Add Building",
              url: "/new-building",
              icon: Plus,
            },
            {
              title: "Vacant Units",
              url: "/vacant-units",
              icon: Home,
            },
            {
              title: "Ads",
              url: "/ads",
              icon: Megaphone,
            },
            {
              title: "Import Data",
              url: "/import",
              icon: Database,
            },
          ],
        },
        {
          title: "Tenants & Leases",
          items: [
            {
              title: "All Tenants",
              url: "/tenants",
              icon: Users,
            },
            {
              title: "Notices",
              url: "/notices",
              icon: Bell,
            },
          ],
        },
        {
          title: "Financial Management",
          items: [
            {
              title: "Payments",
              url: "/payments",
              icon: CreditCard,
            },
            {
              title: "Upload Statement",
              url: "/statements",
              icon: Upload,
            },
            {
              title: "Invoices",
              url: "/finances/invoices",
              icon: FileText,
            },
            {
              title: "Receipts",
              url: "/finances/receipts",
              icon: FileText,
            },
            {
              title: "Finances",
              url: "/finances",
              icon: TrendingUp,
            },
            {
              title: "Transactions",
              url: "/finances/transactions",
              icon: FileText,
            },
          ],
        },
        {
          title: "Reports & Analytics",
          items: [
            {
              title: "Revenue Reports",
              url: "/analytics/revenue",
              icon: TrendingUp,
            },
          ],
        },
        ...teamManagementGroups,
        servicesItems,
        settingsItems,
      ]

    default:
      return [...baseItems, propertyItems, servicesItems, settingsItems]
  }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, signOut } = useAuth()
  const me = useQuery(api.companies.me, user ? {} : "skip")
  const loading = Boolean(user) && me === undefined

  const userProfile: UserProfile | null = me
    ? {
        role: me.profile?.role,
        name: me.profile?.fullName ?? undefined,
        email: me.email,
        company_account_id: me.profile?.companyId,
        is_company_owner: me.profile?.isCompanyOwner,
        company_accounts: {
          company_name: me.company?.name,
          contact_name: me.profile?.fullName ?? undefined,
        },
      }
    : null

  // Determine user role + company kind (drives which menu sections show).
  const userRole = userProfile?.role || "landlord"
  const companyKind = me?.company?.kind
  const menuItems = getMenuItems(userRole, companyKind)

  // Get role display name
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case "owner": // transitional alias for landlord
      case "landlord":
        return "Landlord"
      case "manager":
        return "Property Manager"
      case "agent":
        return "Agent"
      default:
        return "User"
    }
  }

  // Get display name - prefer company contact name, then user name, then fallback
  const getDisplayName = () => {
    if (userProfile?.company_accounts?.contact_name) {
      return userProfile.company_accounts.contact_name
    }
    if (userProfile?.name) {
      return userProfile.name
    }
    return user?.email || "User"
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card shadow-sm" {...props}>
      <SidebarHeader className="border-b border-border bg-card">
        <div className="flex items-center gap-2 px-2 py-2">
          <SwyftLogo className="h-7 w-auto" priority />
        </div>
        {/* Mobile menu trigger - visible on small screens with highest z-index */}
        <div className="md:hidden flex justify-end p-2">
          <SidebarTrigger className="h-8 w-8 z-[9999] relative">
            <Menu className="h-4 w-4" />
          </SidebarTrigger>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-card">
        {menuItems.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel className="text-muted-foreground font-medium">{item.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {"url" in item ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-100 data-[active=true]:text-green-800"
                    >
                      <Link href={item.url}>
                        {item.icon && <item.icon className="h-4 w-4" />}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  item.items?.map((subItem) => (
                    <SidebarMenuItem key={subItem.title}>
                      <SidebarMenuButton
                        asChild
                        className="hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-100 data-[active=true]:text-green-800"
                      >
                        <Link href={subItem.url}>
                          {subItem.icon && <subItem.icon className="h-4 w-4" />}
                          <span>{subItem.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border bg-card">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="text-foreground hover:bg-green-50 hover:text-green-700 data-[state=open]:bg-green-50 data-[state=open]:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-400 dark:data-[state=open]:bg-green-950 dark:data-[state=open]:text-green-400"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                    <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{getDisplayName()}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {loading ? "Loading..." : getRoleDisplayName(userRole)}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4 text-gray-400" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="z-[9999] w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-card border border-border shadow-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild className="hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-400">
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()} className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950">
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
