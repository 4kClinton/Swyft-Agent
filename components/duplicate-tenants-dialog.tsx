"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
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
import { AlertTriangle, Loader2, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

/**
 * Surfaces tenants that share a phone number (genuine duplicates) and lets the
 * user remove the extras in one reviewed action. Keeps the unit-linked/active/
 * oldest record and cascade-deletes the rest via tenants.removeMany.
 */
export function DuplicateTenantsBanner() {
  const groups = useQuery(api.tenants.findDuplicates)
  const removeMany = useMutation(api.tenants.removeMany)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const removeIds = useMemo(
    () => (groups ?? []).flatMap((g) => g.remove.map((r) => r._id as Id<"tenants">)),
    [groups],
  )

  if (!groups || groups.length === 0) return null

  async function cleanUp() {
    setRemoving(true)
    try {
      const { deleted } = await removeMany({ ids: removeIds })
      toast.success(`Removed ${deleted} duplicate ${deleted === 1 ? "tenant" : "tenants"}`)
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't remove duplicates")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">{removeIds.length} duplicate</span>{" "}
            {removeIds.length === 1 ? "tenant" : "tenants"} found (same phone number across{" "}
            {groups.length} {groups.length === 1 ? "person" : "people"}).
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Review &amp; remove
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Duplicate tenants
            </DialogTitle>
            <DialogDescription>
              These people appear more than once (same phone). We&apos;ll keep one record each and
              remove the extras — leases, invoices and payment history stay on the kept record.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-80 pr-3">
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.phone} className="rounded-md border p-2 text-sm">
                  <div className="mb-1 font-medium">{g.phone}</div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 font-normal text-emerald-800">Keeping</Badge>
                    <span>{g.keep.fullName}</span>
                    {g.keep.buildingName && (
                      <span className="text-muted-foreground">· {g.keep.buildingName}</span>
                    )}
                    {g.keep.hasUnit && <span className="text-muted-foreground">· has unit</span>}
                  </div>
                  {g.remove.map((r) => (
                    <div key={r._id} className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <Badge variant="outline" className="font-normal">
                        Remove
                      </Badge>
                      <span className="line-through">{r.fullName}</span>
                      {r.buildingName && <span>· {r.buildingName}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={cleanUp} disabled={removing || removeIds.length === 0}>
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remove {removeIds.length} duplicate{removeIds.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
