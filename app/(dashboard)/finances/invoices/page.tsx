"use client"

import { useState } from "react"
import { useQuery, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/empty-state"
import { FileText, Loader2, Eye, Send } from "lucide-react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"

const statusColor: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  partial: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-gray-100 text-gray-500",
}

export default function InvoicesPage() {
  const invoices = useQuery(api.invoices.listForCompany)
  const getPdf = useAction(api.documents.invoicePdfUrl)
  const sendInvoice = useAction(api.documents.sendInvoiceEmail)
  const sendAll = useAction(api.documents.sendAllOpenInvoices)
  const [busy, setBusy] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  // Prompt for an email when the tenant has none on file.
  const [emailFor, setEmailFor] = useState<Id<"invoices"> | null>(null)
  const [emailInput, setEmailInput] = useState("")

  const open = async (id: Id<"invoices">) => {
    setBusy(id)
    try {
      const { url } = await getPdf({ invoiceId: id })
      window.open(url, "_blank", "noopener")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to open invoice")
    } finally {
      setBusy(null)
    }
  }

  const send = async (id: Id<"invoices">, email?: string) => {
    setSending(id)
    try {
      const res = await sendInvoice({ invoiceId: id, email })
      if (res.sent) {
        toast.success("Invoice emailed to the tenant")
        setEmailFor(null)
        setEmailInput("")
      } else if (res.reason === "no_email") {
        // Tenant has no email — ask for one.
        setEmailFor(id)
      } else if (res.reason === "email_not_configured") {
        toast.error("Email isn't configured yet (RESEND_API_KEY)")
      } else {
        toast.error("Couldn't send the invoice — check the email address")
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send invoice")
    } finally {
      setSending(null)
    }
  }

  const onClickSend = (inv: { _id: Id<"invoices">; tenant?: { email?: string } | null }) => {
    if (inv.tenant?.email) send(inv._id)
    else { setEmailInput(""); setEmailFor(inv._id) }
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailFor) return
    if (!emailInput.trim()) return toast.error("Enter an email address")
    await send(emailFor, emailInput.trim())
  }

  const handleSendAll = async () => {
    setSendingAll(true)
    try {
      const { sent, skipped } = await sendAll({})
      toast.success(`Emailed ${sent} invoice(s)${skipped ? `, skipped ${skipped} (no email)` : ""}`)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send invoices")
    } finally {
      setSendingAll(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">Rent and ad-hoc invoices across your tenants</p>
        </div>
        {invoices && invoices.length > 0 && (
          <Button onClick={handleSendAll} disabled={sendingAll}>
            {sendingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send all open
          </Button>
        )}
      </div>

      {invoices === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : invoices.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" description="Invoices generate automatically each billing day once leases are set up, or add ad-hoc ones from a tenant." />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">All invoices</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-4">Tenant</span>
                <span className="col-span-2">Item</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-1 text-right">Balance</span>
                <span className="col-span-1 text-right">Status</span>
                <span className="col-span-2 text-right">Actions</span>
              </div>
              {invoices.map((inv) => (
                <div
                  key={inv._id}
                  className="grid w-full grid-cols-12 items-center gap-2 rounded py-2 text-sm hover:bg-muted/60"
                >
                  <span className="col-span-4 truncate font-medium">{inv.tenant?.fullName ?? "—"}</span>
                  <span className="col-span-2 truncate capitalize text-muted-foreground">{inv.description ?? inv.kind}</span>
                  <span className="col-span-2 text-right">{inv.amount.toLocaleString()}</span>
                  <span className="col-span-1 text-right">{inv.balance.toLocaleString()}</span>
                  <span className="col-span-1 flex justify-end">
                    <Badge className={statusColor[inv.status]}>{inv.status}</Badge>
                  </span>
                  <span className="col-span-2 flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Open PDF" disabled={busy === inv._id} onClick={() => open(inv._id)}>
                      {busy === inv._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={inv.tenant?.email ? `Email to ${inv.tenant.email}` : "Email invoice (add tenant email)"}
                      disabled={sending === inv._id}
                      onClick={() => onClickSend(inv)}
                    >
                      {sending === inv._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={emailFor !== null} onOpenChange={(o) => { if (!o) { setEmailFor(null); setEmailInput("") } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Send invoice by email</DialogTitle>
            <DialogDescription>This tenant has no email on file. Enter one to send — we'll save it for next time.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEmail} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Tenant email</Label>
              <Input id="recipient" type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="tenant@email.com" required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setEmailFor(null); setEmailInput("") }}>Cancel</Button>
              <Button type="submit" disabled={sending === emailFor}>
                {sending === emailFor && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
