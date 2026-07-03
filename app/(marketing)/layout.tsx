import type React from "react"
import { marketingLd } from "@/lib/seo"

/**
 * The marketing site is designed light-only. Scoping it in `.light` re-declares
 * the light design tokens on this subtree, so theme-token components (buttons,
 * inputs, selects) render correctly even when the user's OS/app is in dark mode.
 *
 * This is a Server Component, so the JSON-LD below is emitted into the initial
 * (pre-JS) HTML for the marketing routes only — crawlers and answer engines see
 * it immediately, while the auth-gated dashboard stays clean.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="light">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingLd) }}
      />
      {children}
    </div>
  )
}
