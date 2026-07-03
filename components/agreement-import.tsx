"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Upload, FileText, Loader2, Trash2, CheckCircle2, Download } from "lucide-react"
import { toast } from "sonner"

/**
 * Bulk agreement migration. Upload many signed-agreement PDFs at once; we match
 * each to a tenant by the phone number in its filename. Unmatched files are
 * parked below for manual assignment — nothing is dropped.
 */
export function AgreementImport() {
  const generateUploadUrl = useMutation(api.agreements.generateUploadUrl)
  const bulkMatch = useMutation(api.agreementImport.bulkMatch)
  const pending = useQuery(api.agreementImport.listPending)

  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<{ matched: number; parked: number } | null>(null)

  const handleUpload = async () => {
    if (files.length === 0) return
    setBusy(true)
    setLast(null)
    try {
      const uploaded: { storageId: Id<"_storage">; fileName: string }[] = []
      for (const file of files) {
        const url = await generateUploadUrl()
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        })
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`)
        const { storageId } = await res.json()
        uploaded.push({ storageId, fileName: file.name })
      }
      const result = await bulkMatch({ files: uploaded })
      setLast(result)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ""
      toast.success(`${result.matched} matched · ${result.parked} need a tenant`)
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  const parkedRows = pending ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Tenant agreements
          </CardTitle>
          <CardDescription>
            Upload your signed tenancy agreements (PDF/DOCX) in bulk. We match each file to
            a tenant by the <strong>phone number in the filename</strong> (e.g.{" "}
            <code>0712345678.pdf</code> or <code>JohnDoe_0712345678.pdf</code>). Anything we
            can&apos;t match is kept below for you to assign — nothing is lost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <p className="mb-2 text-sm text-muted-foreground">
              {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose agreement files"}
            </p>
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              {files.length > 0 ? "Change files" : "Select files"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>
          <Button onClick={handleUpload} disabled={files.length === 0 || busy} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload &amp; match {files.length > 0 ? `(${files.length})` : ""}
          </Button>
          {last && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {last.matched} matched to tenants
              {last.parked > 0 ? ` · ${last.parked} parked below for assignment` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {parkedRows.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-base">
              Needs a tenant ({parkedRows.length})
            </CardTitle>
            <CardDescription>
              We couldn&apos;t find a tenant for these by filename. Pick the right tenant for
              each, or discard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Read</TableHead>
                    <TableHead className="w-[260px]">Assign to tenant</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parkedRows.map((p) => (
                    <PendingRow key={p._id} pending={p} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PendingRow({
  pending,
}: {
  pending: {
    _id: Id<"pendingAgreements">
    fileName: string
    guessedPhone?: string
    url: string | null
  }
}) {
  const tenants = useQuery(api.tenants.list) ?? []
  const resolve = useMutation(api.agreementImport.resolvePending)
  const remove = useMutation(api.agreementImport.removePending)
  const [busy, setBusy] = useState(false)

  const assign = async (tenantId: string) => {
    setBusy(true)
    try {
      await resolve({ pendingId: pending._id, tenantId: tenantId as Id<"tenants"> })
      toast.success("Agreement assigned")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to assign")
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    setBusy(true)
    try {
      await remove({ pendingId: pending._id })
      toast.success("Discarded")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to discard")
      setBusy(false)
    }
  }

  return (
    <TableRow>
      <TableCell className="max-w-[220px] truncate font-medium">
        {pending.url ? (
          <a href={pending.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
            <Download className="h-3 w-3" /> {pending.fileName}
          </a>
        ) : (
          pending.fileName
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {pending.guessedPhone ? <Badge variant="outline">{pending.guessedPhone}</Badge> : "no phone in name"}
      </TableCell>
      <TableCell>
        <Select disabled={busy} onValueChange={assign}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Pick a tenant…" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.fullName} · {t.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={discard} aria-label="Discard">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
