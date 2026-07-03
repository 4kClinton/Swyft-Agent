"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, User, Building, Phone, Mail, DollarSign, Loader2, Pencil, Upload, Trash2, Briefcase, FileText } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BuildingUnitPicker, unitTypeLabel } from "@/components/building-unit-picker"
import { TenantAgreements } from "@/components/tenant-agreements"
import { DuplicateTenantsBanner } from "@/components/duplicate-tenants-dialog"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { toast } from "sonner"

type TenantStatus = Doc<"tenants">["status"]

export default function TenantsPage() {
  const tenants = useQuery(api.tenants.list)
  const buildings = useQuery(api.buildings.list)
  const units = useQuery(api.units.listForCompany)
  const createWithUnit = useMutation(api.tenants.createWithUnit)
  const updateTenant = useMutation(api.tenants.update)
  const removeMany = useMutation(api.tenants.removeMany)
  const genAgreementUploadUrl = useMutation(api.tenants.generateUploadUrl)
  const setAgreement = useMutation(api.tenants.setAgreement)

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all")
  const [nameQuery, setNameQuery] = useState("")
  const [arrearsFilter, setArrearsFilter] = useState<"all" | "arrears" | "clear">("all")
  const [saving, setSaving] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<Id<"tenants">>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    buildingId: "",
    unitNumber: "",
    unitType: "1br",
    rentAmount: "",
    depositAmount: "",
    billingDay: "1",
    arrearsBroughtForward: "",
  })

  const toggleSelected = (id: Id<"tenants">) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleDeleteSelected = async () => {
    setDeleting(true)
    try {
      const { deleted } = await removeMany({ ids: Array.from(selected) })
      toast.success(`Deleted ${deleted} tenant${deleted === 1 ? "" : "s"}`)
      setConfirmDelete(false)
      exitSelectMode()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete tenants")
    } finally {
      setDeleting(false)
    }
  }

  // Edit dialog state.
  const [editing, setEditing] = useState<Doc<"tenants"> | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    buildingId: "",
    unitId: "",
    status: "active" as TenantStatus,
    kraPin: "",
    dateOfBirth: "",
    gender: "",
    occupation: "",
    employer: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    tenantAgreementUrl: "",
  })

  const openEdit = (tenant: Doc<"tenants">) => {
    // Fall back to the unit's building for legacy tenants that stored a unit
    // but no building.
    const unit = tenant.unitId ? (units ?? []).find((u) => u._id === tenant.unitId) : undefined
    setEditForm({
      fullName: tenant.fullName,
      phone: tenant.phone,
      email: tenant.email ?? "",
      buildingId: tenant.buildingId ?? unit?.buildingId ?? "",
      unitId: tenant.unitId ?? "",
      status: tenant.status,
      kraPin: tenant.kraPin ?? "",
      dateOfBirth: tenant.dateOfBirth ?? "",
      gender: tenant.gender ?? "",
      occupation: tenant.occupation ?? "",
      employer: tenant.employer ?? "",
      emergencyContactName: tenant.emergencyContactName ?? "",
      emergencyContactPhone: tenant.emergencyContactPhone ?? "",
      emergencyContactRelation: tenant.emergencyContactRelation ?? "",
      tenantAgreementUrl: tenant.tenantAgreementUrl ?? "",
    })
    setEditing(tenant)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    if (!editForm.fullName) return toast.error("Name is required")
    if (!editForm.phone) return toast.error("M-Pesa phone is required")
    setEditSaving(true)
    try {
      const orEmpty = (s: string) => (s.trim() ? s.trim() : undefined)
      await updateTenant({
        id: editing._id,
        fullName: editForm.fullName,
        phone: editForm.phone,
        email: editForm.email || undefined,
        buildingId: editForm.buildingId ? (editForm.buildingId as Doc<"tenants">["buildingId"]) : undefined,
        unitId: editForm.unitId ? (editForm.unitId as Doc<"tenants">["unitId"]) : undefined,
        status: editForm.status,
        kraPin: orEmpty(editForm.kraPin),
        dateOfBirth: orEmpty(editForm.dateOfBirth),
        gender: orEmpty(editForm.gender),
        occupation: orEmpty(editForm.occupation),
        employer: orEmpty(editForm.employer),
        emergencyContactName: orEmpty(editForm.emergencyContactName),
        emergencyContactPhone: orEmpty(editForm.emergencyContactPhone),
        emergencyContactRelation: orEmpty(editForm.emergencyContactRelation),
        tenantAgreementUrl: orEmpty(editForm.tenantAgreementUrl),
      })
      toast.success("Tenant updated")
      setEditing(null)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update tenant")
    } finally {
      setEditSaving(false)
    }
  }

  // Upload an agreement file (pdf/docx/...) → store its URL on the form.
  const agreementInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAgreement, setUploadingAgreement] = useState(false)
  const handleAgreementFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAgreement(true)
    try {
      const url = await genAgreementUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!res.ok) throw new Error("Upload failed")
      const { storageId } = await res.json()
      if (editing) {
        const { url: fileUrl } = await setAgreement({ id: editing._id, storageId })
        setEditForm((p) => ({ ...p, tenantAgreementUrl: fileUrl }))
      }
      toast.success("Agreement uploaded")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to upload agreement")
    } finally {
      setUploadingAgreement(false)
      if (agreementInputRef.current) agreementInputRef.current.value = ""
    }
  }

  const loading = tenants === undefined || buildings === undefined

  const filteredTenants = (tenants ?? []).filter((t) => {
    if (selectedBuilding !== "all" && t.buildingId !== selectedBuilding) return false
    const q = nameQuery.trim().toLowerCase()
    if (q && !t.fullName.toLowerCase().includes(q) && !t.phone.includes(q)) return false
    const inArrears = (t.arrears ?? 0) > 0
    if (arrearsFilter === "arrears" && !inArrears) return false
    if (arrearsFilter === "clear" && inArrears) return false
    return true
  })

  const allSelected = filteredTenants.length > 0 && filteredTenants.every((t) => selected.has(t._id))
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filteredTenants.map((t) => t._id)))

  const resetForm = () =>
    setForm({
      fullName: "",
      phone: "",
      email: "",
      buildingId: "",
      unitNumber: "",
      unitType: "1br",
      rentAmount: "",
      depositAmount: "",
      billingDay: "1",
      arrearsBroughtForward: "",
    })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.fullName) return toast.error("Full name is required")
    if (!form.phone) return toast.error("M-Pesa phone is required")
    if (!form.buildingId) return toast.error("Pick a building")
    if (!form.unitNumber) return toast.error("Name the unit (e.g. A12)")
    if (!form.rentAmount) return toast.error("Monthly rent is required")
    setSaving(true)
    try {
      await createWithUnit({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || undefined,
        buildingId: form.buildingId as any,
        unitNumber: form.unitNumber,
        unitType: form.unitType,
        rentAmount: Number(form.rentAmount),
        depositAmount: form.depositAmount ? Number(form.depositAmount) : undefined,
        billingDay: Number(form.billingDay) || 1,
        arrearsBroughtForward: form.arrearsBroughtForward
          ? Number(form.arrearsBroughtForward)
          : undefined,
      })
      toast.success("Tenant added and unit assigned")
      setShowAddModal(false)
      resetForm()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add tenant")
    } finally {
      setSaving(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "inactive":
        return "bg-muted text-foreground"
      case "terminated":
        return "bg-red-100 text-red-800"
      default:
        return "bg-muted text-foreground"
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Tenants</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-secondary rounded w-3/4"></div>
                <div className="h-3 bg-secondary rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-secondary rounded"></div>
                  <div className="h-3 bg-secondary rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tenants</h1>
          <p className="text-muted-foreground">Manage your tenants and track their information</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search name or phone"
            className="w-full sm:w-[220px]"
          />
          <Select value={arrearsFilter} onValueChange={(v) => setArrearsFilter(v as typeof arrearsFilter)}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Arrears" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All arrears status</SelectItem>
              <SelectItem value="arrears">In arrears</SelectItem>
              <SelectItem value="clear">No arrears</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by building" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buildings</SelectItem>
              {(buildings ?? []).map((building) => (
                <SelectItem key={building._id} value={building._id}>
                  {building.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link href="/import">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Link>
          </Button>
          {!selectMode && (tenants ?? []).length > 0 && (
            <Button variant="outline" onClick={() => setSelectMode(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete tenants
            </Button>
          )}
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tenant
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <DuplicateTenantsBanner />
      </div>

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            Select all ({filteredTenants.length})
            <span className="ml-2 font-normal text-muted-foreground">{selected.size} selected</span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={exitSelectMode}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete selected ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {filteredTenants.length === 0 ? (
        <EmptyState
          icon={User}
          title={(tenants ?? []).length === 0 ? "No tenants yet" : "No tenants match your filters"}
          description={
            (tenants ?? []).length === 0
              ? "Start by adding your first tenant. Their M-Pesa phone is the key that auto-matches payments."
              : "No tenants found. Try clearing the search, arrears, or building filters."
          }
          action={
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {(tenants ?? []).length === 0 ? "Add Your First Tenant" : "Add Tenant"}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTenants.map((tenant) => {
            const unit = tenant.unitId ? (units ?? []).find((u) => u._id === tenant.unitId) : undefined
            const building = (buildings ?? []).find(
              (b) => b._id === (tenant.buildingId ?? unit?.buildingId),
            )
            const unitLabel = unit
              ? `${building ? building.name + " · " : ""}Unit ${unit.unitNumber} · ${unitTypeLabel(unit)}`
              : building
                ? building.name
                : "No unit"
            return (
            <Card key={tenant._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-2">
                    {selectMode && (
                      <Checkbox
                        className="mt-1.5"
                        checked={selected.has(tenant._id)}
                        onCheckedChange={() => toggleSelected(tenant._id)}
                        aria-label={`Select ${tenant.fullName}`}
                      />
                    )}
                    <div>
                      <CardTitle className="text-lg">{tenant.fullName}</CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {unitLabel}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={getStatusColor(tenant.status)}>{tenant.status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Edit tenant"
                      onClick={() => openEdit(tenant)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {tenant.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">{tenant.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span>{tenant.phone}</span>
                  </div>
                  {(tenant.occupation || tenant.employer) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-3 w-3" />
                      <span className="truncate">
                        {[tenant.occupation, tenant.employer].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                  {(tenant.arrears ?? 0) > 0 ? (
                    <div className="flex items-center gap-2 font-medium text-red-600">
                      <DollarSign className="h-3 w-3" />
                      <span>Arrears: KES {Math.round(tenant.arrears).toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <DollarSign className="h-3 w-3" />
                      <span>No arrears</span>
                    </div>
                  )}
                  {tenant.tenantAgreementUrl && (
                    <a
                      href={tenant.tenantAgreementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary underline"
                    >
                      <FileText className="h-3 w-3" /> Tenancy agreement
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={(o) => { setShowAddModal(o); if (!o) resetForm() }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>
              Name the unit as you add the tenant — Swyft creates the unit, lease and starts billing.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">M-Pesa Phone *</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0712345678"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="for receipts"
                />
              </div>
            </div>

            {/* Building + named unit (the merged unit-onboarding step). */}
            <div className="rounded-md border p-4 space-y-4">
              <div className="text-sm font-medium flex items-center gap-2">
                <Building className="h-4 w-4" /> Unit
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Building *</Label>
                  <Select value={form.buildingId} onValueChange={(v) => setForm({ ...form, buildingId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select building" /></SelectTrigger>
                    <SelectContent>
                      {(buildings ?? []).map((b) => (
                        <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitNumber">Unit number *</Label>
                  <Input id="unitNumber" value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="A12" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.unitType} onValueChange={(v) => setForm({ ...form, unitType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bedsitter">Bedsitter</SelectItem>
                      <SelectItem value="studio">Studio</SelectItem>
                      <SelectItem value="1br">1 Bedroom</SelectItem>
                      <SelectItem value="2br">2 Bedroom</SelectItem>
                      <SelectItem value="3br">3 Bedroom</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rent">Rent (KES) *</Label>
                  <Input id="rent" type="number" min="0" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} placeholder="15000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit">Deposit (KES)</Label>
                  <Input id="deposit" type="number" min="0" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="15000" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="billingDay">Billing day (1–28)</Label>
                  <Input id="billingDay" type="number" min="1" max="28" value={form.billingDay} onChange={(e) => setForm({ ...form, billingDay: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrears">Arrears b/f (KES)</Label>
                  <Input id="arrears" type="number" min="0" value={form.arrearsBroughtForward} onChange={(e) => setForm({ ...form, arrearsBroughtForward: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Tenant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update details or reassign the tenant to a different building and unit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Full Name *</Label>
              <Input
                id="edit-fullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">M-Pesa Phone *</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
            </div>

            {/* Reassign building + unit (details auto-fill). */}
            <BuildingUnitPicker
              buildingId={editForm.buildingId}
              unitId={editForm.unitId}
              onBuildingChange={(v) => setEditForm((p) => ({ ...p, buildingId: v }))}
              onUnitChange={(v) => setEditForm((p) => ({ ...p, unitId: v }))}
            />

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as TenantStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Extended profile */}
            <div className="rounded-md border p-4 space-y-4">
              <div className="text-sm font-medium">Profile details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="kraPin">KRA PIN</Label>
                  <Input id="kraPin" value={editForm.kraPin} onChange={(e) => setEditForm((p) => ({ ...p, kraPin: e.target.value }))} placeholder="A012345678Z" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of birth</Label>
                  <Input id="dob" type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={editForm.gender || undefined} onValueChange={(v) => setEditForm((p) => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="occupation">Occupation</Label>
                  <Input id="occupation" value={editForm.occupation} onChange={(e) => setEditForm((p) => ({ ...p, occupation: e.target.value }))} placeholder="e.g. Teacher" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="employer">Employer</Label>
                  <Input id="employer" value={editForm.employer} onChange={(e) => setEditForm((p) => ({ ...p, employer: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Emergency contact */}
            <div className="rounded-md border p-4 space-y-4">
              <div className="text-sm font-medium">Emergency contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ecName">Name</Label>
                  <Input id="ecName" value={editForm.emergencyContactName} onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ecPhone">Phone</Label>
                  <Input id="ecPhone" value={editForm.emergencyContactPhone} onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactPhone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ecRel">Relationship</Label>
                  <Input id="ecRel" value={editForm.emergencyContactRelation} onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactRelation: e.target.value }))} placeholder="e.g. Spouse" />
                </div>
              </div>
            </div>

            {/* Tenancy agreement */}
            <div className="space-y-2">
              <Label htmlFor="agreement">Tenancy agreement</Label>
              <Input
                id="agreement"
                value={editForm.tenantAgreementUrl}
                onChange={(e) => setEditForm((p) => ({ ...p, tenantAgreementUrl: e.target.value }))}
                placeholder="Paste a link, or upload a file →"
              />
              <input
                ref={agreementInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleAgreementFile}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingAgreement || !editing}
                  onClick={() => agreementInputRef.current?.click()}
                >
                  {uploadingAgreement ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload file (PDF/DOCX)
                </Button>
                {editForm.tenantAgreementUrl && (
                  <a href={editForm.tenantAgreementUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                    View current
                  </a>
                )}
              </div>
            </div>

            {/* All agreements on file (new table) — retrieve / add on demand. */}
            {editing && <TenantAgreements tenantId={editing._id} />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm bulk delete */}
      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Are you sure you want to delete {selected.size === 1 ? "this tenant" : `these ${selected.size} tenants`}?
            </DialogTitle>
            <DialogDescription>
              It&apos;s not reversible. This permanently removes{" "}
              {selected.size === 1 ? "the tenant" : "the tenants"} along with their leases, invoices and
              any arrears, and frees their units.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
