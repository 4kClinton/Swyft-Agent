"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SwyftLogo } from "@/components/swyft-logo"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Building2,
  ShieldCheck,
  Wallet,
  Receipt,
  Video,
  Users,
  ArrowRight,
  Check,
  X,
  Minus,
  Phone,
  ChevronDown,
  Lock,
  TrendingUp,
} from "lucide-react"

const ACCENT = "#059669"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#0A1F17] antialiased">
      <Nav />
      <Hero />
      <TrustStrip />
      <Problem />
      <FillFaster />
      <GetPaidCleaner />
      <Comparison />
      <Pricing />
      <Waitlist />
      <FAQ />
      <Footer />
    </main>
  )
}

/* ------------------------------------------------------------------ Nav */
function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#E6EBE8] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center">
          <SwyftLogo className="h-8 w-auto" priority />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#5B6B64] md:flex">
          <a href="#fill" className="transition-colors hover:text-[#0A1F17]">Fill faster</a>
          <a href="#paid" className="transition-colors hover:text-[#0A1F17]">Get paid cleaner</a>
          <a href="#pricing" className="transition-colors hover:text-[#0A1F17]">Pricing</a>
          <a href="#faq" className="transition-colors hover:text-[#0A1F17]">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" className="text-sm font-semibold">Sign in</Button>
          </Link>
          <a href="#waitlist">
            <Button className="bg-emerald-600 text-sm font-semibold hover:bg-emerald-700">
              Get early access
            </Button>
          </a>
        </div>
      </div>
    </header>
  )
}

/* ----------------------------------------------------------------- Hero */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{ background: `radial-gradient(60% 50% at 50% 0%, ${ACCENT} 0%, transparent 70%)` }}
      />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-20 text-center md:pt-28">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#E6EBE8] bg-[#F7F9F8] px-4 py-1.5 text-xs font-medium text-[#5B6B64]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Built for Kenyan landlords & property managers
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] md:text-6xl">
          List once. Fill faster.<br />
          <span className="text-emerald-600">Get paid cleaner.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#5B6B64]">
          Put your vacant unit in front of verified renters who are actually moving — and let
          Swyft run rent collection, invoices and receipts on the M-Pesa paybill you already use.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#waitlist">
            <Button size="lg" className="h-12 bg-emerald-600 px-7 text-base font-semibold hover:bg-emerald-700">
              List a vacant unit free
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </a>
          <a href="#paid">
            <Button size="lg" variant="outline" className="h-12 border-[#E6EBE8] px-7 text-base font-semibold">
              See how rent collection works
            </Button>
          </a>
        </div>
        <p className="mt-4 text-sm text-[#5B6B64]">
          Keep your paybill. Keep how tenants pay. Swyft never touches your money.
        </p>
      </div>
    </section>
  )
}

