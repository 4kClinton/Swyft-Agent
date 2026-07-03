"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Search, User, Lock, Trash2, Mail, Phone, Loader2 } from "lucide-react"
import { LandlordReportDialog } from "@/components/landlord-report-dialog"
import { toast } from "sonner"

type Channel = "email" | "whatsapp" | "sms"
type Cadence = "monthly" | "quarterly"

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  nationalId: "",
  kraPin: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  reportChannel: "" as "" | Channel,
  reportCadence: "" as "" | Cadence,
}

export default function LandlordsPage() {
  const { user, loading: authLoading } = useAuth()
  const isPropertyManager = user?.companyKind === "property_manager"

  const landlordsData = useQuery(api.landlords.list, isPropertyManager ? {} : "skip")
  const createLandlord = useMutation(api.landlords.create)
  const removeLandlord = useMutation(api.landlords.remove)

  const [searchTerm, setSearchTerm] = useState("")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof EMPTY, val: string) => setForm((f) => ({ ...f, [k]: val }))

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Landlord name is required")
      return
    }
    setSaving(true)
    try {
      await createLandlord({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        kraPin: form.kraPin.trim() || undefined,
        nextOfKinName: form.nextOfKinName.trim() || undefined,
        nextOfKinPhone: form.nextOfKinPhone.trim() || undefined,
        reportChannel: form.reportChannel || undefined,
        reportCadence: form.reportCadence || undefined,
      })
      toast.success("Landlord added")
      setForm(EMPTY)
      setOpen(false)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add landlord")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await removeLandlord({ id: id as any })
      toast.success("Landlord removed")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove landlord")
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Landlords are a property-manager-only concept.
  if (!isPropertyManager) {
    return (
      <div className="container mx-auto p-6">
        <Card className="mx-auto mt-10 max-w-lg">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <Lock className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle>Landlords are for property managers</CardTitle>
            <CardDescription>
              This section is only available to property-manager accounts who manage
              buildings on behalf of owners. If that's you, switch your company type in
              Settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const landlords = landlordsData ?? []
  const loading = landlordsData === undefined
  const filtered = landlords.filter((l) => {
    const term = searchTerm.toLowerCase()
    return (
      l.name.toLowerCase().includes(term) ||
      (l.email ?? "").toLowerCase().includes(term) ||
      (l.phone ?? "").toLowerCase().includes(term)
    )
  })

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Landlords</h1>
          <p className="text-muted-foreground mt-1">
            The property owners you manage buildings for
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Landlord
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add landlord</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="John Kamau / Acme Holdings Ltd"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="owner@email.com" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0712 345 678" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nationalId">National ID</Label>
                  <Input id="nationalId" value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="kraPin">KRA PIN</Label>
                  <Input id="kraPin" value={form.kraPin} onChange={(e) => set("kraPin", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nextOfKinName">Next of kin</Label>
                  <Input id="nextOfKinName" value={form.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nextOfKinPhone">Next of kin phone</Label>
                  <Input id="nextOfKinPhone" value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Report channel</Label>
                  <Select value={form.reportChannel} onValueChange={(v) => set("reportChannel", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="How they get reports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                     
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Report cadence</Label>
                  <Select value={form.reportCadence} onValueChange={(v) => set("reportCadence", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="How often" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add landlord
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-secondary rounded w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <User className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No landlords yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm
                ? "Try a different search"
                : "Add the property owners you manage, or import them in bulk from the Import page."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((l) => (
            <Card key={l._id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg line-clamp-1">{l.name}</CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    <LandlordReportDialog
                      landlordId={l._id}
                      landlordName={l.name}
                      hasChannel={Boolean(l.reportChannel && (l.email || l.phone))}
                    />
                    <Button variant="outline" size="sm" onClick={() => handleDelete(l._id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {l.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" /> <span className="line-clamp-1">{l.email}</span>
                  </div>
                )}
                {l.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" /> <span>{l.phone}</span>
                  </div>
                )}
                {l.reportChannel && (
                  <p className="text-xs pt-2 border-t">
                    Reports via <span className="capitalize">{l.reportChannel}</span>
                    {l.reportCadence ? `, ${l.reportCadence}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
