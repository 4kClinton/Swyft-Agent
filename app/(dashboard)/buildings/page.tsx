"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Search, MapPin, BuildingIcon, Users, Trash2, Pencil, AlertTriangle, ImagePlus, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { NAIROBI_AREAS, type Area } from "@/lib/areas"

// Unit types users can tag vacant-unit sample photos with. Mirrors the
// new-building wizard so the `<prefix>_type_<type>` media keys stay consistent.
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

const genMediaPrefix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `mk_${Date.now()}_${Math.random().toString(36).slice(2)}`

type BuildingSummary = { _id: string; name: string }

type UnitMixRow = { type: string; count: number; rent?: number }
type UnitTypeMedia = { type: string; imageCount: number }

// Building shape as returned by buildings.list (subset we edit).
type Building = {
  _id: string
  name: string
  area?: string
  address?: string
  city?: string
  county?: string
  description?: string
  caretakerName?: string
  caretakerPhone?: string
  totalUnits?: number
  unitMix?: UnitMixRow[]
  mediaKeyPrefix?: string
  imageUrl?: string
  buildingImageCount?: number
  unitTypeMedia?: UnitTypeMedia[]
}

type EditForm = {
  name: string
  area: string
  address: string
  city: string
  county: string
  description: string
  caretakerName: string
  caretakerPhone: string
  totalUnits: string
}

const toEditForm = (b: Building): EditForm => ({
  name: b.name ?? "",
  area: b.area ?? "",
  address: b.address ?? "",
  city: b.city ?? "",
  county: b.county ?? "",
  description: b.description ?? "",
  caretakerName: b.caretakerName ?? "",
  caretakerPhone: b.caretakerPhone ?? "",
  totalUnits: b.totalUnits != null ? String(b.totalUnits) : "",
})

