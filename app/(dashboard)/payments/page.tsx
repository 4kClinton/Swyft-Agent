"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Clock, HelpCircle, Phone } from "lucide-react"
import { toast } from "sonner"

function matchBadge(state: string) {
  switch (state) {
    case "auto_matched":
      return (
        <Badge className="bg-green-100 text-green-800 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Auto-matched
        </Badge>
      )
    case "manual_matched":
      return (
        <Badge className="bg-blue-100 text-blue-800 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Assigned
        </Badge>
      )
    default:
      return (
        <Badge className="bg-yellow-100 text-yellow-800 gap-1">
          <HelpCircle className="h-3 w-3" /> Unmatched
        </Badge>
      )
  }
}

export default function PaymentsPage() {
  const feed = useQuery(api.payments.feed, { limit: 50 })
  const unmatched = useQuery(api.payments.unmatched)
  const tenants = useQuery(api.tenants.list)
  const manualAssign = useMutation(api.payments.manualAssign)

  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({})

  const handleAssign = async (paymentId: string) => {
    const tenantId = assignChoice[paymentId]
    if (!tenantId) {
      toast.error("Pick a tenant first")
      return
    }
    try {
      await manualAssign({ paymentId: paymentId as any, tenantId: tenantId as any })
      toast.success("Payment assigned — Swyft will remember this phone next time")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to assign")
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Payments</h1>
        <p className="text-muted-foreground">
          Live payments observed on your connected accounts — read-only, auto-matched to tenants.
        </p>
      </div>

      {/* Manual-assign queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Needs review
          </CardTitle>
          <CardDescription>
            Payments we couldn't auto-match. Assign once — the next payment from that phone matches itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unmatched === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : unmatched.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review. 🎉</p>
          ) : (
            unmatched.map((p) => (
              <div
                key={p._id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-md border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    KES {p.amount.toLocaleString()} · {p.payerName ?? "Unknown"}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {p.payerPhone ?? "no phone"} · ref {p.ref}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={assignChoice[p._id] ?? ""}
                    onValueChange={(v) => setAssignChoice({ ...assignChoice, [p._id]: v })}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Assign to tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tenants ?? []).map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.fullName} · {t.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => handleAssign(p._id)}>Assign</Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Live feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>Most recent 50 observed credits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {feed === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments yet. Connect a payment source and they'll appear here.
            </p>
          ) : (
            feed.map((p) => (
              <div
                key={p._id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    KES {p.amount.toLocaleString()}
                    {p.tenant ? ` · ${p.tenant.fullName}` : ""}
                  </div>
                  <div className="text-muted-foreground">
                    {p.payerName ?? p.payerPhone ?? "Unknown"} · {p.source} · ref {p.ref} ·{" "}
                    {new Date(p.paidAt).toLocaleString()}
                  </div>
                </div>
                {matchBadge(p.matchState)}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
