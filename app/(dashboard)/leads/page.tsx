"use client"

// Leads — house-hunting demand matched to this company's vacant units.
// A lead only appears here if the company has a building in its area (enforced
// server-side in api.leads.forMyCompany). No tenant contact is shown; a manager
// offers up to 3 vacant units per lead, and the tenant responds in their app.
// See rules/DATA_FLOW/leads.md.

import { useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import Link from "next/link"
import { api } from "@/convex/_generated/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/empty-state"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Inbox, Home, MapPin, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"

const MOVE_LABEL: Record<string, string> = {
  this_month: "This month",
  next_month: "Next month",
  flexible: "Flexible",
}

function ageLabel(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function LeadsPage() {
  const data = useQuery(api.leads.forMyCompany)
  const [openLeadRef, setOpenLeadRef] = useState<string | null>(null)

  const loading = data === undefined
  const leads = data?.leads ?? []
  const matchedFirst = useMemo(
    () => leads.filter((l) => l.matchingUnitCount > 0),
    [leads],
  )

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading leads…</div>
  }

  // No buildings at all, or none with a structured area → nothing can match.
  if (!data?.hasBuildings || data.areas.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-2xl font-semibold">Leads</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          House-hunters looking in your areas, matched to your vacant units.
        </p>
        <EmptyState
          icon={MapPin}
          title="Add a building with an area first"
          description="Leads are matched by neighbourhood. Add a building and set its area, and house-hunters searching there will show up here."
          actionLabel="Add building"
          actionHref="/new-building"
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            House-hunters in{" "}
            <span className="font-medium text-foreground">
              {data.areas.join(", ")}
            </span>
            . Send them a vacant unit — no calls, no chasing.
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No open leads in your areas yet"
          description="When someone house-hunting in your areas posts what they need, they'll appear here — matched to your vacant units."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Move</TableHead>
                  <TableHead>Deposit</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Your matches</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.leadRef}>
                    <TableCell className="font-medium capitalize">
                      {l.area.replace(/-/g, " ")}
                    </TableCell>
                    <TableCell className="uppercase">{l.unitType}</TableCell>
                    <TableCell>{l.budgetBand}</TableCell>
                    <TableCell>{MOVE_LABEL[l.moveWindow] ?? l.moveWindow}</TableCell>
                    <TableCell>
                      {l.depositReady ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ageLabel(l.createdAt)}
                    </TableCell>
                    <TableCell>
                      {l.matchingUnitCount > 0 ? (
                        <Badge variant="secondary">
                          {l.matchingUnitCount} unit{l.matchingUnitCount > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No match</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.myResponse === "interested" ? (
                        <Badge className="border-transparent bg-green-600 text-white hover:bg-green-600">
                          Interested 🎉
                        </Badge>
                      ) : l.myResponse === "declined" ? (
                        <span className="text-xs text-muted-foreground">Passed</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={l.matchingUnitCount > 0 ? "default" : "outline"}
                          disabled={l.sendCount >= 3 && !l.iSent}
                          onClick={() => setOpenLeadRef(l.leadRef)}
                        >
                          {l.iSent
                            ? `Sent (${l.sendCount}/3)`
                            : l.sendCount >= 3
                              ? "Full (3/3)"
                              : "Send units"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SendDrawer leadRef={openLeadRef} onClose={() => setOpenLeadRef(null)} />

      {matchedFirst.length === 0 && leads.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          None of your vacant units match these leads yet — adjust rent or add a
          matching unit to start sending.
        </p>
      )}
    </div>
  )
}

function SendDrawer({
  leadRef,
  onClose,
}: {
  leadRef: string | null
  onClose: () => void
}) {
  const detail = useQuery(
    api.leads.matchingUnitsForLead,
    leadRef ? { leadRef } : "skip",
  )
  const sendUnits = useMutation(api.leads.sendUnits)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  const lead = detail?.lead
  const units = detail?.units ?? []
  const remaining = detail?.sendsRemaining ?? 0
  const canPick = (id: string) =>
    picked.has(id) || picked.size < remaining

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < remaining) next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (!leadRef || picked.size === 0) return
    setSending(true)
    try {
      const res = await sendUnits({
        leadRef,
        unitIds: [...picked] as Id<"units">[],
      })
      toast.success(`Sent ${res.sent} unit${res.sent === 1 ? "" : "s"} to this house-hunter.`)
      setPicked(new Set())
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send units.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={!!leadRef} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Send units to this lead</SheetTitle>
          <SheetDescription>
            {lead ? (
              <>
                <span className="capitalize">{lead.area.replace(/-/g, " ")}</span> ·{" "}
                {lead.unitType.toUpperCase()} · {lead.budgetBand} ·{" "}
                {MOVE_LABEL[lead.moveWindow] ?? lead.moveWindow}
                {lead.depositReady ? " · deposit ready" : ""}
              </>
            ) : (
              "Loading…"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-2 mt-2 flex-1 overflow-y-auto px-2">
          {detail === undefined ? (
            <p className="py-8 text-sm text-muted-foreground">Loading your units…</p>
          ) : units.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={Home}
                title="No matching vacant units"
                description="None of your vacant units fit this lead's budget and type. Add or re-price a unit to send it."
              />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="mb-2 text-xs text-muted-foreground">
                {remaining > 0
                  ? `This lead can receive ${remaining} more unit${remaining === 1 ? "" : "s"} (max 3 total).`
                  : "This lead has already received the maximum of 3 units."}
              </p>
              {units.map((u) => {
                const disabled = u.alreadySent || (!picked.has(u._id) && !canPick(u._id))
                return (
                  <label
                    key={u._id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={picked.has(u._id)}
                      disabled={disabled}
                      onCheckedChange={() => toggle(u._id)}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {u.buildingName} · Unit {u.unitNumber}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">
                        {u.unitType ?? "unit"} · KES {u.rentAmount.toLocaleString()}
                      </div>
                    </div>
                    {u.alreadySent && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sent
                      </Badge>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4 border-t pt-4">
          <Button
            className="w-full"
            disabled={picked.size === 0 || sending || remaining <= 0}
            onClick={submit}
          >
            {sending
              ? "Sending…"
              : picked.size > 0
                ? `Send ${picked.size} unit${picked.size === 1 ? "" : "s"}`
                : "Select units to send"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            No phone numbers are shared. The house-hunter replies in their app.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
