"use client"

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { Building2, Megaphone, Home, Sparkles, DoorOpen } from "lucide-react"
import { unitTypeLabel } from "@/components/building-unit-picker"
import { VacantRosterDialog } from "@/components/vacant-roster-dialog"

export default function VacantUnitsPage() {
  const units = useQuery(api.units.listForCompany)
  const buildings = useQuery(api.buildings.list)
  const tenants = useQuery(api.tenants.list)

  const loading = units === undefined || buildings === undefined || tenants === undefined

  // Vacancy is derived: each building's total units minus the units that are
  // occupied. A unit is occupied when a tenant is assigned to it — but an
  // imported tenant may be linked to the building without a named unit, so we
  // also count active tenants placed directly on the building. (Issue #11)
  const rows = useMemo(() => {
    if (!units || !buildings || !tenants) return []
    return buildings.map((b) => {
      const buildingUnits = units.filter((u) => u.buildingId === b._id)
      const occupiedUnits = buildingUnits.filter((u) => u.status === "occupied").length
      const activeTenants = tenants.filter(
        (t) => t.buildingId === b._id && t.status === "active",
      ).length
      // max() avoids double-counting: tenants with a named unit show up in both
      // tallies, while building-only tenants are caught by activeTenants.
      const occupied = Math.max(occupiedUnits, activeTenants)
      const mixTotal = (b.unitMix ?? []).reduce((s, m) => s + (m.count || 0), 0)
      // Fall back through totalUnits → unit-mix → known units, and never let the
      // total read below what's actually occupied.
      const total = Math.max(b.totalUnits ?? (mixTotal || buildingUnits.length), occupied)
      const vacant = Math.max(total - occupied, 0)
      // Units materialised (by name) with a vacant status — the named roster.
      const vacantUnits = buildingUnits.filter((u) => u.status === "vacant")
      // How many vacant units still lack a named record (worth "detecting").
      const unnamedVacant = Math.max(vacant - vacantUnits.length, 0)
      return { building: b, buildingUnits, vacantUnits, occupied, total, vacant, unnamedVacant }
    })
  }, [units, buildings, tenants])

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
            <Card key={i} className="animate-pulse"><CardHeader><div className="h-4 w-2/3 rounded bg-secondary" /></CardHeader><CardContent><div className="h-3 w-1/2 rounded bg-secondary" /></CardContent></Card>
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
          {rows.map(({ building, buildingUnits, vacantUnits, occupied, total, vacant, unnamedVacant }) => (
            <Card key={building._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{building.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{building.city ?? building.address ?? "—"}</p>
                  </div>
                  <Badge className={vacant > 0 ? "bg-emerald-100 text-emerald-800" : "bg-muted text-foreground"}>
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
                {vacantUnits.length > 0 && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <DoorOpen className="h-3 w-3" /> Vacant units
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {vacantUnits.map((u) => (
                        <Badge key={u._id} className="bg-emerald-100 font-normal text-emerald-800">
                          {u.unitNumber}
                        </Badge>
                      ))}
                    </div>
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
                {vacant > 0 && (
                  <VacantRosterDialog
                    buildingId={building._id}
                    buildingName={building.name}
                    trigger={
                      <Button variant="outline" size="sm" className="w-full">
                        <Sparkles className="mr-2 h-4 w-4" />
                        {vacantUnits.length > 0 ? "Update vacant units" : "Detect vacant units"}
                        {unnamedVacant > 0 ? ` (${unnamedVacant} unnamed)` : ""}
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
