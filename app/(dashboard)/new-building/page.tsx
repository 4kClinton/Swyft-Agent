"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useAction, useQuery } from "convex/react"
import { useAuth } from "@/components/auth-provider"
import dynamic from "next/dynamic"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowLeft, ArrowRight, Plus, X, CheckCircle2, ImageIcon, Video } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import type { PickedLocation } from "@/components/location-picker"

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

const typeLabel = (v: string) => UNIT_TYPES.find((t) => t.value === v)?.label ?? v

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

const STEPS = [
  { title: "Basics", description: "Tell us about the building" },
  { title: "Units & media", description: "Break it down by unit type" },
  { title: "Amenities", description: "What does the building offer?" },
  { title: "Location & details", description: "Pin it and add finishing touches" },
] as const

export default function NewBuildingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isPropertyManager = user?.companyKind === "property_manager"
  const createBuilding = useMutation(api.buildings.create)
  const publishVacancies = useAction(api.marketplace.publishBuildingVacancies)
  // Property managers must say which landlord owns the building. Only fetched
  // for PMs; landlord-kind companies own their own buildings (implicit).
  const landlordsData = useQuery(api.landlords.list, isPropertyManager ? {} : "skip")
  const landlords = landlordsData ?? []
  const createLandlord = useMutation(api.landlords.create)
  const [landlordId, setLandlordId] = useState("")
  const [addLandlordOpen, setAddLandlordOpen] = useState(false)
  const [newLandlord, setNewLandlord] = useState({ name: "", phone: "" })
  const [savingLandlord, setSavingLandlord] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(0)
  // When unit types are missing a video at submit, we confirm with the landlord
  // that a Swyft team member will record those vacant units on-site.
  const [recordPromptTypes, setRecordPromptTypes] = useState<string[] | null>(null)
  const [form, setForm] = useState({
    name: "",
    propertyType: "apartment",
    caretakerName: "",
    caretakerPhone: "",
    totalUnits: "",
    description: "",
    directions: "",
  })
  const [unitMix, setUnitMix] = useState<MixRow[]>([{ type: "1br", count: "", rent: "" }])
  // Migrating an occupied building? Then the unit mix is NOT all vacant — we must
  // wait for tenant data before advertising, so we don't list occupied units on
  // Swyft. When true we skip the create-time push; the user lists net vacancies
  // from the Ads page once tenants are imported.
  const [hasExistingTenants, setHasExistingTenants] = useState(false)
  const [amenities, setAmenities] = useState<string[]>([])
  const [customAmenity, setCustomAmenity] = useState("")
  // Address + city are derived from the map pin via reverse geocoding.
  const [location, setLocation] = useState<PickedLocation | null>(null)

  // ─── Marketplace media ──────────────────────────────────────────────────────
  // Captured here and uploaded to the swyft-customer deployment (images → its
  // Convex storage, videos → its Mux) so a later vacancy can auto-publish a reel.
  // A client-generated prefix keys it all, since the building doc doesn't exist yet.
  const [mediaKeyPrefix] = useState(
    () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `mk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  )
  const requestImageUploadUrl = useAction(api.marketplaceMedia.requestImageUploadUrl)
  const attachImage = useAction(api.marketplaceMedia.attachImage)
  const requestVideoUploadUrl = useAction(api.marketplaceMedia.requestVideoUploadUrl)

  const [buildingImage, setBuildingImage] = useState<{
    uploading: boolean
    done: boolean
    url?: string
  }>({ uploading: false, done: false })
  // Keyed by unit type, so each type's media survives row reorders.
  const [videoByType, setVideoByType] = useState<
    Record<string, { uploading: boolean; uploadId?: string }>
  >({})
  const [imagesByType, setImagesByType] = useState<
    Record<string, { uploading: boolean; storageIds: string[] }>
  >({})

  // Upload an image to the customer storage and record it under `mediaKey`.
  const putImage = async (mediaKey: string, file: File) => {
    const { uploadUrl } = await requestImageUploadUrl({ mediaKey })
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    if (!res.ok) throw new Error("Image upload failed")
    const { storageId } = await res.json()
    const out = await attachImage({ mediaKey, storageId })
    return { storageId: storageId as string, url: out?.url ?? undefined }
  }

  // Upload a video to the customer Mux via the brokered direct-upload URL.
  const putVideo = async (mediaKey: string, file: File) => {
    const { uploadUrl, uploadId } = await requestVideoUploadUrl({ mediaKey })
    const res = await fetch(uploadUrl, { method: "PUT", body: file })
    if (!res.ok) throw new Error("Video upload failed")
    return { uploadId }
  }

  const onBuildingImage = async (file?: File) => {
    if (!file) return
    setBuildingImage({ uploading: true, done: false })
    try {
      const { url } = await putImage(`${mediaKeyPrefix}_building`, file)
      setBuildingImage({ uploading: false, done: true, url })
    } catch (e: any) {
      setBuildingImage({ uploading: false, done: false })
      toast.error(e?.message ?? "Building image upload failed")
    }
  }

  const onTypeVideo = async (type: string, file?: File) => {
    if (!file) return
    setVideoByType((p) => ({ ...p, [type]: { uploading: true } }))
    try {
      const { uploadId } = await putVideo(`${mediaKeyPrefix}_type_${type}`, file)
      setVideoByType((p) => ({ ...p, [type]: { uploading: false, uploadId } }))
    } catch (e: any) {
      setVideoByType((p) => ({ ...p, [type]: { uploading: false } }))
      toast.error(e?.message ?? "Video upload failed")
    }
  }

  const onTypeImages = async (type: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    setImagesByType((p) => ({
      ...p,
      [type]: { uploading: true, storageIds: p[type]?.storageIds ?? [] },
    }))
    try {
      const results = await Promise.all(
        Array.from(files).map((f) => putImage(`${mediaKeyPrefix}_type_${type}`, f)),
      )
      setImagesByType((p) => ({
        ...p,
        [type]: {
          uploading: false,
          storageIds: [...(p[type]?.storageIds ?? []), ...results.map((r) => r.storageId)],
        },
      }))
    } catch (e: any) {
      setImagesByType((p) => ({
        ...p,
        [type]: { uploading: false, storageIds: p[type]?.storageIds ?? [] },
      }))
      toast.error(e?.message ?? "Image upload failed")
    }
  }

  const anyMediaUploading =
    buildingImage.uploading ||
    Object.values(videoByType).some((v) => v.uploading) ||
    Object.values(imagesByType).some((i) => i.uploading)

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

  const handleAddLandlord = async () => {
    if (!newLandlord.name.trim()) {
      toast.error("Landlord name is required")
      return
    }
    setSavingLandlord(true)
    try {
      const id = await createLandlord({
        name: newLandlord.name.trim(),
        phone: newLandlord.phone.trim() || undefined,
      })
      setLandlordId(id)
      setNewLandlord({ name: "", phone: "" })
      setAddLandlordOpen(false)
      toast.success("Landlord added")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add landlord")
    } finally {
      setSavingLandlord(false)
    }
  }

  // Returns an error message if the given step is incomplete, else null.
  const validateStep = (i: number): string | null => {
    if (i === 0) {
      if (isPropertyManager && !landlordId) return "Select the landlord who owns this building"
      if (!form.name.trim()) return "Building name is required"
      if (!form.caretakerName.trim()) return "Caretaker name is required"
      if (!form.caretakerPhone.trim()) return "Caretaker phone is required"
      if (buildingImage.uploading) return "Wait for the building image to finish uploading"
    }
    if (i === 1) {
      const cleanedMix = unitMix.filter((r) => Number(r.count) > 0)
      if (!cleanedMix.length) return "Add at least one unit type with a count"
      // Media is optional: any unit type a landlord doesn't record gets queued
      // for a Swyft field shoot. We only block on uploads still in flight.
      if (anyMediaUploading) return "Wait for media uploads to finish"
    }
    if (i === 3) {
      if (!location) return "Drop a pin on the map to set the building's location"
    }
    return null
  }

  const isLastStep = step === STEPS.length - 1

  const goNext = () => {
    const err = validateStep(step)
    if (err) return toast.error(err)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  // Vacant unit types (positive count) that have no video uploaded — Swyft will
  // record these on-site.
  const typesMissingVideo = useMemo(() => {
    const types = new Set(
      unitMix.filter((r) => Number(r.count) > 0).map((r) => r.type),
    )
    return [...types].filter((t) => !videoByType[t]?.uploadId)
  }, [unitMix, videoByType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Re-validate every step; jump back to the first one that fails.
    for (let i = 0; i < STEPS.length; i++) {
      const err = validateStep(i)
      if (err) {
        setStep(i)
        return toast.error(err)
      }
    }

    // If any vacant type has no video, confirm the Swyft field-recording first.
    // Skip when the building already has tenants: we're not advertising at creation,
    // so there's nothing to record on-site yet.
    if (!hasExistingTenants && typesMissingVideo.length > 0) {
      setRecordPromptTypes(typesMissingVideo)
      return
    }
    await doCreate()
  }

  const doCreate = async () => {
    setRecordPromptTypes(null)

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
      const buildingId = await createBuilding({
        landlordId: isPropertyManager && landlordId ? (landlordId as any) : undefined,
        name: form.name,
        address: location?.address || undefined,
        city: location?.city || undefined,
        county: location?.county || undefined,
        propertyType: form.propertyType as "apartment" | "house" | "commercial" | "mixed",
        caretakerName: form.caretakerName,
        caretakerPhone: form.caretakerPhone,
        totalUnits,
        description: form.description || undefined,
        directions: form.directions || undefined,
        unitMix: cleanedMix.length ? cleanedMix : undefined,
        amenities: amenities.length ? amenities : undefined,
        latitude: location?.lat,
        longitude: location?.lng,
        mediaKeyPrefix,
        imageUrl: buildingImage.url,
      })

      if (hasExistingTenants) {
        // Occupied building being migrated: don't broadcast the mix as vacant.
        // Vacancies are listed (net of occupancy) from the Ads page once the
        // tenant data has been imported.
        toast.success("Building created — import its tenants, then list any vacancies from Ads")
      } else {
        // Brand-new/empty building: push every vacant unit type to Swyft. Types
        // with ready video auto-publish a reel; types without are queued for a
        // Swyft field recording.
        try {
          const res = await publishVacancies({ buildingId })
          if (res.queued > 0) {
            toast.success(
              `Building created — ${res.queued} unit type${res.queued > 1 ? "s" : ""} queued for Swyft recording`,
            )
          } else if (res.published > 0) {
            toast.success(`Building created — ${res.published} listing${res.published > 1 ? "s" : ""} published to Swyft`)
          } else {
            toast.success("Building created")
          }
        } catch {
          // The building saved; only the Swyft push failed. Don't block the user.
          toast.success("Building created (Swyft sync will retry from the Ads page)")
        }
      }

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
        <CardHeader className="space-y-4">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-2xl">Add Building</CardTitle>
            <span className="text-sm text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <div className="space-y-2">
            <Progress value={((step + 1) / STEPS.length) * 100} className="h-2" />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{STEPS[step].title}</p>
              <p className="text-xs text-muted-foreground">{STEPS[step].description}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* --- Step 1: Basics --- */}
            <div className={step === 0 ? "space-y-4" : "hidden"}>
              {/* Property managers must attribute the building to a landlord. */}
              {isPropertyManager && (
                <div className="space-y-2">
                  <Label>Landlord (owner) *</Label>
                  <div className="flex gap-2">
                    <Select value={landlordId} onValueChange={setLandlordId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Who owns this building?" />
                      </SelectTrigger>
                      <SelectContent>
                        {landlords.map((l) => (
                          <SelectItem key={l._id} value={l._id}>
                            {l.name}
                          </SelectItem>
                        ))}
                        {landlords.length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No landlords yet — add one
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={() => setAddLandlordOpen(true)}>
                      <Plus className="mr-1 h-4 w-4" /> New
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Manage owners on the Landlords page, or import them in bulk.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Building name *</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sunrise Apartments" required />
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
                <p className="text-xs text-muted-foreground">
                  The address is set from the map pin in the Location step.
                </p>
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

              {/* Building image (required) */}
              <div className="space-y-2">
                <Label>Building image</Label>
                <p className="text-xs text-muted-foreground">
                  A clear photo of the building exterior, shown as the listing cover.
                  Optional — Swyft can capture it when recording your units.
                </p>
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                    {buildingImage.uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : buildingImage.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    {buildingImage.done ? "Replace image" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={buildingImage.uploading}
                      onChange={(e) => onBuildingImage(e.target.files?.[0])}
                    />
                  </label>
                  {buildingImage.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={buildingImage.url}
                      alt="Building"
                      className="h-12 w-12 rounded-md object-cover"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* --- Step 2: Units & media --- */}
            <div className={step === 1 ? "space-y-3" : "hidden"}>
              <div>
                <Label className="text-base">What does the building consist of?</Label>
                <p className="text-sm text-muted-foreground">
                  Break the building down by unit type. Add a row per type with how many there are (and optional rent).
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Video and images are optional — any unit type you don&apos;t record yourself
                  will be queued for a Swyft team member to come record on-site.
                </p>
              </div>

              <div className="space-y-2">
                {unitMix.map((row, i) => {
                  const vid = videoByType[row.type]
                  const imgs = imagesByType[row.type]
                  return (
                  <div key={i} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-end gap-2">
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

                    {/* Required media for this unit type — a video + images that
                        renters will browse when a unit of this type goes vacant. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Media for {typeLabel(row.type)} (optional)
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs hover:bg-muted">
                        {vid?.uploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : vid?.uploadId ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Video className="h-3.5 w-3.5" />
                        )}
                        {vid?.uploadId ? "Video added" : "Upload video"}
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          disabled={vid?.uploading}
                          onChange={(e) => onTypeVideo(row.type, e.target.files?.[0])}
                        />
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs hover:bg-muted">
                        {imgs?.uploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : imgs?.storageIds.length ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5" />
                        )}
                        {imgs?.storageIds.length
                          ? `${imgs.storageIds.length} image${imgs.storageIds.length > 1 ? "s" : ""}`
                          : "Upload images"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={imgs?.uploading}
                          onChange={(e) => onTypeImages(row.type, e.target.files)}
                        />
                      </label>
                    </div>
                  </div>
                )})}
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

              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={hasExistingTenants}
                  onCheckedChange={(v) => setHasExistingTenants(v === true)}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    This building already has tenants I&apos;ll import
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    We won&apos;t advertise these units on Swyft yet. Import the tenant
                    data first, then list only the genuinely vacant units from the Ads
                    page — so occupied units are never shown as available.
                  </span>
                </span>
              </label>
            </div>

            {/* --- Step 3: Amenities --- */}
            <div className={step === 2 ? "space-y-3" : "hidden"}>
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

            {/* --- Step 4: Location & details --- */}
            <div className={step === 3 ? "space-y-6" : "hidden"}>
            {/* --- Location --- */}
            <div className="space-y-3">
              <div>
                <Label className="text-base">Location *</Label>
                <p className="text-sm text-muted-foreground">
                  Search or drop a pin to set the building&apos;s exact location — the address and town are filled in from the pin.
                </p>
              </div>
              <LocationPicker value={location} onChange={setLocation} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="directions">Directions / landmark</Label>
              <p className="text-sm text-muted-foreground">
                Helps the Swyft team find the unit on-site — e.g. &quot;blue gate opposite the shop, 2nd floor&quot;.
              </p>
              <Textarea id="directions" value={form.directions} onChange={(e) => set("directions", e.target.value)} rows={2} placeholder="Blue gate opposite Naivas, 2nd floor" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            </div>
            {/* --- End step 4 --- */}

            <Separator />

            <div className="flex items-center justify-between gap-2">
              {step === 0 ? (
                <Button type="button" variant="outline" onClick={() => router.push("/buildings")}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
              )}

              {isLastStep ? (
                <Button type="submit" disabled={saving || anyMediaUploading}>
                  {(saving || anyMediaUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {anyMediaUploading ? "Uploading media…" : "Create building"}
                </Button>
              ) : (
                <Button type="button" onClick={goNext}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Confirm the Swyft field-recording when videos are missing. */}
      <Dialog
        open={recordPromptTypes !== null}
        onOpenChange={(open) => {
          if (!open) setRecordPromptTypes(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" /> Let Swyft record your vacant units?
            </DialogTitle>
            <DialogDescription>
              You haven&apos;t added a video for{" "}
              {recordPromptTypes && recordPromptTypes.length > 0
                ? recordPromptTypes.map(typeLabel).join(", ")
                : "some unit types"}
              . No problem — a Swyft team member can come on-site and record these
              vacant units for you. They&apos;ll be queued for recording as soon as you
              create the building.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRecordPromptTypes(null)}
              disabled={saving}
            >
              Add videos myself
            </Button>
            <Button type="button" onClick={doCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create &amp; queue recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-add a landlord without leaving the wizard (property managers). */}
      <Dialog open={addLandlordOpen} onOpenChange={setAddLandlordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add landlord</DialogTitle>
            <DialogDescription>
              The owner this building belongs to. You can add more details later on the
              Landlords page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="newLandlordName">Name *</Label>
              <Input
                id="newLandlordName"
                value={newLandlord.name}
                onChange={(e) => setNewLandlord((p) => ({ ...p, name: e.target.value }))}
                placeholder="John Kamau / Acme Holdings Ltd"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newLandlordPhone">Phone</Label>
              <Input
                id="newLandlordPhone"
                value={newLandlord.phone}
                onChange={(e) => setNewLandlord((p) => ({ ...p, phone: e.target.value }))}
                placeholder="0712 345 678"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLandlordOpen(false)} disabled={savingLandlord}>
              Cancel
            </Button>
            <Button onClick={handleAddLandlord} disabled={savingLandlord}>
              {savingLandlord && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add landlord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
