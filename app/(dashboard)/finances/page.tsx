"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, TrendingUp, AlertCircle, Wallet } from "lucide-react"

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

export default function FinancesPage() {
  const stats = useQuery(api.analytics.dashboard)
  const aging = useQuery(api.statements.arrearsAging)
  const tenants = useQuery(api.tenants.list)

  const tenantName = (id: string) =>
    (tenants ?? []).find((t) => t._id === id)?.fullName ?? "Tenant"

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Financial Overview</h2>
        <p className="text-muted-foreground">Collections, arrears and aging across your portfolio</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Billed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {(stats?.billed ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {(stats?.collected ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              KES {(stats?.outstanding ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct(stats?.collectionRate ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arrears aging</CardTitle>
          <CardDescription>Outstanding balances bucketed by age (0–30 / 31–60 / 60+ days)</CardDescription>
        </CardHeader>
        <CardContent>
          {aging === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : aging.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding arrears. 🎉</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span className="col-span-2">Tenant</span>
                <span>0–30</span>
                <span>31–60</span>
                <span>60+</span>
              </div>
              {aging.map((row) => (
                <div key={row.tenantId} className="grid grid-cols-5 gap-2 text-sm items-center">
                  <span className="col-span-2 font-medium truncate">{tenantName(row.tenantId)}</span>
                  <span>{row.bucket0.toLocaleString()}</span>
                  <span>{row.bucket30.toLocaleString()}</span>
                  <span className="flex items-center gap-2">
                    {row.bucket60.toLocaleString()}
                    {row.bucket60 > 0 && <Badge className="bg-red-100 text-red-800">late</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
