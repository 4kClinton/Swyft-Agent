"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

const passwordReasonMessage: Record<string, string> = {
  password_required: "This statement is password-protected. Enter the PDF password and try again.",
  wrong_password: "That password didn't work. Check it and try again.",
  parse_failed: "We couldn't read this statement. Make sure it's an Equity PDF.",
}

function fmtDate(ms: number) {
  if (!ms) return "—"
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function StatementUpload() {
  const buildings = useQuery(api.buildings.list)
  const generateUploadUrl = useMutation(api.statementUpload.generateUploadUrl)
  const extract = useAction(api.statementExtract.extractEquityStatement)
  const setRowIncluded = useMutation(api.statementUpload.setRowIncluded)
  const commitBatch = useMutation(api.statementUpload.commitBatch)

  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [account, setAccount] = useState("")
  const [buildingId, setBuildingId] = useState<string>("")
  const [busy, setBusy] = useState<"upload" | "commit" | null>(null)
  const [batchId, setBatchId] = useState<Id<"statementBatches"> | null>(null)

  const preview = useQuery(api.statementUpload.batch, batchId ? { batchId } : "skip")

  // Single building → auto-select it; only show the picker when there's a choice.
  const multipleBuildings = (buildings?.length ?? 0) > 1
  const effectiveBuildingId = useMemo(() => {
    if (buildingId) return buildingId as Id<"buildings">
    if (buildings && buildings.length === 1) return buildings[0]._id
    return undefined
  }, [buildingId, buildings])

  const handleUpload = async () => {
    if (!file) return
    if (!account.trim()) {
      toast.error("Enter the account number this statement is for")
      return
    }
    setBusy("upload")
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      })
      if (!res.ok) throw new Error("File upload failed")
      const { storageId } = await res.json()

      const result = await extract({
        storageId,
        account: account.trim(),
        password: password || undefined,
        buildingId: effectiveBuildingId,
        fileName: file.name,
      })

      if (!result.ok) {
        toast.error(passwordReasonMessage[result.reason] ?? "Extraction failed")
        return
      }
      setBatchId(result.batchId)
      toast.success(`Parsed ${result.rowCount} rows (${result.creditCount} credits)`)
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed")
    } finally {
      setBusy(null)
    }
  }

  const handleCommit = async () => {
    if (!batchId) return
    setBusy("commit")
    try {
      const { committed } = await commitBatch({ batchId })
      toast.success(`Reconciled ${committed} payment${committed === 1 ? "" : "s"}`)
      reset()
    } catch (err: any) {
      toast.error(err?.message ?? "Commit failed")
    } finally {
      setBusy(null)
    }
  }

  const reset = () => {
    setFile(null)
    setPassword("")
    setAccount("")
    setBuildingId("")
    setBatchId(null)
  }

  const rows = preview?.rows ?? []
  const includedCredits = rows.filter((r) => r.include && r.direction === "credit")
  const committed = preview?.batch?.status === "committed"

  return (
    <div className="space-y-6">
      {/* Upload form */}
      {!batchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Upload bank statement
            </CardTitle>
            <CardDescription>
              Upload your Equity statement (PDF). We parse the transactions, you preview them, then we
              reconcile the credits against your tenants. The file is deleted after parsing — we keep only the
              transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="mb-2 text-sm text-muted-foreground">{file ? file.name : "Choose an Equity statement PDF"}</p>
              <Button variant="outline" onClick={() => document.getElementById("stmt-file")?.click()} disabled={busy !== null}>
                {file ? "Change file" : "Select PDF"}
              </Button>
              <input
                id="stmt-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stmt-account">Account number</Label>
                <Input
                  id="stmt-account"
                  placeholder="e.g. 102030404"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stmt-password">PDF password (if any)</Label>
                <Input
                  id="stmt-password"
                  type="password"
                  placeholder="Leave blank if not protected"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {multipleBuildings && (
              <div className="space-y-2">
                <Label>Building</Label>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Which building is this account for?" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings!.map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={handleUpload} disabled={!file || busy !== null} className="w-full">
              {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {busy === "upload" ? "Parsing…" : "Upload & parse"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview + confirm */}
      {batchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Review transactions
            </CardTitle>
            <CardDescription>
              {preview === undefined
                ? "Loading…"
                : `${rows.length} rows parsed — ${includedCredits.length} credits selected for reconciliation. Untick anything that isn't rent.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {committed ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" /> This statement has been reconciled.
              </div>
            ) : rows.length === 0 && preview !== undefined ? (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-amber-800">
                <AlertCircle className="h-5 w-5" /> No transactions were parsed from this statement.
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 w-10"></th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Payer</th>
                      <th className="px-3 py-2">Ref</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r._id} className="border-t hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={r.include}
                            disabled={r.direction === "debit"}
                            onCheckedChange={(c) => setRowIncluded({ rowId: r._id, include: Boolean(c) })}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{r.payerName ?? "—"}</span>
                          {r.payerPhone && <span className="ml-1 text-xs text-muted-foreground">{r.payerPhone}</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.ref}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">KES {r.amount.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <span className={r.direction === "credit" ? "text-emerald-700" : "text-muted-foreground"}>
                            {r.direction}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {committed ? (
                <>
                  <Button asChild>
                    <Link href="/payments">View payments</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/finances/receipts">View receipts</Link>
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    Upload another
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCommit} disabled={busy !== null || includedCredits.length === 0}>
                    {busy === "commit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Confirm & reconcile {includedCredits.length} credit{includedCredits.length === 1 ? "" : "s"}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy !== null}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
