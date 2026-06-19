"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/empty-state"
import { Bell, Plus, Loader2, Mail, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  delivered: "bg-emerald-100 text-emerald-800",
  acknowledged: "bg-emerald-100 text-emerald-800",
}
const recipientColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-gray-100 text-gray-600",
}

export default function NoticesPage() {
  const notices = useQuery(api.notices.list)
  const tenants = useQuery(api.tenants.list)
  const buildings = useQuery(api.buildings.list)
  const createNotice = useMutation(api.notices.create)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: "", content: "", noticeType: "general" })
  const [buildingFilter, setBuildingFilter] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [channels, setChannels] = useState({ email: true, sms: false })

  const filteredTenants = useMemo(
    () =>
      (tenants ?? []).filter((t) =>
        buildingFilter === "all" ? true : t.buildingId === buildingFilter,
      ),
    [tenants, buildingFilter],
  )

  const toggle = (id: string) =>
    setSelected((p) => {
      const next = new Set(p)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const allShownSelected = filteredTenants.length > 0 && filteredTenants.every((t) => selected.has(t._id))
  const toggleAllShown = () =>
    setSelected((p) => {
      const next = new Set(p)
      if (allShownSelected) filteredTenants.forEach((t) => next.delete(t._id))
      else filteredTenants.forEach((t) => next.add(t._id))
      return next
    })

  const reset = () => {
    setForm({ title: "", content: "", noticeType: "general" })
    setSelected(new Set())
    setChannels({ email: true, sms: false })
    setBuildingFilter("all")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.content) return toast.error("Title and content are required")
    if (selected.size === 0) return toast.error("Pick at least one recipient")
    const channelList = [
      ...(channels.email ? ["email" as const] : []),
      ...(channels.sms ? ["sms" as const] : []),
    ]
    if (channelList.length === 0) return toast.error("Pick a delivery channel")
    setSaving(true)
    try {
      await createNotice({
        title: form.title,
        content: form.content,
        noticeType: form.noticeType,
        buildingId: buildingFilter !== "all" ? (buildingFilter as Id<"buildings">) : undefined,
        tenantIds: Array.from(selected) as Id<"tenants">[],
        channels: channelList,
      })
      toast.success(`Notice sent to ${selected.size} tenant(s)`)
      setOpen(false)
      reset()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create notice")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notices</h1>
          <p className="text-muted-foreground">Send announcements to saved tenants — we keep a record of who received what.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New Notice</Button>
      </div>

      {notices === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notices.length === 0 ? (
        <EmptyState icon={Bell} title="No notices yet" description="Create a notice to communicate with tenants." action={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New Notice</Button>} />
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{n.title}</CardTitle>
                  <Badge className={statusColor[n.status]}>{n.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{n.content}</p>
                {n.recipients.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {n.recipients.map((r) => (
                      <Badge key={r._id} className={`${recipientColor[r.state] ?? "bg-gray-100"} gap-1 font-normal`}>
                        {r.channel === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {r.tenantName} · {r.state}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{new Date(n._creationTime).toLocaleDateString()} · {n.noticeType}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Notice</DialogTitle>
            <DialogDescription>Pick recipients and how to reach them. Their delivery is recorded.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.noticeType} onValueChange={(v) => setForm({ ...form, noticeType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="rent_increase">Rent increase</SelectItem>
                  <SelectItem value="move_out">Move out</SelectItem>
                  <SelectItem value="violation">Violation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea id="content" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            </div>

            {/* Recipients */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipients ({selected.size})</Label>
                <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                  <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buildings</SelectItem>
                    {(buildings ?? []).map((b) => (
                      <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Checkbox checked={allShownSelected} onCheckedChange={toggleAllShown} id="all" />
                  <Label htmlFor="all" className="text-xs font-normal text-muted-foreground">Select all shown</Label>
                </div>
                <ScrollArea className="h-44">
                  <div className="p-2 space-y-1">
                    {filteredTenants.length === 0 ? (
                      <p className="px-1 py-3 text-sm text-muted-foreground">No tenants{buildingFilter !== "all" ? " in this building" : ""}.</p>
                    ) : (
                      filteredTenants.map((t) => (
                        <label key={t._id} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted cursor-pointer">
                          <Checkbox checked={selected.has(t._id)} onCheckedChange={() => toggle(t._id)} />
                          <span className="text-sm">{t.fullName}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {t.email ? <Mail className="inline h-3 w-3" /> : null} {t.phone}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Channels */}
            <div className="space-y-2">
              <Label>Deliver via</Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={channels.email} onCheckedChange={(v) => setChannels({ ...channels, email: !!v })} />
                  <span className="text-sm flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={channels.sms} onCheckedChange={(v) => setChannels({ ...channels, sms: !!v })} />
                  <span className="text-sm flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />SMS</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send notice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
