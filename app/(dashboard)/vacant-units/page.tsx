"use client"

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { Building2, Megaphone, Home } from "lucide-react"
import { unitTypeLabel } from "@/components/building-unit-picker"

export default function VacantUnitsPage() {
  const units = useQuery(api.units.listForCompany)
  const buildings = useQuery(api.buildings.list)

  const loading = units === undefined || buildings === undefined

  // Vacancy is derived: each building's total units minus the units that have
  // been named (a unit is named when a tenant is assigned). (Issue #11)
  const rows = useMemo(() => {
    if (!units || !buildings) return []
    return buildings.map((b) => {
      const buildingUnits = units.filter((u) => u.buildingId === b._id)
      const occupied = buildingUnits.filter((u) => u.status === "occupied").length
      const mixTotal = (b.unitMix ?? []).reduce((s, m) => s + (m.count || 0), 0)
      const total = b.totalUnits ?? mixTotal ?? buildingUnits.length
      const vacant = Math.max(total - occupied, 0)
      return { building: b, buildingUnits, occupied, total, vacant }
    })
  }, [units, buildings])

  const totalVacant = rows.reduce((s, r) => s + r.vacant, 0)

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vacant Units</h1>
          <p className="text-muted-foreground">
            {totalVacant} vacant {totalVacant === 1 ? "unit" : "units"} across your buildings. Vacancy
            updates automatically as you add tenants.
          </p>
        </div>
        <Button asChild>
          <Link href="/ads"><Megaphone className="mr-2 h-4 w-4" />Advertise vacancies</Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse"><CardHeader><div className="h-4 w-2/3 rounded bg-gray-200" /></CardHeader><CardContent><div className="h-3 w-1/2 rounded bg-gray-200" /></CardContent></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No buildings yet"
          description="Add a building first — its vacant units appear here automatically."
          action={<Button asChild><Link href="/new-building">Add a building</Link></Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ building, buildingUnits, occupied, total, vacant }) => (
            <Card key={building._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{building.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{building.city ?? building.address ?? "—"}</p>
                  </div>
                  <Badge className={vacant > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}>
                    {vacant} vacant
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Occupied</span>
                  <span className="font-medium">{occupied} / {total}</span>
                </div>
                {(building.unitMix ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(building.unitMix ?? []).map((m, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {m.count}× {unitTypeLabel({ unitType: m.type })}
                      </Badge>
                    ))}
                  </div>
                )}
                {buildingUnits.filter((u) => u.status === "occupied").length > 0 && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Home className="h-3 w-3" /> Occupied units
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {buildingUnits
                        .filter((u) => u.status === "occupied")
                        .map((u) => (
                          <Badge key={u._id} variant="outline" className="font-normal">{u.unitNumber}</Badge>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
