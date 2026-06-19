"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Observed transactions live on the Payments screen (the reconciliation feed).
export default function TransactionsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/payments")
  }, [router])
  return (
    <div className="container mx-auto p-6 text-sm text-muted-foreground">
      Redirecting to payments…
    </div>
  )
}
