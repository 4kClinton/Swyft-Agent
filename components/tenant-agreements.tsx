"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FileText, Upload, Loader2, Trash2, Download } from "lucide-react"
import { toast } from "sonner"

/**
 * Lists a tenant's signed agreements (newest first) with download links, and
 * lets the user add another. Backed by the first-class `agreements` table, with
 * a fallback to the legacy `tenants.tenantAgreementUrl` for un-migrated tenants.
 */
export function TenantAgreements({ tenantId }: { tenantId: Id<"tenants"> }) {
  const agreements = useQuery(api.agreements.listForTenant, { tenantId })
  const generateUploadUrl = useMutation(api.agreements.generateUploadUrl)
  const createAgreement = useMutation(api.agreements.create)
  const removeAgreement = useMutation(api.agreements.remove)

  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) throw new Error("Upload failed")
      const { storageId } = await res.json()
      await createAgreement({ tenantId, storageId, fileName: file.name, kind: "tenancy" })
      toast.success("Agreement added")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add agreement")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleRemove = async (id: Id<"agreements">) => {
    try {
      await removeAgreement({ id })
      toast.success("Agreement removed")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove")
    }
  }

  const rows = agreements ?? []

  return (
    <div className="space-y-2">
      <Label>Agreements</Label>
      <div className="space-y-2">
        {agreements === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agreements on file yet.</p>
        ) : (
          rows.map((a, i) => (
            <div
              key={a._id ?? `legacy-${i}`}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {a.fileName ?? `${a.kind} agreement`}
                  {a.signedAt ? ` · signed ${new Date(a.signedAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.url && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={a.url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {a._id && (
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(a._id as Id<"agreements">)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Add agreement (PDF/DOCX)
      </Button>
    </div>
  )
}
