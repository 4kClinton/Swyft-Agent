"use client"

import { useEffect, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PAID_PLAN_IDS, PLANS, type PaidPlanId } from "@/convex/lib/plans"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react"
import { toast } from "sonner"

const DURATIONS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
]

/**
 * Plan selection + M-Pesa renewal form. Shared by the paywall (expired) and the
 * billing page (proactive renewal). Fires an STK push via subscriptions.startRenewal;
 * on payment the Lipana webhook extends the period and the `me` query updates
 * reactively — so the paywall simply unblocks itself, no client polling needed.
 */
export function PlanPicker({
  defaultPhone,
  defaultPlan = "premium",
}: {
  defaultPhone?: string | null
  defaultPlan?: PaidPlanId
}) {
  const startRenewal = useAction(api.subscriptions.startRenewal)
  const [plan, setPlan] = useState<PaidPlanId>(defaultPlan)
  const [months, setMonths] = useState(1)
  const [phone, setPhone] = useState(defaultPhone ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [intentId, setIntentId] = useState<Id<"paymentIntents"> | null>(null)

  // Reactively watch the payment intent; the Lipana webhook flips it to
  // "settled"/"failed" and this query re-runs on its own (no polling).
  const payment = useQuery(
    api.paymentIntents.status,
    intentId ? { id: intentId } : "skip",
  )
  const paymentStatus = payment?.status ?? null
  const waiting =
    intentId !== null && (paymentStatus === null || paymentStatus === "pending")

  // Announce the outcome once the webhook resolves the payment.
  useEffect(() => {
    if (paymentStatus === "settled") {
      toast.success("Payment received — your plan is now active 🎉")
    } else if (paymentStatus === "failed") {
      toast.error("Payment failed or was cancelled. You can try again.")
    }
  }, [paymentStatus])

  const total = PLANS[plan].priceKes * months
  const busy = submitting || waiting

  const handlePay = async () => {
    if (!phone.trim()) {
      toast.error("Enter the M-Pesa phone number to charge")
      return
    }
    setSubmitting(true)
    setIntentId(null)
    try {
      const { intentId: id } = await startRenewal({
        plan,
        phone: phone.trim(),
        months,
      })
      setIntentId(id)
      toast.success("STK push sent — approve the M-Pesa prompt on your phone")
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't start the payment. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PAID_PLAN_IDS.map((id) => {
          const p = PLANS[id]
          const active = plan === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPlan(id)}
              className={`flex flex-col rounded-xl border-2 p-4 text-left transition-all ${
                active
                  ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                  : "border-border hover:border-green-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                {active && <Check className="h-4 w-4 text-green-600" />}
              </div>
              <div className="mt-1 text-2xl font-extrabold">
                KSh {p.priceKes.toLocaleString()}
                <span className="text-sm font-medium text-muted-foreground"> /mo</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
              <ul className="mt-3 space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <Label>Billing period</Label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.months}
              type="button"
              onClick={() => setMonths(d.months)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                months === d.months
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-border hover:border-green-300"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phone + pay */}
      <div className="space-y-2">
        <Label htmlFor="mpesa-phone">M-Pesa phone number</Label>
        <div className="relative">
          <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="mpesa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XX XXX XXX"
            className="pl-9"
            disabled={busy}
          />
        </div>
      </div>

      <Button onClick={handlePay} disabled={busy} className="w-full" size="lg">
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {waiting
          ? "Waiting for confirmation…"
          : `Pay KSh ${total.toLocaleString()} with M-Pesa`}
      </Button>

      {/* Live payment status, driven by the Lipana webhook via paymentIntents.status */}
      {waiting && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">
            Waiting for M-Pesa confirmation… Approve the STK prompt on your
            phone. This updates automatically once your payment is received.
          </p>
        </div>
      )}

      {paymentStatus === "settled" && (
        <div className="flex items-start gap-2 rounded-lg border border-green-600/40 bg-green-50 p-3 text-sm dark:bg-green-950/30">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <p className="text-green-800 dark:text-green-300">
            Payment received — your plan is now active. Thank you!
          </p>
        </div>
      )}

      {paymentStatus === "failed" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-600/40 bg-red-50 p-3 text-sm dark:bg-red-950/30">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-red-800 dark:text-red-300">
            <p>Payment failed or was cancelled.</p>
            <button
              type="button"
              onClick={() => setIntentId(null)}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
