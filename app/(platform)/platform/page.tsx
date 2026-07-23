"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Users,
  Building2,
  Home,
  CreditCard,
  DoorOpen,
  UserRound,
} from "lucide-react"

const kindLabel: Record<string, string> = {
  landlord: "Landlord",
  property_manager: "Property Manager",
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trial: "secondary",
  inactive: "outline",
  cancelled: "destructive",
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string | number
  hint?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default function PlatformAdminPage() {
  // Auth + platform-admin gating happens in the (platform) layout, so by the
  // time this renders the caller is guaranteed to be an admin.
  const stats = useQuery(api.platformAdmin.stats, {})

  if (stats === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { users, companies, subscriptions, units, tenants, buildings, companyRoster } = stats

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Platform Admin</h1>
          <Badge variant="secondary">Swyft staff</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cross-company overview of everything on the platform.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Users"
          value={users.total}
          hint={`${users.platformAdmins} platform admin${users.platformAdmins === 1 ? "" : "s"}`}
          icon={Users}
        />
        <StatCard
          title="Companies"
          value={companies.total}
          hint={`${companies.byKind.property_manager} PM · ${companies.byKind.landlord} landlord`}
          icon={Building2}
        />
        <StatCard
          title="Active subscriptions"
          value={subscriptions.active}
          hint={`${subscriptions.byStatus.active} active · ${subscriptions.byStatus.trial} trial`}
          icon={CreditCard}
        />
        <StatCard
          title="Inactive subscriptions"
          value={subscriptions.inactive}
          hint={`${subscriptions.byStatus.inactive} inactive · ${subscriptions.byStatus.cancelled} cancelled`}
          icon={CreditCard}
        />
        <StatCard
          title="Vacant units"
          value={units.vacant}
          hint={`${units.publishedListings} published listing${units.publishedListings === 1 ? "" : "s"}`}
          icon={DoorOpen}
        />
        <StatCard
          title="Total units"
          value={units.total}
          hint={`${units.occupied} occupied · ${units.maintenance} maint. · ${units.reserved} reserved`}
          icon={Home}
        />
        <StatCard
          title="Buildings"
          value={buildings.total}
          icon={Building2}
        />
        <StatCard
          title="Tenants"
          value={tenants.total}
          hint={`${tenants.active} active`}
          icon={UserRound}
        />
      </div>

      {/* Subscription breakdown by plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions by plan</CardTitle>
          <CardDescription>All companies, grouped by their current plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["free", "standard", "premium", "enterprise"] as const).map((p) => (
            <div key={p} className="rounded-lg border p-4">
              <div className="text-2xl font-semibold">{subscriptions.byPlan[p]}</div>
              <div className="text-xs capitalize text-muted-foreground">{p}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per-company roster */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Companies</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Vacant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyRoster.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No companies yet.
                  </TableCell>
                </TableRow>
              ) : (
                companyRoster.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {kindLabel[c.kind] ?? c.kind}
                    </TableCell>
                    <TableCell className="capitalize">{c.plan}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[c.status] ?? "outline"} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.members}</TableCell>
                    <TableCell className="text-right">{c.units}</TableCell>
                    <TableCell className="text-right">{c.vacantUnits}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
