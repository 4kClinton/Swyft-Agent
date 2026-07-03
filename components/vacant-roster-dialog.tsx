"use client"

import { useState } from "react"
import { useAction, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Sparkles, Plus, X } from "lucide-react"
import { toast } from "sonner"

type Row = { unitNumber: string; unitType?: string; occupied: boolean }

/**
 * "Detect vacant units": asks the AI to infer the building's full unit roster
 * from its naming scheme, lets the PM confirm/edit, then materialises the
 * missing (vacant) units. Occupied units are shown read-only — never touched.
 */
export function VacantRosterDialog({
  buildingId,
  buildingName,
  trigger,
}: {
  buildingId: Id<"buildings">
  buildingName: string
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scheme, setScheme] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Array<{ prefix: string; unitType: string }>>([])
  const [rows, setRows] = useState<Row[]>([])

  const inferRoster = useAction(api.vacancyRoster.inferRoster)
  const materialise = useMutation(api.units.materialiseVacantRoster)

  async function runInference() {
    setLoading(true)
    try {
      const res = await inferRoster({ buildingId })
      setScheme(res.scheme)
      setMapping(res.typeMapping ?? [])
      setRows(res.units)
      if (res.units.every((u) => u.occupied)) {
        toast.info("No additional vacant units detected — every unit is occupied.")
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't detect the unit roster")
    } finally {
      setLoading(false)
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next && rows.length === 0) void runInference()
  }

  function updateNumber(i: number, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, unitNumber: value } : row)))
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  function addRow() {
    setRows((r) => [...r, { unitNumber: "", unitType: undefined, occupied: false }])
  }

  async function confirm() {
    const toAdd = rows
      .filter((r) => !r.occupied && r.unitNumber.trim())
      .map((r) => ({ unitNumber: r.unitNumber.trim(), unitType: r.unitType }))
    if (toAdd.length === 0) {
      toast.info("No new vacant units to add.")
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      const { created } = await materialise({ buildingId, units: toAdd })
      toast.success(`Added ${created} vacant ${created === 1 ? "unit" : "units"} to ${buildingName}`)
      setOpen(false)
      setRows([])
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the vacant units")
    } finally {
      setSaving(false)
    }
  }

  const vacantCount = rows.filter((r) => !r.occupied).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div onClick={() => onOpenChange(true)}>{trigger}</div>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Detect vacant units
          </DialogTitle>
          <DialogDescription>
            {buildingName}
            {scheme ? ` — scheme: ${scheme}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the naming scheme…
          </div>
        ) : (
          <>
            {mapping.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs">
                <span className="font-medium text-foreground">Detected block → type:</span>{" "}
                {mapping.map((m) => `${m.prefix} = ${m.unitType}`).join(" · ")}
                <span className="text-muted-foreground"> — check this looks right.</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Occupied units are locked. Edit or remove the proposed vacant units before saving —
              {" "}
              <span className="font-medium text-foreground">{vacantCount} vacant</span> will be added.
            </p>
            <ScrollArea className="max-h-72 pr-3">
              <div className="space-y-1.5">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.unitNumber}
                      onChange={(e) => updateNumber(i, e.target.value)}
                      disabled={row.occupied}
                      className="h-8"
                      placeholder="Unit no."
                    />
                    {row.unitType && (
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {row.unitType}
                      </Badge>
                    )}
                    {row.occupied ? (
                      <Badge variant="outline" className="shrink-0 font-normal">
                        occupied
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeRow(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button variant="outline" size="sm" onClick={addRow} className="w-fit">
              <Plus className="mr-1 h-4 w-4" /> Add a unit
            </Button>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={loading || saving || vacantCount === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add {vacantCount} vacant {vacantCount === 1 ? "unit" : "units"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
