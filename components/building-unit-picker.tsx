"use client"

// Building → unit cascade with an auto-filled unit details panel. Self-contained
// (queries the company's buildings + units itself); the parent only owns the
// selected ids. Used by the tenant add page and the tenant edit dialog.

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Home } from "lucide-react"

const UNIT_TYPE_LABELS: Record<string, string> = {
  bedsitter: "Bedsitter",
  studio: "Studio",
  "1br": "1 Bedroom",
  "2br": "2 Bedroom",
  "3br": "3 Bedroom",
  "4br+": "4+ Bedroom",
  commercial: "Commercial",
  other: "Other",
}

// Human label for a unit's type, preferring its `unitType` code, then bedrooms.
export function unitTypeLabel(u: { unitType?: string; bedrooms?: number }): string {
  if (u.unitType) return UNIT_TYPE_LABELS[u.unitType] ?? u.unitType
  if (typeof u.bedrooms === "number") return u.bedrooms === 0 ? "Studio" : `${u.bedrooms} Bedroom`
  return "Unit"
}

const fmtKES = (n?: number) => (typeof n === "number" ? `KES ${n.toLocaleString()}` : "—")

export interface BuildingUnitPickerProps {
  buildingId: string
  unitId: string
  onBuildingChange: (buildingId: string) => void
  onUnitChange: (unitId: string) => void
}

export function BuildingUnitPicker({
  buildingId,
  unitId,
  onBuildingChange,
  onUnitChange,
}: BuildingUnitPickerProps) {
  const units = useQuery(api.units.listForCompany)
  const buildings = useQuery(api.buildings.list)

  const buildingUnits = useMemo(
    () => (units ?? []).filter((u) => u.buildingId === buildingId),
    [units, buildingId],
  )
  const selectedUnit = useMemo(
    () => (units ?? []).find((u) => u._id === unitId),
    [units, unitId],
  )
  const selectedBuilding = useMemo(
    () => (buildings ?? []).find((b) => b._id === buildingId),
    [buildings, buildingId],
  )

  // Changing building clears the unit selection.
  const handleBuilding = (v: string) => {
    onBuildingChange(v)
    onUnitChange("")
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Building</Label>
          <Select value={buildingId} onValueChange={handleBuilding}>
            <SelectTrigger><SelectValue placeholder="Select a building (optional)" /></SelectTrigger>
            <SelectContent>
              {(buildings ?? []).map((b) => (
                <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={unitId} onValueChange={onUnitChange} disabled={!buildingId}>
            <SelectTrigger>
              <SelectValue placeholder={buildingId ? "Select a unit" : "Select a building first"} />
            </SelectTrigger>
            <SelectContent>
              {buildingUnits.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No units in this building</div>
              ) : (
                buildingUnits.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    Unit {u.unitNumber} · {unitTypeLabel(u)}
                    {u.status !== "vacant" ? ` · ${u.status}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedUnit && (
        <div className="rounded-md border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Home className="h-4 w-4" /> Unit details
            {selectedUnit.status !== "vacant" && (
              <Badge variant="secondary" className="capitalize">{selectedUnit.status}</Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Building</dt>
              <dd className="font-medium">{selectedBuilding?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Unit</dt>
              <dd className="font-medium">{selectedUnit.unitNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-medium">{unitTypeLabel(selectedUnit)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rent</dt>
              <dd className="font-medium">{fmtKES(selectedUnit.rentAmount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Deposit</dt>
              <dd className="font-medium">{fmtKES(selectedUnit.depositAmount)}</dd>
            </div>
            {typeof selectedUnit.bathrooms === "number" && (
              <div>
                <dt className="text-muted-foreground">Bathrooms</dt>
                <dd className="font-medium">{selectedUnit.bathrooms}</dd>
              </div>
            )}
          </dl>
          {selectedUnit.status === "occupied" && (
            <p className="mt-2 text-xs text-amber-600">
              This unit is marked occupied — confirm it&apos;s the right one before assigning.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
