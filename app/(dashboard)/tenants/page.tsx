"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Plus, User, Building, Phone, Mail, DollarSign, Loader2, Pencil, Upload } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BuildingUnitPicker } from "@/components/building-unit-picker"
import type { Doc } from "@/convex/_generated/dataModel"
import { toast } from "sonner"

type TenantStatus = Doc<"tenants">["status"]

export default function TenantsPage() {
  const tenants = useQuery(api.tenants.list)
  const buildings = useQuery(api.buildings.list)
  const units = useQuery(api.units.listForCompany)
  const createWithUnit = useMutation(api.tenants.createWithUnit)
  const updateTenant = useMutation(api.tenants.update)
  const importCsv = useAction(api.smartImport.importTenantsCsv)

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const res = await importCsv({ csvText: text })
      toast.success(`Imported ${res.created} tenant(s)${res.skipped ? `, skipped ${res.skipped}` : ""}`)
      if (res.errors.length) toast.error(`${res.errors.length} row(s) had issues`)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to import CSV")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
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
      await updateTenant({
        id: editing._id,
        fullName: editForm.fullName,
        phone: editForm.phone,
        email: editForm.email || undefined,
        buildingId: editForm.buildingId ? (editForm.buildingId as Doc<"tenants">["buildingId"]) : undefined,
        unitId: editForm.unitId ? (editForm.unitId as Doc<"tenants">["unitId"]) : undefined,
        status: editForm.status,
      })
      toast.success("Tenant updated")
      setEditing(null)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update tenant")
    } finally {
      setEditSaving(false)
    }
  }

  const loading = tenants === undefined || buildings === undefined

  const filteredTenants = (tenants ?? []).filter((t) =>
    selectedBuilding === "all" ? true : t.buildingId === selectedBuilding,
  )

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
        return "bg-gray-100 text-gray-800"
      case "terminated":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
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
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
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
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-[200px]">
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={handleCsvFile}
          />
          <Button variant="outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import CSV
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tenant
          </Button>
        </div>
      </div>

      {filteredTenants.length === 0 ? (
        <EmptyState
          icon={User}
          title={(tenants ?? []).length === 0 ? "No tenants yet" : "No tenants in selected building"}
          description={
            (tenants ?? []).length === 0
              ? "Start by adding your first tenant. Their M-Pesa phone is the key that auto-matches payments."
              : "No tenants found for the selected building filter."
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
          {filteredTenants.map((tenant) => (
            <Card key={tenant._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{tenant.fullName}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {tenant.unitId ? "Unit assigned" : "No unit"}
                    </CardDescription>
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
                  {!!tenant.arrearsBroughtForward && tenant.arrearsBroughtForward > 0 && (
                    <div className="flex items-center gap-2 text-red-600">
                      <DollarSign className="h-3 w-3" />
                      <span>Arrears b/f: KES {tenant.arrearsBroughtForward.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
    </div>
  )
}
