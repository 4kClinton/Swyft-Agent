"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Lock, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

const adapters = [
  { value: "jenga", label: "Equity (Jenga IPN)" },
  { value: "coop", label: "Co-operative" },
  { value: "stanbic", label: "Stanbic" },
  { value: "kcb", label: "KCB Buni" },
  { value: "daraja", label: "Safaricom paybill/till (Daraja)" },
  { value: "sms", label: "SMS forwarder (any bank)" },
  { value: "statement", label: "Statement upload only" },
]

export default function SettingsPage() {
  const me = useQuery(api.companies.me)
  const sources = useQuery(api.paymentSources.list)
  const buildings = useQuery(api.buildings.list)
  const updateCompany = useMutation(api.companies.updateCompany)
  const connect = useMutation(api.paymentSources.connect)
  const setActive = useMutation(api.paymentSources.setActive)
  const setBuilding = useMutation(api.paymentSources.setBuilding)

  const [company, setCompany] = useState({ name: "", email: "", phone: "", address: "" })
  const [savingCompany, setSavingCompany] = useState(false)
  const [src, setSrc] = useState({ adapter: "jenga", accountNumber: "", paybill: "", label: "", buildingId: "all" })
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (me?.company) {
      setCompany({
        name: me.company.name ?? "",
        email: me.company.email ?? "",
        phone: me.company.phone ?? "",
        address: me.company.address ?? "",
      })
    }
  }, [me?.company])

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCompany(true)
    try {
      await updateCompany({
        name: company.name || undefined,
        email: company.email || undefined,
        phone: company.phone || undefined,
        address: company.address || undefined,
      })
      toast.success("Company updated")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update")
    } finally {
      setSavingCompany(false)
    }
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!src.accountNumber) return toast.error("Account number is required")
    setConnecting(true)
    try {
      await connect({
        adapter: src.adapter as any,
        accountNumber: src.accountNumber,
        paybill: src.paybill || undefined,
        label: src.label || undefined,
        buildingId: src.buildingId !== "all" ? (src.buildingId as any) : undefined,
      })
      toast.success("Payment source connected")
      setSrc({ adapter: "jenga", accountNumber: "", paybill: "", label: "", buildingId: "all" })
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to connect")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Company profile and how you get paid</p>
      </div>

      {/* Payment sources — the critical connect step */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Payment sources</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Read-only. Swyft observes payments into these accounts — it never moves your money.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(sources ?? []).length > 0 && (
            <div className="space-y-2">
              {(sources ?? []).map((s) => (
                <div key={s._id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{s.label ?? s.accountNumber}</div>
                    <div className="text-muted-foreground">
                      {adapters.find((a) => a.value === s.adapter)?.label ?? s.adapter} · acct {s.accountNumber}
                      {s.paybill ? ` · paybill ${s.paybill}` : ""}
                    </div>
                    <div className="mt-1">
                      <Select
                        value={s.buildingId ?? "all"}
                        onValueChange={(v) => setBuilding({ id: s._id, buildingId: v !== "all" ? (v as any) : undefined })}
                      >
                        <SelectTrigger className="h-7 w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All buildings (company-wide)</SelectItem>
                          {(buildings ?? []).map((b) => (
                            <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={s.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}>
                      {s.active ? "active" : "paused"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setActive({ id: s._id, active: !s.active })}>
                      {s.active ? "Pause" : "Resume"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4 rounded-md border border-dashed p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank / rail</Label>
                <Select value={src.adapter} onValueChange={(v) => setSrc({ ...src, adapter: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {adapters.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acct">Account number *</Label>
                <Input id="acct" value={src.accountNumber} onChange={(e) => setSrc({ ...src, accountNumber: e.target.value })} placeholder="102030404" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paybill">Paybill (optional)</Label>
                <Input id="paybill" value={src.paybill} onChange={(e) => setSrc({ ...src, paybill: e.target.value })} placeholder="247247" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Label (optional)</Label>
                <Input id="label" value={src.label} onChange={(e) => setSrc({ ...src, label: e.target.value })} placeholder="Main Equity account" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Building (optional)</Label>
              <Select value={src.buildingId} onValueChange={(v) => setSrc({ ...src, buildingId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All buildings (company-wide)</SelectItem>
                  {(buildings ?? []).map((b) => (
                    <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Link this account to a specific building, or leave company-wide.</p>
            </div>
            <Button type="submit" disabled={connecting}>
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Connect payment source
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Company profile */}
      <Card>
        <CardHeader><CardTitle>Company profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveCompany} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">Company name</Label>
              <Input id="cname" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cemail">Email</Label>
                <Input id="cemail" type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cphone">Phone</Label>
                <Input id="cphone" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caddr">Address</Label>
              <Input id="caddr" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
            </div>
            <Button type="submit" disabled={savingCompany}>
              {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