export default function BuildingsPage() {
  const buildingsData = useQuery(api.buildings.list)
  const removeBuilding = useMutation(api.buildings.remove)
  const loading = buildingsData === undefined
  const buildings = buildingsData ?? []
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [pendingDelete, setPendingDelete] = useState<BuildingSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const updateBuilding = useMutation(api.buildings.update)
  const [editing, setEditing] = useState<Building | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Marketplace media (edit modal) ─────────────────────────────────────────
  // Uploads route through the same customer-deployment broker the new-building
  // wizard uses: building photos → `<prefix>_building`, per-type vacant samples →
  // `<prefix>_type_<type>`. We track counts locally and persist a manifest.
  const requestImageUploadUrl = useAction(api.marketplaceMedia.requestImageUploadUrl)
  const attachImage = useAction(api.marketplaceMedia.attachImage)
  const [mediaPrefix, setMediaPrefix] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined)
  const [buildingImgCount, setBuildingImgCount] = useState(0)
  const [buildingImgUploading, setBuildingImgUploading] = useState(false)
  // type key → { count, uploading }
  const [typeMedia, setTypeMedia] = useState<
    Record<string, { count: number; uploading: boolean }>
  >({})
  const anyMediaUploading =
    buildingImgUploading || Object.values(typeMedia).some((t) => t.uploading)

  // Lazily assign a prefix the first time media is uploaded for a building that
  // doesn't have one yet (legacy rows created before media capture).
  const ensurePrefix = () => {
    if (mediaPrefix) return mediaPrefix
    const p = genMediaPrefix()
    setMediaPrefix(p)
    return p
  }

  // Upload one image to the customer storage under `mediaKey`, returning its URL.
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
    return { url: (out?.url ?? undefined) as string | undefined }
  }

  const onBuildingImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const prefix = ensurePrefix()
    setBuildingImgUploading(true)
    try {
      const results = await Promise.all(
        Array.from(files).map((f) => putImage(`${prefix}_building`, f)),
      )
      // First uploaded image with a URL becomes/refreshes the cover.
      const firstUrl = results.find((r) => r.url)?.url
      setCoverUrl((prev) => prev ?? firstUrl)
      setBuildingImgCount((n) => n + results.length)
    } catch (e: any) {
      toast.error(e?.message ?? "Building photo upload failed")
    } finally {
      setBuildingImgUploading(false)
    }
  }

  const onTypeImages = async (type: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const prefix = ensurePrefix()
    setTypeMedia((p) => ({
      ...p,
      [type]: { count: p[type]?.count ?? 0, uploading: true },
    }))
    try {
      const results = await Promise.all(
        Array.from(files).map((f) => putImage(`${prefix}_type_${type}`, f)),
      )
      setTypeMedia((p) => ({
        ...p,
        [type]: { count: (p[type]?.count ?? 0) + results.length, uploading: false },
      }))
    } catch (e: any) {
      setTypeMedia((p) => ({
        ...p,
        [type]: { count: p[type]?.count ?? 0, uploading: false },
      }))
      toast.error(e?.message ?? `${typeLabel(type)} photo upload failed`)
    }
  }

  // Unit types to offer sample-photo slots for: the building's own mix if known,
  // otherwise the common residential types.
  const editTypeOptions = (() => {
    const fromMix = (editing?.unitMix ?? [])
      .map((r) => r.type)
      .filter((t): t is string => !!t)
    const base = fromMix.length
      ? fromMix
      : ["bedsitter", "studio", "1br", "2br", "3br"]
    // Include any types that already have recorded media even if not in the mix.
    const withExisting = new Set([
      ...base,
      ...Object.keys(typeMedia).filter((t) => (typeMedia[t]?.count ?? 0) > 0),
    ])
    return Array.from(withExisting)
  })()

  // Areas come from the shared admin-managed list (customer side); fall back to
  // the bundled Nairobi list so the picker always has options.
  const fetchSharedAreas = useAction(api.areas.fetchShared)
  const [areaList, setAreaList] = useState<Area[]>(NAIROBI_AREAS)
  useEffect(() => {
    let alive = true
    fetchSharedAreas({})
      .then((list) => { if (alive && list?.length) setAreaList(list) })
      .catch(() => {})
    return () => { alive = false }
  }, [fetchSharedAreas])

  const openEdit = (b: Building) => {
    setEditing(b)
    setEditForm(toEditForm(b))
    setMediaPrefix(b.mediaKeyPrefix ?? null)
    setCoverUrl(b.imageUrl)
    setBuildingImgCount(b.buildingImageCount ?? 0)
    setBuildingImgUploading(false)
    setTypeMedia(
      Object.fromEntries(
        (b.unitTypeMedia ?? []).map((m) => [
          m.type,
          { count: m.imageCount, uploading: false },
        ]),
      ),
    )
  }

  const closeEdit = () => {
    setEditing(null)
    setEditForm(null)
  }

  const setField = (key: keyof EditForm, value: string) =>
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const saveEdit = async () => {
    if (!editing || !editForm) return
    if (!editForm.name.trim()) {
      toast.error("Building name is required")
      return
    }
    if (!editForm.caretakerName.trim() || !editForm.caretakerPhone.trim()) {
      toast.error("Caretaker name and phone are required")
      return
    }
    if (anyMediaUploading) {
      toast.error("Wait for photo uploads to finish")
      return
    }
    setSaving(true)
    try {
      const unitTypeMedia = Object.entries(typeMedia)
        .filter(([, m]) => m.count > 0)
        .map(([type, m]) => ({ type, imageCount: m.count }))
      await updateBuilding({
        id: editing._id as any,
        name: editForm.name.trim(),
        area: editForm.area || undefined,
        address: editForm.address.trim() || undefined,
        city: editForm.city.trim() || undefined,
        county: editForm.county.trim() || undefined,
        description: editForm.description.trim() || undefined,
        caretakerName: editForm.caretakerName.trim(),
        caretakerPhone: editForm.caretakerPhone.trim(),
        totalUnits: editForm.totalUnits ? Number(editForm.totalUnits) : undefined,
        mediaKeyPrefix: mediaPrefix ?? undefined,
        imageUrl: coverUrl ?? undefined,
        buildingImageCount: buildingImgCount || undefined,
        unitTypeMedia: unitTypeMedia.length ? unitTypeMedia : undefined,
      })
      toast.success("Building updated")
      closeEdit()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update building")
    } finally {
      setSaving(false)
    }
  }

  // Fetch occupancy for the building awaiting confirmation so we can warn the
  // user (and disable the button) before anything is destroyed.
  const deletionStats = useQuery(
    api.buildings.deletionStats,
    pendingDelete ? { id: pendingDelete._id as any } : "skip",
  )
  const statsLoading = pendingDelete !== null && deletionStats === undefined
  const hasDependents =
    !!deletionStats && (deletionStats.tenantCount > 0 || deletionStats.unitCount > 0)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await removeBuilding({ id: pendingDelete._id as any })
      toast.success("Building deleted")
      setPendingDelete(null)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete building")
    } finally {
      setDeleting(false)
    }
  }

  const filteredBuildings = buildings.filter((building) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      building.name.toLowerCase().includes(term) ||
      (building.address ?? "").toLowerCase().includes(term) ||
      (building.city ?? "").toLowerCase().includes(term)

    const matchesType = filterType === "all" || building.propertyType === filterType

    return matchesSearch && matchesType
  })

  if (loading) {
    return (
      <div className="w-full space-y-4 p-4 md:p-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Buildings</h1>
          <Button asChild>
            <Link href="/new-building">
              <Plus className="mr-2 h-4 w-4" />
              Add Building
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-secondary rounded w-3/4"></div>
                <div className="h-3 bg-secondary rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-secondary rounded w-full"></div>
                  <div className="h-3 bg-secondary rounded w-2/3"></div>
                  <div className="h-6 bg-secondary rounded w-1/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Buildings</h1>
          <p className="text-muted-foreground mt-1">Manage your property buildings</p>
        </div>
        <Button asChild>
          <Link href="/new-building">
            <Plus className="mr-2 h-4 w-4" />
            Add Building
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by name, address, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="apartment">Apartment</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="mixed">Mixed Use</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Buildings Grid */}
      {filteredBuildings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <BuildingIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No buildings found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterType !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first building"}
              </p>
              <Button asChild>
                <Link href="/new-building">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Building
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBuildings.map((building) => (
            <Card key={building._id} className="hover:shadow-lg transition-shadow overflow-hidden">
              {building.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={building.imageUrl}
                  alt={building.name}
                  className="h-36 w-full object-cover"
                />
              )}
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-1">{building.name}</CardTitle>
                    <div className="flex items-center text-muted-foreground text-sm mt-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      <span className="line-clamp-1">
                        {[building.address, building.city].filter(Boolean).join(", ") || "No address"}
                      </span>
                    </div>
                  </div>
                  {building.propertyType && (
                    <Badge className="bg-green-100 text-green-800 capitalize">
                      {building.propertyType}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-muted-foreground">
                    <BuildingIcon className="h-4 w-4 mr-1" />
                    <span className="capitalize">{building.propertyType ?? "property"}</span>
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <Users className="h-4 w-4 mr-1" />
                    <span>{building.totalUnits ?? 0} units</span>
                  </div>
                </div>

                {building.description && <p className="text-sm text-muted-foreground line-clamp-2">{building.description}</p>}

                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(building._creationTime).toLocaleDateString()}
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(building as Building)}
                      aria-label={`Edit ${building.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingDelete({ _id: building._id, name: building.name })}
                      aria-label={`Delete ${building.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving && !anyMediaUploading) closeEdit()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit building</DialogTitle>
            <DialogDescription>Update this building&apos;s details.</DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Building name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-area">Area</Label>
                <Select value={editForm.area} onValueChange={(v) => setField("area", v)}>
                  <SelectTrigger id="edit-area">
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    {areaList.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    value={editForm.address}
                    onChange={(e) => setField("address", e.target.value)}
                    placeholder="Street / estate"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-city">City</Label>
                  <Input
                    id="edit-city"
                    value={editForm.city}
                    onChange={(e) => setField("city", e.target.value)}
                    placeholder="City"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-county">County</Label>
                  <Input
                    id="edit-county"
                    value={editForm.county}
                    onChange={(e) => setField("county", e.target.value)}
                    placeholder="County"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-total-units">Total units</Label>
                  <Input
                    id="edit-total-units"
                    type="number"
                    min={0}
                    value={editForm.totalUnits}
                    onChange={(e) => setField("totalUnits", e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-caretaker-name">Caretaker name</Label>
                  <Input
                    id="edit-caretaker-name"
                    value={editForm.caretakerName}
                    onChange={(e) => setField("caretakerName", e.target.value)}
                    placeholder="Caretaker name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-caretaker-phone">Caretaker phone</Label>
                  <Input
                    id="edit-caretaker-phone"
                    value={editForm.caretakerPhone}
                    onChange={(e) => setField("caretakerPhone", e.target.value)}
                    placeholder="07xx xxx xxx"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Notes about this building"
                  rows={3}
                />
              </div>

              {/* ─── Photos ──────────────────────────────────────────────── */}
              <div className="grid gap-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Photos</p>
                  <p className="text-xs text-muted-foreground">
                    Add photos of the building and sample photos of each vacant unit
                    type. New photos are added to any already on file.
                  </p>
                </div>

                {/* Building photos */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverUrl}
                        alt="Building cover"
                        className="h-12 w-12 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <BuildingIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">Building photos</p>
                      <p className="text-xs text-muted-foreground">
                        {buildingImgCount > 0
                          ? `${buildingImgCount} photo${buildingImgCount === 1 ? "" : "s"} on file`
                          : "No photos yet"}
                      </p>
                    </div>
                  </div>
                  <label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={buildingImgUploading}
                      onChange={(e) => {
                        onBuildingImages(e.target.files)
                        e.target.value = ""
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={buildingImgUploading}
                    >
                      <span className="cursor-pointer">
                        {buildingImgUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        <span className="ml-2">Add</span>
                      </span>
                    </Button>
                  </label>
                </div>

                {/* Vacant unit sample photos, tagged by type */}
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Vacant unit samples
                  </p>
                  {editTypeOptions.map((type) => {
                    const m = typeMedia[type]
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{typeLabel(type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {m?.count
                              ? `${m.count} photo${m.count === 1 ? "" : "s"}`
                              : "No photos"}
                          </p>
                        </div>
                        <label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            disabled={m?.uploading}
                            onChange={(e) => {
                              onTypeImages(type, e.target.files)
                              e.target.value = ""
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            disabled={m?.uploading}
                          >
                            <span className="cursor-pointer">
                              {m?.uploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ImagePlus className="h-4 w-4" />
                              )}
                              <span className="ml-2">Add</span>
                            </span>
                          </Button>
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeEdit}
              disabled={saving || anyMediaUploading}
            >
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving || anyMediaUploading}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              {statsLoading
                ? "Checking whether this building has tenants or units…"
                : hasDependents
                  ? "This building still has occupancy data attached. Move it off the building before deleting."
                  : "This permanently removes the building. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {hasDependents && deletionStats && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Deletion blocked</p>
                <p className="text-destructive/90">
                  {[
                    deletionStats.tenantCount > 0 &&
                      `${deletionStats.tenantCount} tenant${deletionStats.tenantCount === 1 ? "" : "s"}`,
                    deletionStats.unitCount > 0 &&
                      `${deletionStats.unitCount} unit${deletionStats.unitCount === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" and ")}{" "}
                  are still linked to this building.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || statsLoading || hasDependents}
            >
              {deleting ? "Deleting…" : "Delete building"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
