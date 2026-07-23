"use client"

import type React from "react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { PlanPicker } from "@/components/plan-picker"
import { SwyftLogo } from "@/components/swyft-logo"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Lock } from "lucide-react"

/**
 * Paywall enforcement for the dashboard. Wraps the app content:
 *  - active  → renders children (with a soft banner when the period ends soon)
 *  - grace   → renders children + a persistent "renew now" banner
 *  - expired → replaces the app with a full-screen paywall (renew to unblock)
 *
 * The server mirrors this with a write-guard (lib/rbac.requireActiveSubscription),
 * so an expired company can read but never mutate. State comes from the reactive
 * `me` query via useAuth().subscription, so a successful renewal auto-unblocks.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { subscription, loading, user } = useAuth()

  // Don't flash the paywall before we know the state.
  if (loading || !subscription) return <>{children}</>

  if (subscription.blocked) {
    return <Paywall email={user?.email} />
  }

  // Warn during grace, or in the last few days of the current period.
  const showBanner = subscription.inGrace || subscription.daysLeft <= 3

  return (
    <>
      {showBanner && <RenewBanner state={subscription} />}
      {children}
    </>
  )
}

function RenewBanner({
  state,
}: {
  state: NonNullable<ReturnType<typeof useAuth>["subscription"]>
}) {
  const message = state.inGrace
    ? `Your ${state.isTrial ? "trial" : "subscription"} has ended. You have ${Math.max(
        0,
        state.graceDaysLeft,
      )} day${state.graceDaysLeft === 1 ? "" : "s"} of access left — renew to avoid interruption.`
    : `Your ${state.isTrial ? "free trial" : "plan"} ends in ${Math.max(
        0,
        state.daysLeft,
      )} day${state.daysLeft === 1 ? "" : "s"}. Renew to keep uninterrupted access.`

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      <Button asChild size="sm" variant="outline" className="h-7 border-amber-400 bg-transparent">
        <Link href="/billing">Renew now</Link>
      </Button>
    </div>
  )
}

function Paywall({ email }: { email?: string }) {
  const { signOut } = useAuth()

  return (
    <div className="min-h-full overflow-auto bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
          <div className="mb-6 flex flex-col items-center text-center">
            <SwyftLogo className="mb-6 h-8 w-auto" />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
              <Lock className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold">Your subscription has expired</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Your access is paused. Your data is safe — renew your plan below to
              unlock the dashboard again. Payment is instant via M-Pesa.
            </p>
          </div>

          <PlanPicker defaultPhone={undefined} />

          <div className="mt-6 flex items-center justify-center gap-4 border-t pt-4 text-sm text-muted-foreground">
            {email && <span className="truncate">Signed in as {email}</span>}
            <button
              type="button"
              onClick={() => signOut()}
              className="text-primary hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
