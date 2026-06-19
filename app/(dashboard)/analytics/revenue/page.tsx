"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function RevenueAnalyticsPage() {
  const stats = useQuery(api.analytics.dashboard)
  const aging = useQuery(api.statements.arrearsAging)
  const tenants = useQuery(api.tenants.list)
  const tenantName = (id: string) => (tenants ?? []).find((t) => t._id === id)?.fullName ?? "Tenant"

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Revenue & Arrears</h1>
        <p className="text-muted-foreground">Expected vs collected, and where money is owed</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expected (billed)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">KES {(stats?.billed ?? 0).toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Collected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">KES {(stats?.collected ?? 0).toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Monthly run-rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">KES {(stats?.monthlyRevenue ?? 0).toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arrears aging</CardTitle>
          <CardDescription>Outstanding balances by age (0–30 / 31–60 / 60+ days)</CardDescription>
        </CardHeader>
        <CardContent>
          {aging === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : aging.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding arrears. 🎉</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Tenant</span><span>0–30</span><span>31–60</span><span>60+</span>
              </div>
              {aging.map((row) => (
                <div key={row.tenantId} className="grid grid-cols-5 items-center gap-2 text-sm">
                  <span className="col-span-2 truncate font-medium">{tenantName(row.tenantId)}</span>
                  <span>{row.bucket0.toLocaleString()}</span>
                  <span>{row.bucket30.toLocaleString()}</span>
                  <span className="flex items-center gap-2">{row.bucket60.toLocaleString()}{row.bucket60 > 0 && <Badge className="bg-red-100 text-red-800">late</Badge>}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
