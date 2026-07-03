"use client"

import { useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useAuth } from "@/components/auth-provider"
import { AgreementImport } from "@/components/agreement-import"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Building2,
  Users,
  Home,
  Plus,
  Trash2,
  Info,
  User,
  FileText,
  ArrowRight,
  Megaphone,
} from "lucide-react"
import { toast } from "sonner"

type ImportRow = Doc<"importRows">
type Entity = ImportRow["entityType"]
type TypedEntity = "landlord" | "building" | "tenant"

const ENTITY_ORDER: Entity[] = ["landlord", "building", "unit", "tenant", "lease"]
const ENTITY_LABEL: Record<Entity, string> = {
  landlord: "Landlords",
  building: "Buildings",
  unit: "Units",
  tenant: "Tenants",
  lease: "Leases",
  unknown: "Unrecognised",
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  parsing: { label: "Parsing…", className: "bg-blue-100 text-blue-800" },
  parsed: { label: "Ready to review", className: "bg-amber-100 text-amber-800" },
  partially_committed: { label: "Partly imported", className: "bg-orange-100 text-orange-800" },
  committed: { label: "Imported", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
}

function rowTitle(row: ImportRow): string {
  const d = (row.data ?? {}) as Record<string, unknown>
  const k = row.naturalKeys ?? {}
  switch (row.entityType) {
    case "landlord":
      return String(d.name ?? "—")
    case "building":
      return String(d.name ?? k.buildingName ?? "—")
    case "unit":
      return `${k.buildingName ?? "?"} · Unit ${k.unitNumber ?? "?"}`
    case "tenant":
      return String(d.fullName ?? k.tenantPhone ?? "—")
    case "lease":
      return `${k.tenantPhone ?? "?"} · Unit ${k.unitNumber ?? "?"}`
    default:
      return "Unrecognised row"
  }
}

function rowDetail(row: ImportRow): string {
  const d = (row.data ?? {}) as Record<string, unknown>
  const k = row.naturalKeys ?? {}
  const bits: string[] = []
  if (row.entityType === "tenant") {
    bits.push(k.buildingName ? String(k.buildingName) : "No building")
    if (k.tenantPhone) bits.push(String(k.tenantPhone))
    if (k.unitNumber) bits.push(`Unit ${k.unitNumber}`)
    if (typeof d.arrearsBroughtForward === "number")
      bits.push(`Arrears KES ${d.arrearsBroughtForward.toLocaleString()}`)
  } else if (row.entityType === "unit" || row.entityType === "lease") {
    if (typeof d.rentAmount === "number") bits.push(`Rent KES ${d.rentAmount.toLocaleString()}`)
  } else if (row.entityType === "building") {
    if (d.city) bits.push(String(d.city))
    if (typeof d.totalUnits === "number") bits.push(`${d.totalUnits} units`)
  }
  const extraCount = Object.keys((row.extra ?? {}) as object).length
  if (extraCount > 0) bits.push(`+${extraCount} extra column${extraCount === 1 ? "" : "s"}`)
  return bits.join(" · ")
}

// ===========================================================================
// Top level: a GUIDED RELATIONAL STEPPER. The data is relational
// (landlords → buildings → tenants → vacant units → agreements), so we walk the
// user through it in dependency order. This only GUIDES the order — every
// uploader still parks-and-resolves out-of-order rows underneath, so nothing is
// ever forced or lost. See [[never-lose-import-data]] / [[pm-landlord-layer]].
// ===========================================================================
type StepId = "landlord" | "building" | "tenant" | "vacant" | "agreement"

const STEP_META: Record<StepId, { label: string; icon: typeof Building2; hint: string }> = {
  landlord: { label: "Landlords", icon: User, hint: "Who owns the buildings" },
  building: { label: "Buildings", icon: Building2, hint: "Properties & unit mix" },
  tenant: { label: "Tenants", icon: Users, hint: "Occupants & arrears" },
  vacant: { label: "Vacant units", icon: Home, hint: "Review & publish vacancies" },
  agreement: { label: "Agreements", icon: FileText, hint: "Signed tenancy PDFs" },
}

export function DataImport() {
  const { user } = useAuth()
  const isPropertyManager = user?.companyKind === "property_manager"
  const batches = useQuery(api.import.listBatches) ?? []
  const [activeBatchId, setActiveBatchId] = useState<Id<"importBatches"> | null>(null)

  // Landlords only apply to property-manager companies.
  const steps: StepId[] = isPropertyManager
    ? ["landlord", "building", "tenant", "vacant", "agreement"]
    : ["building", "tenant", "vacant", "agreement"]
  const [step, setStep] = useState<StepId>(steps[0])

  if (activeBatchId) {
    return <BatchView batchId={activeBatchId} onBack={() => setActiveBatchId(null)} />
  }

  const idx = steps.indexOf(step)
  const isLast = idx === steps.length - 1

  return (
    <div className="space-y-6">
      {/* Stepper header */}
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => {
          const Icon = STEP_META[s].icon
          const active = s === step
          const done = i < idx
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border bg-background text-muted-foreground hover:bg-muted")
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs">
                {done ? "✓" : i + 1}
              </span>
              <Icon className="h-4 w-4" />
              {STEP_META[s].label}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Step {idx + 1} of {steps.length} — {STEP_META[step].hint}. Import in this order for the
        cleanest links; anything out of order is kept safe and matched up later.
      </p>

      {/* Step content */}
      <div>
        {step === "landlord" && (
          <Uploader entity="landlord" onParsed={setActiveBatchId} />
        )}
        {step === "building" && <Uploader entity="building" onParsed={setActiveBatchId} />}
        {step === "tenant" && <Uploader entity="tenant" onParsed={setActiveBatchId} />}
        {step === "vacant" && <VacantUnitsEditor />}
        {step === "agreement" && <AgreementImport />}
      </div>

      {/* Step nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={idx === 0}
          onClick={() => setStep(steps[Math.max(idx - 1, 0)])}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {!isLast && (
          <Button size="sm" onClick={() => setStep(steps[Math.min(idx + 1, steps.length - 1)])}>
            Next: {STEP_META[steps[idx + 1]].label} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      <BatchList batches={batches} onOpen={setActiveBatchId} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typed uploader (one entity per upload — no type guessing needed)
// ---------------------------------------------------------------------------
const UPLOADER_COPY: Record<TypedEntity, { title: string; desc: string }> = {
  landlord: {
    title: "Import landlords",
    desc: "Upload your list of property owners (CSV or Excel) — name, phone, email, ID/KRA. Buildings you import next can reference their owner by name. We keep every column, even ones we can't map.",
  },
  building: {
    title: "Import buildings",
    desc: "Upload your list of buildings/properties (CSV or Excel). Include the building name, total number of units, address, and — if you have it — a rent or unit-mix column. We keep every column, even ones we can't map.",
  },
  tenant: {
    title: "Import tenants",
    desc: "Upload your tenants (CSV or Excel) — name, phone, the unit and building they occupy, rent, and any arrears. Tenants are matched to their building/unit and any outstanding balance is carried forward.",
  },
}

function Uploader({ entity, onParsed }: { entity: TypedEntity; onParsed: (id: Id<"importBatches">) => void }) {
  const generateUploadUrl = useMutation(api.import.generateUploadUrl)
  const parseUpload = useAction(api.importParse.parseUpload)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<"idle" | "uploading" | "mapping" | "questions" | "error">("idle")
  const [batchId, setBatchId] = useState<Id<"importBatches"> | null>(null)
  const [errMsg, setErrMsg] = useState("")
  const copy = UPLOADER_COPY[entity]
  const working = phase === "uploading" || phase === "mapping"

  const handleUpload = async () => {
    if (!file) return
    setBatchId(null)
    setErrMsg("")
    setPhase("uploading")
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!res.ok) throw new Error("File upload failed")
      const { storageId } = await res.json()

      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheets = wb.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
          defval: "",
          raw: false,
        })
        const headers = rows.length ? Object.keys(rows[0]) : []
        return { sheetName: name, headers, rows }
      }).filter((s) => s.rows.length > 0)

      if (sheets.length === 0) {
        setErrMsg("That file has no rows we can read.")
        setPhase("error")
        return
      }

      setPhase("mapping")
      const result = await parseUpload({
        rawStorageId: storageId as Id<"_storage">,
        fileName: file.name,
        entityType: entity,
        sheets,
      })
      setFile(null)
      setBatchId(result.batchId)
      setPhase("questions")
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Import failed")
      setPhase("error")
    }
  }

  const goReview = () => {
    const id = batchId
    setPhase("idle")
    if (id) onParsed(id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" /> {copy.title}
        </CardTitle>
        <CardDescription>{copy.desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
          <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="mb-2 text-sm text-muted-foreground">{file ? file.name : "Choose a CSV or Excel file"}</p>
          <Button
            variant="outline"
            onClick={() => document.getElementById(`import-file-${entity}`)?.click()}
            disabled={working}
          >
            {file ? "Change file" : "Select file"}
          </Button>
          <input
            id={`import-file-${entity}`}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button onClick={handleUpload} disabled={!file || working} className="w-full">
          <Upload className="mr-2 h-4 w-4" /> Upload &amp; map
        </Button>
      </CardContent>

      {/* Loading + AI-questions modal */}
      <Dialog
        open={phase !== "idle"}
        onOpenChange={(o) => {
          if (o || working) return // can't dismiss while processing
          goReview() // closing after questions/error proceeds to review (batch is saved)
        }}
      >
        <DialogContent
          onInteractOutside={(e) => working && e.preventDefault()}
          onEscapeKeyDown={(e) => working && e.preventDefault()}
        >
          {working && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {phase === "uploading" ? "Uploading your file…" : "Mapping your columns with AI…"}
                </DialogTitle>
                <DialogDescription>
                  {phase === "uploading"
                    ? "Securely storing the original — nothing is lost."
                    : "Matching your spreadsheet to Swyft. This can take a few seconds."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-8">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" /> Import failed
                </DialogTitle>
                <DialogDescription>{errMsg}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPhase("idle")}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === "questions" && batchId && (
            <ImportQuestions batchId={batchId} onReview={goReview} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// Loading-then-questions content shown in the upload modal: surfaces the AI's
// clarifying questions (which building?) right after mapping.
function ImportQuestions({
  batchId,
  onReview,
}: {
  batchId: Id<"importBatches">
  onReview: () => void
}) {
  const unresolved = useQuery(api.import.unresolvedBuildings, { batchId })
  const unmapped = useQuery(api.import.unmappedColumns, { batchId })
  const data = useQuery(api.import.batch, { batchId })
  const resolve = useMutation(api.import.resolveBuildingRef)
  const [busyName, setBusyName] = useState<string | null>(null)
  const loading = unresolved === undefined || data === undefined
  const batch = data?.batch

  const choose = async (name: string, value: string) => {
    setBusyName(name)
    try {
      await resolve(
        value === "__create__"
          ? { batchId, fromName: name, target: { type: "create" } }
          : { batchId, fromName: name, target: { type: "existing", buildingId: value as Id<"buildings"> } },
      )
      toast.success(`Linked "${name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link")
    } finally {
      setBusyName(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Mapped your file
        </DialogTitle>
        <DialogDescription>
          {batch
            ? `${batch.rowCount} rows mapped${batch.parkedCount > 0 ? ` · ${batch.parkedCount} need attention` : ""}.`
            : "Reviewing…"}
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your buildings…
        </div>
      ) : unresolved!.unmatched.length > 0 || unresolved!.missingCount > 0 ? (
        <div className="space-y-3">
          {unresolved!.missingCount > 0 && (
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {unresolved!.missingCount} row{unresolved!.missingCount === 1 ? "" : "s"} have no building
              </div>
              <p className="text-xs text-muted-foreground">Which building do these belong to?</p>
              <Select disabled={busyName === ""} onValueChange={(v) => choose("", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign a building…" />
                </SelectTrigger>
                <SelectContent>
                  {unresolved!.existing.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {unresolved!.unmatched.length > 0 && (
            <p className="text-sm">
              Some rows reference buildings you don&apos;t have yet. Which building is each one?
            </p>
          )}
          {unresolved!.unmatched.map((u) => (
            <div key={u.name} className="space-y-1">
              <div className="text-sm font-medium">
                “{u.name}” <span className="text-muted-foreground">· {u.rowCount} row{u.rowCount === 1 ? "" : "s"}</span>
              </div>
              <Select disabled={busyName === u.name} onValueChange={(v) => choose(u.name, v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a building…" />
                </SelectTrigger>
                <SelectContent>
                  {unresolved!.existing.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__create__">➕ Create “{u.name}”</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Everything matched your buildings cleanly.
        </div>
      )}

      {unmapped && unmapped.length > 0 && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {unmapped.length} column{unmapped.length === 1 ? "" : "s"} had no Swyft field (
            {unmapped.slice(0, 6).map((u) => u.column).join(", ")}
            {unmapped.length > 6 ? "…" : ""}) — kept on each record&apos;s notes.
          </span>
        </p>
      )}

      <DialogFooter>
        <Button onClick={onReview}>Review &amp; import</Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// History list (all imports, shared)
// ---------------------------------------------------------------------------
function BatchList({
  batches,
  onOpen,
}: {
  batches: Doc<"importBatches">[]
  onOpen: (id: Id<"importBatches">) => void
}) {
  const deleteBatch = useMutation(api.import.deleteBatch)
  const [confirmId, setConfirmId] = useState<Id<"importBatches"> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const confirmBatch = batches.find((b) => b._id === confirmId)

  const handleDelete = async () => {
    if (!confirmId) return
    setDeleting(true)
    try {
      await deleteBatch({ batchId: confirmId })
      toast.success("Upload deleted")
      setConfirmId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete")
    } finally {
      setDeleting(false)
    }
  }

  if (batches.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your imports</CardTitle>
        <CardDescription>Every upload is kept here, including anything still needing attention.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {batches.map((b) => {
          const s = STATUS_BADGE[b.status] ?? { label: b.status, className: "bg-muted text-foreground" }
          return (
            <div
              key={b._id}
              className="flex items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted/40"
            >
              <button onClick={() => onOpen(b._id)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{b.fileName ?? "Imported file"}</div>
                <div className="text-xs text-muted-foreground">
                  {b.rowCount} rows · {b.committedCount} imported
                  {b.parkedCount > 0 && ` · ${b.parkedCount} need attention`}
                </div>
              </button>
              <div className="flex items-center gap-2">
                <Badge className={s.className}>{s.label}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Delete upload"
                  onClick={() => setConfirmId(b._id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>

      <Dialog open={confirmId !== null} onOpenChange={(o) => !deleting && !o && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this upload?</DialogTitle>
            <DialogDescription>
              Removes “{confirmBatch?.fileName ?? "this file"}”, its original file and all its
              staged rows. Records you already imported into your buildings/tenants stay. This can&apos;t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Single batch: preview (ready) + needs-attention (parked)
// ---------------------------------------------------------------------------
function BatchView({ batchId, onBack }: { batchId: Id<"importBatches">; onBack: () => void }) {
  const data = useQuery(api.import.batch, { batchId })
  const unresolved = useQuery(api.import.unresolvedBuildings, { batchId })
  const unmapped = useQuery(api.import.unmappedColumns, { batchId })
  const setRowIncluded = useMutation(api.import.setRowIncluded)
  const commitBatch = useMutation(api.import.commitBatch)
  const reparseBatch = useAction(api.importParse.reparseBatch)
  const [busy, setBusy] = useState<"commit" | "reparse" | null>(null)
  const [skippedTenants, setSkippedTenants] = useState<
    Array<{ name: string; phone: string; building: string | null }> | null
  >(null)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const ready = rows.filter((r) => r.rowState === "ready")
  const parked = rows.filter((r) => r.rowState === "parked")
  const committed = rows.filter((r) => r.rowState === "committed")
  const includedCount = ready.filter((r) => r.include).length

  const readyByEntity = useMemo(() => {
    const map = new Map<Entity, ImportRow[]>()
    for (const r of ready) {
      const list = map.get(r.entityType) ?? []
      list.push(r)
      map.set(r.entityType, list)
    }
    return ENTITY_ORDER.filter((e) => map.has(e)).map((e) => [e, map.get(e)!] as const)
  }, [ready])

  const parkedBySheet = useMemo(() => {
    const map = new Map<string, ImportRow[]>()
    for (const r of parked) {
      const key = r.sheetName ?? "(file)"
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [parked])

  const handleCommit = async () => {
    setBusy("commit")
    try {
      const { created, skipped, parked: p, skippedTenants: skipped_ } = await commitBatch({ batchId })
      const parts = [`Imported ${created} new record${created === 1 ? "" : "s"}`]
      if (skipped > 0) parts.push(`${skipped} already existed (skipped)`)
      if (p > 0) parts.push(`${p} need attention`)
      // When nothing new landed because the tenants already exist, show exactly
      // who — and in which building — so it's clear they can't be imported twice.
      if (skipped_.length > 0 && created === 0) {
        setSkippedTenants(skipped_)
      } else {
        toast.success(parts.join(" · "))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setBusy(null)
    }
  }

  const handleReparse = async (overrides?: { sheetName?: string; entityType: Entity }[]) => {
    setBusy("reparse")
    try {
      await reparseBatch({ batchId, overrides })
      toast.success("Re-parsed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-parse failed")
    } finally {
      setBusy(null)
    }
  }

  const status = data?.batch?.status
  const s = status ? STATUS_BADGE[status] : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to imports
        </Button>
        {s && <Badge className={s.className}>{s.label}</Badge>}
      </div>

      {unresolved && (unresolved.unmatched.length > 0 || unresolved.missingCount > 0) && (
        <BuildingClarify
          batchId={batchId}
          unmatched={unresolved.unmatched}
          missingCount={unresolved.missingCount}
          existing={unresolved.existing}
        />
      )}

      {unmapped && unmapped.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                {unmapped.length} column{unmapped.length === 1 ? "" : "s"} don&apos;t map to a Swyft field
              </p>
              <p className="text-blue-800">
                {unmapped.map((u) => u.column).join(", ")}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Nothing is lost — these are kept on each record&apos;s notes. Tell us if you want any of
                them as a proper field.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="truncate">{data?.batch?.fileName ?? "Imported file"}</CardTitle>
          <CardDescription>
            {ready.length} ready · {committed.length} imported
            {parked.length > 0 && ` · ${parked.length} need attention`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ready">
            <TabsList>
              <TabsTrigger value="ready">Ready to import ({ready.length})</TabsTrigger>
              <TabsTrigger value="attention">Needs attention ({parked.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="ready" className="space-y-6 pt-4">
              {ready.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {committed.length > 0 ? "Everything ready has been imported." : "Nothing ready to import."}
                </p>
              )}
              {readyByEntity.map(([entity, list]) => (
                <div key={entity} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {ENTITY_LABEL[entity]} ({list.length})
                  </h3>
                  <div className="overflow-hidden rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Record</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((r) => (
                          <TableRow key={r._id}>
                            <TableCell>
                              <Checkbox
                                checked={r.include}
                                onCheckedChange={(c) => setRowIncluded({ rowId: r._id, include: Boolean(c) })}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{rowTitle(r)}</TableCell>
                            <TableCell className="text-muted-foreground">{rowDetail(r)}</TableCell>
                            <TableCell>
                              {r.validation.message ? (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                  <AlertTriangle className="h-3 w-3" /> {r.validation.message}
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}

              {ready.length > 0 && (
                <Button onClick={handleCommit} disabled={busy !== null || includedCount === 0}>
                  {busy === "commit" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Import {includedCount} record{includedCount === 1 ? "" : "s"}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="attention" className="space-y-6 pt-4">
              {parked.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention. 🎉</p>}
              {parked.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  These rows are kept safe but not imported. Pick the right type for a sheet and re-map it,
                  or fix the source data and upload again — nothing here is lost.
                </p>
              )}
              {parkedBySheet.map(([sheet, list]) => (
                <ParkedSheet
                  key={sheet}
                  sheet={sheet}
                  rows={list}
                  busy={busy !== null}
                  onReparse={(entityType) =>
                    handleReparse([{ sheetName: sheet === "(file)" ? undefined : sheet, entityType }])
                  }
                />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={skippedTenants !== null} onOpenChange={(o) => !o && setSkippedTenants(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>These tenants already exist</DialogTitle>
            <DialogDescription>
              {skippedTenants?.length} tenant{skippedTenants?.length === 1 ? "" : "s"} in this file are
              already in your buildings (matched by phone number), so they weren&apos;t imported again.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
            {(skippedTenants ?? []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  {t.building ?? "No building"} · {t.phone}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            To re-import with different details, remove the existing tenant on the Tenants page first —
            duplicates there can be cleaned up with the &quot;Review &amp; remove&quot; banner.
          </p>
          <DialogFooter>
            <Button onClick={() => setSkippedTenants(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Clarifying question: "Which building is X?" — for referenced building names
// that don't match any the user has.
function BuildingClarify({
  batchId,
  unmatched,
  missingCount,
  existing,
}: {
  batchId: Id<"importBatches">
  unmatched: { name: string; rowCount: number }[]
  missingCount: number
  existing: { _id: Id<"buildings">; name: string }[]
}) {
  const resolve = useMutation(api.import.resolveBuildingRef)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const total = unmatched.length + (missingCount > 0 ? 1 : 0)

  const choose = async (name: string, value: string) => {
    setBusy(name)
    try {
      await resolve(
        value === "__create__"
          ? { batchId, fromName: name, target: { type: "create" } }
          : { batchId, fromName: name, target: { type: "existing", buildingId: value as Id<"buildings"> } },
      )
      toast.success(name ? `Linked "${name}"` : "Building assigned")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {missingCount > 0
              ? `Some rows have no building${unmatched.length > 0 ? `, and ${unmatched.length} don't match yours` : ""}. `
              : `${unmatched.length} building${unmatched.length === 1 ? "" : "s"} don't match yours. `}
            Tell us which building each is.
          </span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Resolve buildings ({total})
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Which building do these belong to?</DialogTitle>
              <DialogDescription>
                Pick one of your buildings for each, or create it. Rows update as you go.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {missingCount > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {missingCount} row{missingCount === 1 ? "" : "s"} with no building
                  </div>
                  <Select disabled={busy === ""} onValueChange={(v) => choose("", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assign a building…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existing.map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {unmatched.map((u) => (
                <div key={u.name} className="space-y-1">
                  <div className="text-sm font-medium">
                    “{u.name}” <span className="text-muted-foreground">· {u.rowCount} row{u.rowCount === 1 ? "" : "s"}</span>
                  </div>
                  <Select disabled={busy === u.name} onValueChange={(v) => choose(u.name, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a building…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existing.map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__create__">➕ Create “{u.name}”</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function ParkedSheet({
  sheet,
  rows,
  busy,
  onReparse,
}: {
  sheet: string
  rows: ImportRow[]
  busy: boolean
  onReparse: (entityType: Entity) => void
}) {
  const [forced, setForced] = useState<Entity | "">("")
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Sheet: {sheet} ({rows.length} row{rows.length === 1 ? "" : "s"})
        </h3>
        <div className="flex items-center gap-2">
          <Select value={forced} onValueChange={(v) => setForced(v as Entity)}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Treat as…" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_ORDER.map((e) => (
                <SelectItem key={e} value={e}>
                  {ENTITY_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={busy || !forced} onClick={() => forced && onReparse(forced)}>
            <RefreshCw className="mr-2 h-3 w-3" /> Re-map
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row (kept verbatim)</TableHead>
              <TableHead className="w-[260px]">Issue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="max-w-[420px] truncate font-mono text-xs">
                  {JSON.stringify(r.rawRow)}
                </TableCell>
                <TableCell className="text-xs text-amber-600">{r.validation.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ===========================================================================
// Derived vacant units — total units minus occupied; user edits & saves them
// ===========================================================================
function VacantUnitsEditor() {
  const units = useQuery(api.units.listForCompany)
  const buildings = useQuery(api.buildings.list)
  const loading = units === undefined || buildings === undefined

  const rows = useMemo(() => {
    if (!units || !buildings) return []
    return buildings.map((b) => {
      const buildingUnits = units.filter((u) => u.buildingId === b._id)
      const occupied = buildingUnits.filter((u) => u.status === "occupied").length
      const existingVacant = buildingUnits.filter((u) => u.status === "vacant")
      const mixTotal = (b.unitMix ?? []).reduce((s, m) => s + (m.count || 0), 0)
      const total = b.totalUnits ?? (mixTotal || buildingUnits.length)
      const suggest = Math.max(total - occupied - existingVacant.length, 0)
      return { building: b, occupied, total, existingVacant, suggest }
    })
  }, [units, buildings])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Import your buildings first — then we&apos;ll work out the vacant units for you here.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" /> Vacant units
          </CardTitle>
          <CardDescription>
            We worked these out from each building&apos;s total units minus the occupied ones (after your
            tenant import). Review and edit each suggested vacant unit, then save them — you can advertise
            them afterwards.
          </CardDescription>
        </CardHeader>
      </Card>
      {rows.map((r) => (
        <BuildingVacancyCard
          key={r.building._id}
          building={r.building}
          occupied={r.occupied}
          total={r.total}
          existingVacant={r.existingVacant}
          suggest={r.suggest}
        />
      ))}
    </div>
  )
}

type Draft = { unitNumber: string; unitType: string; rentAmount: string }

function BuildingVacancyCard({
  building,
  occupied,
  total,
  existingVacant,
  suggest,
}: {
  building: Doc<"buildings">
  occupied: number
  total: number
  existingVacant: Doc<"units">[]
  suggest: number
}) {
  const createUnit = useMutation(api.units.create)
  const publishVacancies = useAction(api.marketplace.publishBuildingVacancies)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Push this building's NET vacancies to swyft-customer. The action enforces the
  // rules: only net-of-occupancy vacant types publish; types without a recorded
  // video are queued for a Swyft field shoot (never blocked). See
  // [[validated-vacancy-publish]].
  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await publishVacancies({ buildingId: building._id })
      const parts: string[] = []
      if (res.published > 0) parts.push(`${res.published} published`)
      if (res.queued > 0) parts.push(`${res.queued} queued for Swyft recording`)
      if (res.failed > 0) parts.push(`${res.failed} failed`)
      toast.success(
        parts.length ? `${building.name}: ${parts.join(" · ")}` : `${building.name}: nothing to publish`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  // Seed editable drafts from the building's unit-mix (type + indicative rent),
  // one row per still-unmaterialised vacant slot.
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const pool: { type: string; rent?: number }[] = []
    for (const m of building.unitMix ?? []) {
      for (let i = 0; i < (m.count || 0); i++) pool.push({ type: m.type, rent: m.rent })
    }
    return Array.from({ length: suggest }, (_, i) => {
      const p = pool[i]
      return {
        unitNumber: `Unit ${occupied + existingVacant.length + i + 1}`,
        unitType: p?.type ?? "",
        rentAmount: p?.rent != null ? String(p.rent) : "",
      }
    })
  })

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const addDraft = () => setDrafts((d) => [...d, { unitNumber: "", unitType: "", rentAmount: "" }])
  const removeDraft = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    const valid = drafts.filter((d) => d.unitNumber.trim())
    if (valid.length === 0) {
      toast.error("Add at least one unit number")
      return
    }
    setBusy(true)
    try {
      let saved = 0
      for (const d of valid) {
        await createUnit({
          buildingId: building._id,
          unitNumber: d.unitNumber.trim(),
          unitType: d.unitType.trim() || undefined,
          rentAmount: Number(d.rentAmount) || 0,
          status: "vacant",
        })
        saved++
      }
      toast.success(`Saved ${saved} vacant unit${saved === 1 ? "" : "s"} in ${building.name}`)
      setDrafts([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {building.name}
          </span>
          <Badge variant="secondary">
            {Math.max(total - occupied, 0)} vacant of {total}
          </Badge>
        </CardTitle>
        <CardDescription>
          {occupied} occupied · {existingVacant.length} vacant unit{existingVacant.length === 1 ? "" : "s"} already saved
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {existingVacant.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Publish this building&apos;s net vacancies to Swyft. Occupied units are excluded;
              types without a video are queued for a Swyft recording.
            </p>
            <Button size="sm" variant="outline" onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              Publish to Swyft
            </Button>
          </div>
        )}
        {existingVacant.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {existingVacant.map((u) => (
              <Badge key={u._id} variant="outline">
                {u.unitNumber}
                {u.unitType ? ` · ${u.unitType}` : ""} · KES {u.rentAmount.toLocaleString()}
              </Badge>
            ))}
          </div>
        )}

        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No vacant units to create here.{" "}
            <button
              className="underline"
              onClick={() => {
                addDraft()
                setExpanded(true)
              }}
            >
              Add one anyway
            </button>
          </p>
        ) : !expanded ? (
          // Collapsed by default — don't dump a huge list of inputs on the page.
          <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
            Review &amp; create {drafts.length} vacant unit{drafts.length === 1 ? "" : "s"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                <span>Unit number</span>
                <span>Type</span>
                <span>Rent (KES)</span>
                <span></span>
              </div>
              {drafts.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                  <Input
                    value={d.unitNumber}
                    onChange={(e) => setDraft(i, { unitNumber: e.target.value })}
                    placeholder="e.g. B4"
                  />
                  <Input
                    value={d.unitType}
                    onChange={(e) => setDraft(i, { unitType: e.target.value })}
                    placeholder="e.g. 1br"
                  />
                  <Input
                    type="number"
                    value={d.rentAmount}
                    onChange={(e) => setDraft(i, { rentAmount: e.target.value })}
                    placeholder="25000"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeDraft(i)} aria-label="Remove">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addDraft} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" /> Add unit
              </Button>
              <Button size="sm" onClick={handleSave} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Save vacant units
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} disabled={busy}>
                Collapse
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
