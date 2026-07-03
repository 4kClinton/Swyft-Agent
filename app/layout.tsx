import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"
import { SITE_URL, OG_IMAGE } from "@/lib/seo"

const inter = Inter({ subsets: ["latin"] })

const TITLE = "Swyft Agent — List once. Fill faster. Get paid cleaner."
const DESCRIPTION =
  "Fill vacant units from a trust-first rental marketplace and reconcile rent on the M-Pesa paybill you already use. Swyft never touches your money."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Swyft Agent",
  keywords: [
    "list rental property Kenya",
    "fill vacant units Nairobi",
    "property management software Kenya",
    "rent collection M-Pesa paybill",
    "rent reconciliation Kenya",
    "landlord software Kenya",
    "rental marketplace Nairobi",
    "Swyft Agent",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: SITE_URL,
    siteName: "Swyft Agent",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Swyft Agent for Kenyan landlords and property managers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <ConvexClientProvider>
            <AuthProvider>
              {children}
              <Toaster />
              {/* Renders toasts from `toast` in "sonner" (used across the app). */}
              <SonnerToaster />
              <PWAInstallPrompt />
            </AuthProvider>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
