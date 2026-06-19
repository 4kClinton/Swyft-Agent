"use client"

import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Check, Minus, Lock, Loader2 } from "lucide-react"
import Link from "next/link"

const ROLES = [
  {
    key: "manager",
    name: "Manager",
    summary: "Property manager. Full day-to-day management of properties, tenants and finances, plus team administration.",
  },
  {
    key: "agent",
    name: "Agent",
    summary: "Field/leasing staff. Works with vacant units, listings and inquiries, but no finance or team administration.",
  },
]

// What each role can do. true = allowed, false = not.
const PERMISSIONS: { area: string; manager: boolean; agent: boolean }[] = [
  { area: "Buildings & units", manager: true, agent: true },
  { area: "Vacant listings & inquiries", manager: true, agent: true },
  { area: "Tenants & leases", manager: true, agent: true },
  { area: "Invoices, receipts & finances", manager: true, agent: false },
  { area: "Reports & analytics", manager: true, agent: false },
  { area: "Team management (add/remove members)", manager: true, agent: false },
  { area: "Company settings", manager: false, agent: false },
]

function Cell({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <Check className="mx-auto h-4 w-4 text-green-600" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
  )
}

export default function RolesPage() {
  const { user, loading } = useAuth()
  const isPropertyManager = user?.companyKind === "property_manager"

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isPropertyManager) {
    return (
      <div className="container mx-auto p-6">
        <Card className="mx-auto mt-10 max-w-lg">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <Lock className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle>Roles &amp; permissions are for property managers</CardTitle>
            <CardDescription>This section is only available to property-manager accounts.</CardDescription>
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
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
        <p className="text-sm text-muted-foreground">
          How access works for staff in your property-management company. The company owner always
          has full access.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((r) => (
          <Card key={r.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {r.name}
                <Badge variant="secondary">{r.key}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{r.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permissions matrix</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <TableHead className="text-center">Manager</TableHead>
                <TableHead className="text-center">Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((p) => (
                <TableRow key={p.area}>
                  <TableCell>{p.area}</TableCell>
                  <TableCell><Cell allowed={p.manager} /></TableCell>
                  <TableCell><Cell allowed={p.agent} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        To add or remove members, go to{" "}
        <Link href="/admin" className="underline">Team Members</Link>.
      </p>
    </div>
  )
}
