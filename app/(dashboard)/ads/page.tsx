"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/empty-state"
import { Megaphone, Plus, Loader2, Rocket, Upload, Sparkles } from "lucide-react"
import { unitTypeLabel } from "@/components/building-unit-picker"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-emerald-100 text-emerald-800",
  taken: "bg-blue-100 text-blue-800",
  error: "bg-red-100 text-red-800",
}

export default function AdsPage() {
  const listings = useQuery(api.marketplace.listListings)
  const buildings = useQuery(api.buildings.list)
  const createTypeListing = useMutation(api.marketplace.createTypeListing)
  const publish = useAction(api.marketplace.publish)
  const createBoost = useMutation(api.boosts.create)
  const payBoost = useAction(api.boosts.payWithMpesa)

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState({ buildingId: "", unitType: "", rentAmount: "", title: "", description: "" })

  // Boost dialog state.
  const [boostFor, setBoostFor] = useState<Id<"vacantListings"> | null>(null)
  const [boost, setBoost] = useState({ amount: "500", durationDays: "7", phone: "" })
  const [boosting, setBoosting] = useState(false)

  const selectedBuilding = useMemo(
    () => (buildings ?? []).find((b) => b._id === form.buildingId),
    [buildings, form.buildingId],
  )
  const types = selectedBuilding?.unitMix ?? []

  const onPickType = (t: string) => {
    const row = types.find((m) => m.type === t)
    setForm((p) => ({ ...p, unitType: t, rentAmount: row?.rent ? String(row.rent) : p.rentAmount }))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.buildingId) return toast.error("Pick a building")
    if (!form.unitType) return toast.error("Pick a unit type")
    if (!form.rentAmount) return toast.error("Set the rent")
    setSaving(true)
    try {
      await createTypeListing({
        buildingId: form.buildingId as Id<"buildings">,
        unitType: form.unitType,
        rentAmount: Number(form.rentAmount),
        title: form.title || undefined,
        description: form.description || undefined,
      })
      toast.success("Ad created as a draft. Publish it to go live on Swyft.")
      setCreateOpen(false)
      setForm({ buildingId: "", unitType: "", rentAmount: "", title: "", description: "" })
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create ad")
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (id: Id<"vacantListings">) => {
    setBusyId(id)
    try {
      await publish({ listingId: id })
      toast.success("Published to Swyft 🎉")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to publish")
    } finally {
      setBusyId(null)
    }
  }

  const handleBoost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!boostFor) return
    if (!boost.phone) return toast.error("Enter the M-Pesa phone to charge")
    setBoosting(true)
    try {
      const boostId = await createBoost({
        listingId: boostFor,
        amount: Number(boost.amount),
        durationDays: Number(boost.durationDays),
      })
      await payBoost({ boostId, phone: boost.phone })
      toast.success("STK push sent — approve on your phone to boost this ad")
      setBoostFor(null)
      setBoost({ amount: "500", durationDays: "7", phone: "" })
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start boost")
    } finally {
      setBoosting(false)
    }
  }

  const loading = listings === undefined || buildings === undefined

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ads</h1>
          <p className="text-muted-foreground">Advertise your vacant units on the Swyft marketplace and boost them for more reach.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={(buildings ?? []).length === 0}>
          <Plus className="mr-2 h-4 w-4" />Create ad
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (listings ?? []).length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No ads yet"
          description={(buildings ?? []).length === 0 ? "Add a building first, then advertise its vacant units." : "Create an ad to list a vacant unit on Swyft."}
          action={(buildings ?? []).length === 0
            ? <Button asChild><Link href="/new-building">Add a building</Link></Button>
            : <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create ad</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(listings ?? []).map((l) => (
            <Card key={l._id} className={l.boosted ? "border-amber-300 shadow-amber-100 shadow-md" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{l.title ?? l.buildingName}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {l.buildingName}{l.unitType ? ` · ${unitTypeLabel({ unitType: l.unitType })}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={statusColor[l.status] ?? "bg-gray-100"}>{l.status}</Badge>
                    {l.boosted && (
                      <Badge className="bg-amber-100 text-amber-800 gap-1"><Sparkles className="h-3 w-3" />Boosted on Swyft</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="font-semibold">KES {l.rentAmount.toLocaleString()}/mo</div>
                {l.description && <p className="text-sm text-muted-foreground line-clamp-2">{l.description}</p>}
                <div className="flex gap-2">
                  {l.status !== "published" && l.status !== "taken" && (
                    <Button size="sm" variant="outline" className="flex-1" disabled={busyId === l._id} onClick={() => handlePublish(l._id)}>
                      {busyId === l._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Publish
                    </Button>
                  )}
                  <Button size="sm" className="flex-1" disabled={l.boosted} onClick={() => setBoostFor(l._id)}>
                    <Rocket className="mr-2 h-4 w-4" />{l.boosted ? "Boosted" : "Boost"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create ad */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create ad</DialogTitle>
            <DialogDescription>Advertise a vacant unit type from one of your buildings.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Building *</Label>
              <Select value={form.buildingId} onValueChange={(v) => setForm({ ...form, buildingId: v, unitType: "" })}>
                <SelectTrigger><SelectValue placeholder="Select building" /></SelectTrigger>
                <SelectContent>
                  {(buildings ?? []).map((b) => (
                    <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit type *</Label>
                <Select value={form.unitType} onValueChange={onPickType} disabled={!form.buildingId}>
                  <SelectTrigger><SelectValue placeholder={types.length ? "Select type" : "Set unit mix on building"} /></SelectTrigger>
                  <SelectContent>
                    {types.map((m) => (
                      <SelectItem key={m.type} value={m.type}>{unitTypeLabel({ unitType: m.type })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adrent">Rent (KES) *</Label>
                <Input id="adrent" type="number" min="0" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} placeholder="15000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adtitle">Title (optional)</Label>
              <Input id="adtitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Spacious 2BR near CBD" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addesc">Description (optional)</Label>
              <Textarea id="addesc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Boost */}
      <Dialog open={boostFor !== null} onOpenChange={(o) => !o && setBoostFor(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Boost this ad</DialogTitle>
            <DialogDescription>Feature it higher on Swyft. Paid via M-Pesa STK push.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBoost} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bamount">Amount (KES)</Label>
                <Input id="bamount" type="number" min="10" value={boost.amount} onChange={(e) => setBoost({ ...boost, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bdays">Duration (days)</Label>
                <Input id="bdays" type="number" min="1" value={boost.durationDays} onChange={(e) => setBoost({ ...boost, durationDays: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bphone">M-Pesa phone</Label>
              <Input id="bphone" value={boost.phone} onChange={(e) => setBoost({ ...boost, phone: e.target.value })} placeholder="0712345678" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBoostFor(null)}>Cancel</Button>
              <Button type="submit" disabled={boosting}>{boosting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pay & boost</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
