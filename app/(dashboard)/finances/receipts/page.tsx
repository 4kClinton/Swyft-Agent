"use client"

import { useState } from "react"
import { useQuery, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { Receipt, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"

const smsColor: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
}

export default function ReceiptsPage() {
  const receipts = useQuery(api.receipts.list)
  const getPdf = useAction(api.documents.receiptPdfUrl)
  const [busy, setBusy] = useState<string | null>(null)

  const open = async (id: Id<"receipts">) => {
    setBusy(id)
    try {
      const { url } = await getPdf({ receiptId: id })
      window.open(url, "_blank", "noopener")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to open receipt")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Receipts</h1>
        <p className="text-muted-foreground">Auto-generated on every matched payment, with SMS delivery</p>
      </div>

      {receipts === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : receipts.length === 0 ? (
        <EmptyState icon={Receipt} title="No receipts yet" description="Receipts are issued automatically when a payment is matched and allocated to a tenant." />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">All receipts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Receipt</span>
                <span className="col-span-4">Tenant</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-3 text-right">SMS</span>
              </div>
              {receipts.map((r) => (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => open(r._id)}
                  className="grid w-full grid-cols-12 items-center gap-2 rounded py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="col-span-3 font-mono text-xs">{r.number}</span>
                  <span className="col-span-4 truncate font-medium">{r.tenant?.fullName ?? "—"}</span>
                  <span className="col-span-2 text-right">KES {r.amount.toLocaleString()}</span>
                  <span className="col-span-3 flex items-center justify-end gap-1">
                    {busy === r._id && <Loader2 className="h-3 w-3 animate-spin" />}
                    {r.smsState && <Badge className={smsColor[r.smsState] ?? "bg-gray-100"}>{r.smsState}</Badge>}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
