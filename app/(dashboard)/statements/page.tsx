"use client"

import { StatementUpload } from "@/components/statement-upload"

export default function StatementsPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Upload Statement</h1>
        <p className="text-muted-foreground">
          Reconcile rent from your bank statement — upload, preview the transactions, then confirm. Matched
          payments produce receipts and clear invoices automatically.
        </p>
      </div>
      <StatementUpload />
    </div>
  )
}
