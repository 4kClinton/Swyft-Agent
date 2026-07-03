"use client"

import { DataImport } from "@/components/data-import"

export default function ImportPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Import your data</h1>
        <p className="text-muted-foreground">
          Moving from another system? Do it in steps: import your <strong>buildings</strong>, then your{" "}
          <strong>tenants</strong> — and we&apos;ll work out your <strong>vacant units</strong> for you to
          review, edit and save. We map your columns automatically; nothing is imported until you approve
          it, and anything we can&apos;t place is kept safe for you to sort out later.
        </p>
      </div>
      <DataImport />
    </div>
  )
}
