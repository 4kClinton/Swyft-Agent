"use client"

import { useState } from "react"
import { useAction, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FileBarChart, Loader2, Download, Send } from "lucide-react"
import { toast } from "sonner"

const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  generated: { label: "Generated", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  skipped: { label: "No channel", className: "bg-amber-100 text-amber-800" },
}

export function LandlordReportDialog({
  landlordId,
  landlordName,
  hasChannel,
}: {
  landlordId: Id<"landlords">
  landlordName: string
  hasChannel: boolean
}) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(currentPeriod())
  const [busy, setBusy] = useState<"generate" | "send" | null>(null)

  const generate = useAction(api.reports.generateLandlordReport)
  const send = useAction(api.reports.sendLandlordReport)
  const deliveries = useQuery(api.reports.listDeliveries, open ? { landlordId } : "skip")

  const handleGenerate = async () => {
    setBusy("generate")
    try {
      const { url } = await generate({ landlordId, period })
      window.open(url, "_blank", "noopener,noreferrer")
      toast.success("Report generated")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate")
    } finally {
      setBusy(null)
    }
  }

  const handleSend = async () => {
    setBusy("send")
    try {
      const { state } = await send({ landlordId, period })
      if (state === "sent") toast.success("Report sent")
      else if (state === "skipped") toast.warning("No report channel/recipient on this landlord")
      else toast.error("Send failed — check the delivery provider is configured")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileBarChart className="mr-1 h-4 w-4" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Performance report — {landlordName}</DialogTitle>
          <DialogDescription>
            Occupancy, expected rent and arrears for the chosen period. Generate to preview,
            or send it to the landlord via their configured channel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="period">Period</Label>
            <Input
              id="period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleGenerate} disabled={busy !== null} variant="outline">
            {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Generate
          </Button>
          <Button onClick={handleSend} disabled={busy !== null}>
            {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </div>
        {!hasChannel && (
          <p className="text-xs text-amber-600">
            No report channel set for this landlord — edit them to add an email or phone, or
            just use Generate to download.
          </p>
        )}

        <div className="space-y-2 pt-2">
          <h4 className="text-sm font-medium">History</h4>
          {deliveries === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports generated yet.</p>
          ) : (
            <div className="space-y-1">
              {deliveries.map((d) => {
                const b = STATE_BADGE[d.state] ?? { label: d.state, className: "bg-muted" }
                return (
                  <div key={d._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{d.period}</span>
                      {d.summary && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {d.summary.occupied}/{d.summary.units} occ · arrears KES{" "}
                          {Math.round(d.summary.arrears).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={b.className}>{b.label}</Badge>
                      {d.url && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={d.url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
