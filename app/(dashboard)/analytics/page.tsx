"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Home, Users, AlertCircle, FileClock, CheckCircle2 } from "lucide-react"

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

const matchColor: Record<string, string> = {
  auto_matched: "bg-green-100 text-green-800",
  manual_matched: "bg-blue-100 text-blue-800",
  unmatched: "bg-yellow-100 text-yellow-800",
}

export default function AnalyticsPage() {
  const stats = useQuery(api.analytics.dashboard)
  const chronic = useQuery(api.analytics.chronicLate)
  const pending = useQuery(api.analytics.pendingInvoices)
  const payments = useQuery(api.payments.feed, { limit: 15 })

  const cards = [
    { label: "Occupancy rate", value: pct(stats?.occupancyRate ?? 0), icon: Home, sub: `${stats?.occupiedUnits ?? 0}/${stats?.totalUnits ?? 0} units` },
    { label: "Collection rate", value: pct(stats?.collectionRate ?? 0), icon: TrendingUp, sub: `KES ${(stats?.collected ?? 0).toLocaleString()} collected` },
    { label: "Tenants", value: String(stats?.totalTenants ?? 0), icon: Users, sub: "active records" },
    { label: "Outstanding", value: `KES ${(stats?.outstanding ?? 0).toLocaleString()}`, icon: AlertCircle, sub: "across all invoices" },
  ]

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Reconciliation outputs: pending invoices, collections and recent payments</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, sub }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pending invoices — the outstanding side of reconciliation. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileClock className="h-5 w-5" />Pending invoices</CardTitle>
            <CardDescription>Open balances. Paid invoices drop off automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            {pending === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding. 🎉</p>
            ) : (
              <div className="space-y-2">
                {pending.slice(0, 12).map((inv) => (
                  <div key={inv._id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{inv.tenant?.fullName ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground capitalize">
                        {inv.description ?? inv.kind} · due {new Date(inv.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-medium text-amber-700">KES {inv.balance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent payments — what the reconciliation engine matched. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Recent payments</CardTitle>
            <CardDescription>Latest observed credits and how they matched.</CardDescription>
          </CardHeader>
          <CardContent>
            {payments === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p._id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        KES {p.amount.toLocaleString()}{p.tenant ? ` · ${p.tenant.fullName}` : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.source} · {new Date(p.paidAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge className={matchColor[p.matchState] ?? "bg-gray-100"}>{p.matchState.replace("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chronically late tenants</CardTitle>
          <CardDescription>Tenants with more than one overdue invoice</CardDescription>
        </CardHeader>
        <CardContent>
          {chronic === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : chronic.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chronically late tenants. 🎉</p>
          ) : (
            <div className="space-y-2">
              {chronic.map((row) => (
                <div key={row.tenant?._id ?? Math.random()} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.tenant?.fullName ?? "—"}</span>
                  <Badge className="bg-red-100 text-red-800">{row.overdueCount} overdue</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