function TrustStrip() {
  const items = [
    { icon: Video, label: "Real video, verified creators" },
    { icon: ShieldCheck, label: "Move-ready, verified renters" },
    { icon: Lock, label: "Read-only — money never moves through us" },
    { icon: Phone, label: "M-Pesa, Equity, Co-op, KCB" },
  ]
  return (
    <section className="border-y border-[#E6EBE8] bg-[#F7F9F8]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-4 px-5 py-6 md:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm font-medium text-[#5B6B64]">
            <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- Problem */
function Problem() {
  const problems = [
    {
      title: "Trust-broken listings",
      body: "TikTok, Jiji and Facebook are full of fake brokers, recycled photos and viewing-fee scams. Good landlords get lumped in with them and lose serious leads.",
    },
    {
      title: "Noisy, untargeted reach",
      body: "Social feeds optimise for entertainment, not intent. Thousands of passive scrollers, a handful of real movers — and no way to tell them apart.",
    },
    {
      title: "Rent run on SMS & Excel",
      body: "M-Pesa SMS, Google Sheets and paper receipts. Payments go unreconciled, arrears go unnoticed, and disputes have no paper trail.",
    },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
          Every empty day is rent you never get back.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
          Yet the tools to fill the unit and run the building are broken in three ways.
        </p>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {problems.map((p, i) => (
          <div key={p.title} className="rounded-2xl border border-[#E6EBE8] bg-white p-7">
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[#ECFDF5] text-sm font-bold text-emerald-700">
              {i + 1}
            </div>
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5B6B64]">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- Fill faster */
function FillFaster() {
  return (
    <section id="fill" className="bg-[#F7F9F8]">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
            Fill faster
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            A trust-first marketplace, not a noisy feed.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
            Swyft puts your vacant unit in front of verified renters who are actively looking to
            move right now. Real video, verified creators, a move-ready audience — so you get
            qualified inquiries, not spam DMs.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              "Verified creators film your unit — real video, no recycled photos",
              "Reaches renters by intent, not entertainment",
              "Qualified inquiries land straight in your dashboard",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px]">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Phone mockup */}
        <div className="flex justify-center">
          <div className="relative h-[440px] w-[220px] rounded-[2.2rem] border-[6px] border-[#0A1F17] bg-[#0A1F17] shadow-2xl">
            <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-[#0A1F17]" />
            <div className="h-full w-full overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-emerald-700 to-emerald-900 p-4 pt-8">
              <div className="flex items-center gap-2 text-white/90">
                <Video className="h-4 w-4" />
                <span className="text-xs font-semibold">Swyft reels</span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
                  <div className="h-20 rounded-lg bg-white/15" />
                  <p className="mt-2 text-[11px] font-semibold text-white">2-bed · Kilimani</p>
                  <p className="text-[11px] text-white/70">KES 45,000/mo · verified</p>
                </div>
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
                  <div className="h-20 rounded-lg bg-white/15" />
                  <p className="mt-2 text-[11px] font-semibold text-white">Bedsitter · Roysambu</p>
                  <p className="text-[11px] text-white/70">KES 12,000/mo · verified</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------ Get paid cleaner */
function GetPaidCleaner() {
  const features = [
    { icon: Wallet, title: "Keep your paybill", body: "Tenants pay into your existing Equity / M-Pesa / Co-op / KCB account exactly as they do today." },
    { icon: Users, title: "Auto-matched to tenants", body: "Every payment is matched to the right tenant by phone — instantly, and it learns over time." },
    { icon: Receipt, title: "Receipts & arrears", body: "Sequential receipts by SMS, live arrears and aging, and one-tap tenant statements." },
    { icon: TrendingUp, title: "Reports that managers need", body: "Rent-roll, collection rate and arrears reports — no more Sheets, SMS and paper." },
  ]
  return (
    <section id="paid" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
          Get paid cleaner
        </span>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
          Keep your rails. We just show you who paid.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
          Peter runs 3 buildings, 68 units, all paying into one Equity paybill. He won't change
          it — and he shouldn't have to. Swyft reads each payment and reconciles it automatically.
          <span className="font-semibold text-[#0A1F17]"> No money flows through Swyft.</span>
        </p>
      </div>

      {/* Money-flow diagram */}
      <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center gap-3 rounded-2xl border border-[#E6EBE8] bg-[#F7F9F8] p-6 text-center text-sm font-medium md:flex-row md:justify-between md:text-left">
        <FlowNode icon={Phone} label="Tenant M-Pesa" />
        <FlowArrow />
        <FlowNode icon={Building2} label="Your paybill" sub="unchanged" />
        <FlowArrow dashed />
        <FlowNode icon={ShieldCheck} label="Swyft" sub="read-only" accent />
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-[#E6EBE8] bg-white p-6">
            <Icon className="h-6 w-6 text-emerald-600" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5B6B64]">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FlowNode({ icon: Icon, label, sub, accent }: { icon: any; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? "bg-emerald-600 text-white" : "bg-white text-[#0A1F17] border border-[#E6EBE8]"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold">{label}</div>
        {sub && <div className="text-xs text-[#5B6B64]">{sub}</div>}
      </div>
    </div>
  )
}

function FlowArrow({ dashed }: { dashed?: boolean }) {
  return (
    <div className="flex items-center text-[#9AA8A1]">
      <Minus className={`h-5 w-8 ${dashed ? "opacity-40" : ""}`} />
      <ArrowRight className="h-4 w-4" />
    </div>
  )
}

/* ----------------------------------------------------------- Comparison */
function Comparison() {
  const rows: { label: string; tiktok: "no" | "partial" | "yes"; competitors: "no" | "partial" | "yes"; swyft: "no" | "partial" | "yes" }[] = [
    { label: "Reach move-ready renters", tiktok: "no", competitors: "no", swyft: "yes" },
    { label: "Trust / anti-scam verification", tiktok: "no", competitors: "partial", swyft: "yes" },
    { label: "Rent reconciliation", tiktok: "no", competitors: "yes", swyft: "yes" },
    { label: "Invoices & SMS receipts", tiktok: "no", competitors: "yes", swyft: "yes" },
    { label: "Faster vacancy fill", tiktok: "partial", competitors: "no", swyft: "yes" },
    { label: "Tours & moving bundled", tiktok: "no", competitors: "no", swyft: "yes" },
  ]
  return (
    <section className="bg-[#F7F9F8]">
      <div className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <h2 className="text-center text-3xl font-bold tracking-[-0.02em] md:text-4xl">
          Why Swyft over the alternatives
        </h2>
        <div className="mt-12 overflow-hidden rounded-2xl border border-[#E6EBE8] bg-white">
          <div className="grid grid-cols-4 border-b border-[#E6EBE8] bg-[#F7F9F8] text-sm font-semibold">
            <div className="p-4" />
            <div className="p-4 text-center text-[#5B6B64]">Post on TikTok</div>
            <div className="p-4 text-center text-[#5B6B64]">competitors</div>
            <div className="p-4 text-center text-emerald-700">Swyft</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.label} className={`grid grid-cols-4 items-center text-sm ${i % 2 ? "bg-[#FBFCFB]" : ""}`}>
              <div className="p-4 font-medium">{r.label}</div>
              <Cell v={r.tiktok} />
              <Cell v={r.competitors} />
              <Cell v={r.swyft} highlight />
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[#5B6B64]">
          competitors does the back office. Swyft does the back office <span className="font-semibold text-[#0A1F17]">and</span> brings the demand that fills the unit.
        </p>
      </div>
    </section>
  )
}

function Cell({ v, highlight }: { v: "no" | "partial" | "yes"; highlight?: boolean }) {
  return (
    <div className={`flex justify-center p-4 ${highlight ? "bg-[#ECFDF5]" : ""}`}>
      {v === "yes" && <Check className="h-5 w-5 text-emerald-600" />}
      {v === "partial" && <Minus className="h-5 w-5 text-amber-500" />}
      {v === "no" && <X className="h-5 w-5 text-[#C2CEC8]" />}
    </div>
  )
}

/* -------------------------------------------------------------- Pricing */
function Pricing() {
  const tiers = [
    { name: "List", price: "Free", note: "Win supply & trust", features: ["List vacant units", "Qualified inquiries", "Basic rent tracking"] },
    { name: "Boost", price: "from KES 500", note: "per 7 days", features: ["Top-of-feed placement", "Faster vacancy fill", "Pay via M-Pesa STK"], highlight: true },
    { name: "RPMS", price: "from KES 2,500", note: "per month", features: ["Auto-invoicing & receipts", "Statements & reports", "Multi-bank reconciliation"] },
  ]
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">Simple, fair pricing</h2>
        <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
          Free to list. Pay only when you want to fill faster or automate the back office.
        </p>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`relative rounded-2xl border p-7 ${t.highlight ? "border-emerald-600 bg-white shadow-lg shadow-emerald-600/5" : "border-[#E6EBE8] bg-white"}`}
          >
            {t.highlight && (
              <span className="absolute -top-3 left-7 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            )}
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#5B6B64]">{t.name}</h3>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tracking-tight">{t.price}</span>
              <span className="text-sm text-[#5B6B64]">{t.note}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- Waitlist */
function Waitlist() {
  const join = useMutation(api.waitlist.join)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ name: "", phone: "", units: "", bankUsed: "", role: "" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.phone) {
      toast.error("Name and phone are required")
      return
    }
    setSubmitting(true)
    try {
      await join({
        name: form.name,
        phone: form.phone,
        units: form.units ? Number(form.units) : undefined,
        bankUsed: form.bankUsed || undefined,
        role: form.role || undefined,
      })
      setDone(true)
      toast.success("You're on the list — we'll be in touch.")
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="waitlist" className="bg-[#0A1F17]">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
        <div className="text-white">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Get early access
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-white/70">
            We're onboarding landlords concierge-style, Equity users first. Tell us your bank and
            unit count and we'll set you up — no paybill changes, ever.
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm text-white/60">
            <Lock className="h-4 w-4 text-emerald-400" />
            Read-only access. We never move your money.
          </div>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-xl">
          {done ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5]">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="mt-4 text-xl font-semibold">You're on the list</h3>
              <p className="mt-2 text-sm text-[#5B6B64]">
                We'll reach out on {form.phone} to get you set up.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="w-name">Full name</Label>
                <Input id="w-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Peter N." required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-phone">Phone (M-Pesa)</Label>
                <Input id="w-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0712 345 678" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="w-units"># of units</Label>
                  <Input id="w-units" type="number" min="1" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} placeholder="68" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landlord">Landlord</SelectItem>
                      <SelectItem value="manager">Property manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bank tenants pay into</Label>
                <Select value={form.bankUsed} onValueChange={(v) => setForm({ ...form, bankUsed: v })}>
                  <SelectTrigger><SelectValue placeholder="Select bank / rail" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equity">Equity</SelectItem>
                    <SelectItem value="coop">Co-operative</SelectItem>
                    <SelectItem value="kcb">KCB</SelectItem>
                    <SelectItem value="stanbic">Stanbic</SelectItem>
                    <SelectItem value="mpesa">M-Pesa paybill/till</SelectItem>
                    <SelectItem value="other">Other / not sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={submitting} className="h-11 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700">
                {submitting ? "Joining…" : "Join the waitlist"}
              </Button>
              <p className="text-center text-xs text-[#5B6B64]">
                No spam. We'll only contact you about onboarding.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ FAQ */
function FAQ() {
  const faqs = [
    {
      q: "Is it safe? Does my money go through Swyft?",
      a: "No. Tenants keep paying into your existing paybill/till/bank exactly as they do today. Swyft only reads the payment notifications you already get, so we can show you who paid. We never hold or move your money.",
    },
    {
      q: "How does the reconciliation actually work?",
      a: "When a tenant pays your account, your bank sends Swyft a read-only notification with the payer's phone, name, amount and reference. We match it to the right tenant by phone — instantly — then generate the receipt and update arrears. Unmatched payments are one tap to assign, and we remember it next time.",
    },
    {
      q: "Do I have to change my paybill or tell tenants to pay somewhere new?",
      a: "Never. That's the whole point. Nothing about how your tenants pay changes — which is exactly why landlords can say yes on day one.",
    },
    {
      q: "Which banks are supported?",
      a: "Equity (via Jenga) first, then Co-op, Stanbic, KCB and Safaricom paybills. No bank API? A statement upload or our SMS forwarder works for any account.",
    },
    {
      q: "I manage property from the diaspora — does that work?",
      a: "Yes. One-click tenant statements, live dashboards and scheduled reports are built for owners who aren't on the ground.",
    },
  ]
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-20 md:py-28">
      <h2 className="text-center text-3xl font-bold tracking-[-0.02em] md:text-4xl">
        Questions, answered straight
      </h2>
      <div className="mt-12 divide-y divide-[#E6EBE8] border-y border-[#E6EBE8]">
        {faqs.map((f, i) => {
          const isOpen = open === i
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-[17px] font-semibold">{f.q}</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-[#5B6B64] transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <p className="-mt-1 pb-5 text-[15px] leading-relaxed text-[#5B6B64]">{f.a}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- Footer */
function Footer() {
  return (
    <footer className="border-t border-[#E6EBE8] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-14 text-center">
        <h2 className="max-w-xl text-2xl font-bold tracking-[-0.02em] md:text-3xl">
          Fill your vacant units. Get paid cleaner. Keep your paybill.
        </h2>
        <a href="#waitlist">
          <Button size="lg" className="h-12 bg-emerald-600 px-7 text-base font-semibold hover:bg-emerald-700">
            Get early access
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </a>
        <div className="mt-6 flex items-center gap-4 text-sm text-[#5B6B64]">
          <Link href="/terms" className="transition-colors hover:text-[#0A1F17]">
            Terms &amp; Conditions
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-[#0A1F17]">
            Privacy Policy
          </Link>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#5B6B64]">
          <SwyftLogo className="h-6 w-auto" />
          <span>· © {new Date().getFullYear()} · Nairobi, Kenya</span>
        </div>
      </div>
    </footer>
  )
}
