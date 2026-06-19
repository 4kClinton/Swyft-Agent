import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SwyftLogo } from "@/components/swyft-logo"

interface LegalPageProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-white text-[#0A1F17] antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#E6EBE8] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <SwyftLogo className="h-8 w-auto" priority />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5B6B64] transition-colors hover:text-[#0A1F17]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      {/* Body */}
      <article className="mx-auto max-w-3xl px-5 py-16 md:py-20">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em] md:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-[#5B6B64]">Last updated: {lastUpdated}</p>
        <div className="legal-body mt-10 space-y-8">{children}</div>
      </article>

      {/* Footer */}
      <footer className="border-t border-[#E6EBE8] bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-5 py-10 text-center text-sm text-[#5B6B64]">
          <div className="flex items-center gap-4">
            <Link href="/terms" className="transition-colors hover:text-[#0A1F17]">
              Terms &amp; Conditions
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[#0A1F17]">
              Privacy Policy
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <SwyftLogo className="h-6 w-auto" />
            <span>· © {new Date().getFullYear()} · Nairobi, Kenya</span>
          </div>
        </div>
      </footer>
    </main>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-[-0.01em]">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-[#3A4742]">{children}</div>
    </section>
  )
}
