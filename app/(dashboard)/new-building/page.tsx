"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import dynamic from "next/dynamic"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Loader2, ArrowLeft, Plus, X } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

// Leaflet touches `window`, so the picker must be client-only.
const LocationPicker = dynamic(() => import("@/components/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-md border text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map…
    </div>
  ),
})

const UNIT_TYPES = [
  { value: "bedsitter", label: "Bedsitter" },
  { value: "studio", label: "Studio" },
  { value: "1br", label: "1 Bedroom" },
  { value: "2br", label: "2 Bedroom" },
  { value: "3br", label: "3 Bedroom" },
  { value: "4br+", label: "4+ Bedroom" },
  { value: "commercial", label: "Commercial / Shop" },
  { value: "other", label: "Other" },
]

const COMMON_AMENITIES = [
  "Parking",
  "Borehole / Water",
  "Backup Generator",
  "CCTV",
  "Security / Guard",
  "Lift / Elevator",
  "Gym",
  "Swimming Pool",
  "WiFi",
  "Garbage Collection",
  "Balcony",
  "Fitted Kitchen",
  "Servant Quarter",
  "Playground",
]

type MixRow = { type: string; count: string; rent: string }
type LatLng = { lat: number; lng: number }

export default function NewBuildingPage() {
  const router = useRouter()
  const createBuilding = useMutation(api.buildings.create)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    county: "",
    propertyType: "apartment",
    caretakerName: "",
    caretakerPhone: "",
    totalUnits: "",
    description: "",
  })
  const [unitMix, setUnitMix] = useState<MixRow[]>([{ type: "1br", count: "", rent: "" }])
  const [amenities, setAmenities] = useState<string[]>([])
  const [customAmenity, setCustomAmenity] = useState("")
  const [location, setLocation] = useState<LatLng | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const mixTotal = useMemo(
    () => unitMix.reduce((sum, r) => sum + (Number(r.count) || 0), 0),
    [unitMix],
  )

  const setMix = (i: number, k: keyof MixRow, v: string) =>
    setUnitMix((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const addMixRow = () => setUnitMix((p) => [...p, { type: "1br", count: "", rent: "" }])
  const removeMixRow = (i: number) => setUnitMix((p) => p.filter((_, idx) => idx !== i))

  const toggleAmenity = (a: string) =>
    setAmenities((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))
  const addCustomAmenity = () => {
    const a = customAmenity.trim()
    if (!a) return
    if (!amenities.includes(a)) setAmenities((p) => [...p, a])
    setCustomAmenity("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return toast.error("Building name is required")
    if (!form.caretakerName.trim()) return toast.error("Caretaker name is required")
    if (!form.caretakerPhone.trim()) return toast.error("Caretaker phone is required")

    // Only keep mix rows that have a positive count.
    const cleanedMix = unitMix
      .filter((r) => Number(r.count) > 0)
      .map((r) => ({
        type: r.type,
        count: Number(r.count),
        ...(Number(r.rent) > 0 ? { rent: Number(r.rent) } : {}),
      }))

    // Manual total wins; otherwise fall back to the sum of the mix.
    const totalUnits = form.totalUnits ? Number(form.totalUnits) : mixTotal || undefined

    setSaving(true)
    try {
      await createBuilding({
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        county: form.county || undefined,
        propertyType: form.propertyType as "apartment" | "house" | "commercial" | "mixed",
        caretakerName: form.caretakerName,
        caretakerPhone: form.caretakerPhone,
        totalUnits,
        description: form.description || undefined,
        unitMix: cleanedMix.length ? cleanedMix : undefined,
        amenities: amenities.length ? amenities : undefined,
        latitude: location?.lat,
        longitude: location?.lng,
      })
      toast.success("Building created")
      router.push("/buildings")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create building")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Link href="/buildings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to buildings
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Add Building</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* --- Basics --- */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Building name *</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sunrise Apartments" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Kimathi Street" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City / Town</Label>
                  <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Nairobi" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="county">County</Label>
                  <Input id="county" value={form.county} onChange={(e) => set("county", e.target.value)} placeholder="Nairobi" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.propertyType} onValueChange={(v) => set("propertyType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="mixed">Mixed use</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="caretakerName">Caretaker name *</Label>
                  <Input id="caretakerName" value={form.caretakerName} onChange={(e) => set("caretakerName", e.target.value)} placeholder="Jane Mwangi" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caretakerPhone">Caretaker phone *</Label>
                  <Input id="caretakerPhone" value={form.caretakerPhone} onChange={(e) => set("caretakerPhone", e.target.value)} placeholder="0712 345 678" required />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The on-site caretaker renters and Swyft can reach for viewings and access.
              </p>
            </div>

            <Separator />

            {/* --- What the building consists of (unit mix) --- */}
            <div className="space-y-3">
              <div>
                <Label className="text-base">What does the building consist of?</Label>
                <p className="text-sm text-muted-foreground">
                  Break the building down by unit type. Add a row per type with how many there are (and optional rent).
                </p>
              </div>

              <div className="space-y-2">
                {unitMix.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      {i === 0 && <Label className="text-xs text-muted-foreground">Type</Label>}
                      <Select value={row.type} onValueChange={(v) => setMix(i, "type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20 space-y-1">
                      {i === 0 && <Label className="text-xs text-muted-foreground">Count</Label>}
                      <Input type="number" min="0" value={row.count} onChange={(e) => setMix(i, "count", e.target.value)} placeholder="40" />
                    </div>
                    <div className="w-28 space-y-1">
                      {i === 0 && <Label className="text-xs text-muted-foreground">Rent (KES)</Label>}
                      <Input type="number" min="0" value={row.rent} onChange={(e) => setMix(i, "rent", e.target.value)} placeholder="12000" />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMixRow(i)}
                      disabled={unitMix.length === 1}
                      aria-label="Remove row"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={addMixRow}>
                  <Plus className="mr-1 h-4 w-4" /> Add unit type
                </Button>
                {mixTotal > 0 && (
                  <span className="text-sm text-muted-foreground">Mix total: {mixTotal} units</span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="units">Total units</Label>
                <Input
                  id="units"
                  type="number"
                  min="0"
                  value={form.totalUnits}
                  onChange={(e) => set("totalUnits", e.target.value)}
                  placeholder={mixTotal ? String(mixTotal) : "24"}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the mix total{mixTotal ? ` (${mixTotal})` : ""}.
                </p>
              </div>
            </div>

            <Separator />

            {/* --- Amenities --- */}
            <div className="space-y-3">
              <Label className="text-base">Amenities</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_AMENITIES.map((a) => {
                  const active = amenities.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAmenity(a)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-muted"
                      }`}
                    >
                      {a}
                    </button>
                  )
                })}
              </div>

              {/* Custom amenities not in the common list */}
              {amenities.filter((a) => !COMMON_AMENITIES.includes(a)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {amenities
                    .filter((a) => !COMMON_AMENITIES.includes(a))
                    .map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground">
                        {a}
                        <button type="button" onClick={() => toggleAmenity(a)} aria-label={`Remove ${a}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={customAmenity}
                  onChange={(e) => setCustomAmenity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addCustomAmenity()
                    }
                  }}
                  placeholder="Add another amenity…"
                />
                <Button type="button" variant="outline" onClick={addCustomAmenity}>Add</Button>
              </div>
            </div>

            <Separator />

            {/* --- Location --- */}
            <div className="space-y-3">
              <div>
                <Label className="text-base">Location</Label>
                <p className="text-sm text-muted-foreground">
                  Search or drop a pin to set the building&apos;s exact location.
                </p>
              </div>
              <LocationPicker value={location} onChange={setLocation} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.push("/buildings")}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create building
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
