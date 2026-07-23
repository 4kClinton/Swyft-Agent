"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { PlanPicker } from "@/components/plan-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function BillingPage() {
  const data = useQuery(api.subscriptions.current, {})

  if (data === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No company found for your account.
      </div>
    )
  }

  const { subscription: sub, isCompanyOwner, companyPhone } = data

  const phaseUi = sub.blocked
    ? { label: "Expired", cls: "bg-red-100 text-red-700", Icon: XCircle }
    : sub.inGrace
      ? { label: "Grace period", cls: "bg-amber-100 text-amber-700", Icon: AlertTriangle }
      : { label: sub.isTrial ? "Trial" : "Active", cls: "bg-green-100 text-green-700", Icon: CheckCircle2 }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Billing &amp; Subscription</h1>
        <p className="text-sm text-muted-foreground">
          Manage your Swyft plan and renew via M-Pesa.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Current plan</CardTitle>
          <Badge className={`gap-1 ${phaseUi.cls}`} variant="secondary">
            <phaseUi.Icon className="h-3.5 w-3.5" />
            {phaseUi.label}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Plan</div>
            <div className="font-semibold capitalize">{sub.plan}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {sub.blocked ? "Expired on" : sub.inGrace ? "Ended on" : "Renews / ends"}
            </div>
            <div className="font-semibold">{formatDate(sub.periodEnd)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {sub.blocked ? "Status" : "Access remaining"}
            </div>
            <div className="font-semibold">
              {sub.blocked
                ? "Paused"
                : sub.inGrace
                  ? `${Math.max(0, sub.graceDaysLeft)} day(s) grace`
                  : `${Math.max(0, sub.daysLeft)} day(s)`}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {sub.blocked ? "Renew to restore access" : "Renew or change plan"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isCompanyOwner ? (
            <PlanPicker
              defaultPhone={companyPhone}
              defaultPlan={sub.plan === "free" ? "premium" : (sub.plan as any)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only the company owner can manage billing. Please ask your account
              owner to renew the subscription.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
