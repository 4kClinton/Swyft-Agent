"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SwyftLogo } from "@/components/swyft-logo"
import { Reveal } from "@/components/reveal"
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
  MapPin,
  BadgeCheck,
  Globe,
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
      <BuiltFor />
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
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "border-[#E6EBE8] shadow-[0_1px_20px_rgba(10,31,23,0.06)]" : "border-transparent"
      }`}
    >
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
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{ background: `radial-gradient(55% 45% at 75% 10%, ${ACCENT} 0%, transparent 70%)` }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 md:grid-cols-2 md:pt-24 lg:gap-16">
        {/* Copy */}
        <div className="text-center md:text-left">
          <Reveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E6EBE8] bg-[#F7F9F8] px-4 py-1.5 text-xs font-medium text-[#5B6B64]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built for Kenyan landlords &amp; property managers
            </div>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] md:text-5xl lg:text-6xl">
              List once. Fill faster.<br />
              <span className="text-emerald-600">Get paid cleaner.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#5B6B64] md:mx-0">
              Put your vacant unit in front of verified renters who are actually moving — and let
              Swyft run rent collection, invoices and receipts on the M-Pesa paybill you already use.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
              <a href="#waitlist" className="w-full sm:w-auto">
                <Button size="lg" className="h-12 w-full bg-emerald-600 px-7 text-base font-semibold transition-transform hover:-translate-y-0.5 hover:bg-emerald-700">
                  List a vacant unit free
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </a>
              <a href="#paid" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="h-12 w-full border-[#E6EBE8] px-7 text-base font-semibold">
                  See how rent collection works
                </Button>
              </a>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-5 max-w-md text-sm text-[#5B6B64] md:mx-0">
              The end-to-end ecosystem where people discover and move into their dream spaces — the
              easiest way possible.
            </p>
          </Reveal>
        </div>

        {/* Visual */}
        <Reveal delay={120} className="relative mx-auto w-full max-w-md md:max-w-none">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-[#E6EBE8] bg-[#F7F9F8] shadow-[0_30px_60px_-20px_rgba(10,31,23,0.25)]">
            <Image
              src="/landing/hero-professional.jpg"
              alt="A property manager reviewing verified tenant documents in a modern Nairobi office"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A1F17]/25 via-transparent to-transparent" />
          </div>

          {/* Floating verified badge */}
          <div className="swyft-float absolute -left-3 top-6 flex items-center gap-2 rounded-2xl border border-[#E6EBE8] bg-white/90 px-3.5 py-2.5 shadow-lg backdrop-blur md:-left-6">
            <Image src="/landing/swyft-mark.png" alt="" width={28} height={28} className="h-7 w-7" />
            <div className="text-left">
              <div className="text-[11px] font-bold leading-tight text-[#0A1F17]">Verified renter</div>
              <div className="text-[10px] leading-tight text-[#5B6B64]">move-ready</div>
            </div>
          </div>

          {/* Floating reconciled chip */}
          <div className="swyft-float-slow absolute -bottom-4 right-2 flex items-center gap-2.5 rounded-2xl border border-[#E6EBE8] bg-white/90 px-4 py-3 shadow-lg backdrop-blur md:right-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECFDF5]">
              <Check className="h-4 w-4 text-emerald-600" />
            </span>
            <div className="text-left">
              <div className="text-[11px] font-bold leading-tight text-[#0A1F17]">Rent reconciled</div>
              <div className="text-[10px] leading-tight text-[#5B6B64]">KES 45,000 · auto-matched</div>
            </div>
          </div>
        </Reveal>
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
      <BankLogosCarousel />
    </section>
  )
}

const BANK_LOGOS = [
  { src: "/images/bank-logos/mpesa.png", alt: "M-Pesa" },
  { src: "/images/bank-logos/equity.png", alt: "Equity Bank" },
  { src: "/images/bank-logos/coop.png", alt: "Co-operative Bank" },
  { src: "/images/bank-logos/kcb.png", alt: "KCB Bank" },
  { src: "/images/bank-logos/absa.png", alt: "Absa Bank" },
  { src: "/images/bank-logos/ncba.png", alt: "NCBA Bank" },
  { src: "/images/bank-logos/stanbic.png", alt: "Stanbic Bank" },
  { src: "/images/bank-logos/dtb.png", alt: "Diamond Trust Bank" },
  { src: "/images/bank-logos/I&M.png", alt: "I&M Bank" },
]

function BankLogosCarousel() {
  return (
    <div className="border-t border-[#E6EBE8] py-6">
      <div className="group relative mx-auto max-w-6xl overflow-hidden px-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-12 group-hover:[animation-play-state:paused] md:gap-16">
          {[...BANK_LOGOS, ...BANK_LOGOS].map((logo, i) => (
            <Image
              key={`${logo.src}-${i}`}
              src={logo.src}
              alt={logo.alt}
              width={120}
              height={40}
              className="h-8 w-auto shrink-0 object-contain transition md:h-10"
            />
          ))}
        </div>
      </div>
    </div>
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
      <div className="grid items-center gap-12 md:grid-cols-2 lg:gap-16">
        {/* Emotional anchor image */}
        <Reveal className="order-2 md:order-1">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-[#E6EBE8] shadow-[0_30px_60px_-25px_rgba(10,31,23,0.3)]">
            <Image
              src="/landing/problem-stress.jpg"
              alt="A landlord overwhelmed by manual rent admin and scattered paperwork"
              fill
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
            <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-[#0A1F17]/80 px-4 py-3 text-sm font-medium text-white backdrop-blur">
              SMS, Sheets &amp; paper receipts — until something slips.
            </div>
          </div>
        </Reveal>

        <div className="order-1 md:order-2">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
              Every empty day is rent you never get back.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
              Yet the tools to fill the unit and run the building are broken in three ways.
            </p>
          </Reveal>
          <div className="mt-8 space-y-4">
            {problems.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className="flex gap-4 rounded-2xl border border-[#E6EBE8] bg-white p-5 transition-shadow hover:shadow-md">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ECFDF5] text-sm font-bold text-emerald-700">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{p.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#5B6B64]">{p.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- Fill faster */
function FillFaster() {
  return (
    <section id="fill" className="bg-[#F7F9F8]">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
        <Reveal>
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
        </Reveal>
        {/* Phone mockup */}
        <Reveal delay={120} className="flex justify-center">
          <div className="relative h-[440px] w-[220px] rounded-[2.2rem] border-[6px] border-[#0A1F17] bg-[#0A1F17] shadow-2xl">
            <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-[#0A1F17]" />
            <div className="h-full w-full overflow-hidden rounded-[1.7rem] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/swyft-reel-ngong.jpeg"
                alt="Swyft reels — a verified 2-bedroom listing in Matasia, Ngong on the renter app"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </Reveal>
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
      <div className="grid items-center gap-12 md:grid-cols-2 lg:gap-16">
        <Reveal>
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
          {/* Money-flow diagram */}
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-[#E6EBE8] bg-[#F7F9F8] p-6 text-center text-sm font-medium sm:flex-row sm:justify-between sm:text-left">
            <FlowNode icon={Phone} label="Tenant M-Pesa" />
            <FlowArrow />
            <FlowNode icon={Building2} label="Your paybill" sub="unchanged" />
            <FlowArrow dashed />
            <FlowNode icon={ShieldCheck} label="Swyft" sub="read-only" accent />
          </div>
        </Reveal>

        <Reveal delay={120} className="relative mx-auto w-full max-w-md md:max-w-none">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-[#E6EBE8] shadow-[0_30px_60px_-25px_rgba(10,31,23,0.3)]">
            <Image
              src="/landing/peter-landlord.jpg"
              alt="Peter, a Nairobi landlord who manages multiple buildings on one paybill"
              fill
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
          <div className="swyft-float absolute -bottom-4 -left-3 rounded-2xl border border-[#E6EBE8] bg-white/90 px-4 py-3 shadow-lg backdrop-blur md:-left-6">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5B6B64]">Peter · Nairobi</div>
            <div className="text-base font-bold text-[#0A1F17]">3 buildings · 68 units</div>
            <div className="text-[11px] text-emerald-600">1 Equity paybill — unchanged</div>
          </div>
        </Reveal>
      </div>

      <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            <div className="h-full rounded-2xl border border-[#E6EBE8] bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5]">
                <Icon className="h-5 w-5 text-emerald-600" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5B6B64]">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ----------------------------------------------------------- Built for */
function BuiltFor() {
  const people = [
    {
      img: "/landing/persona-landlord.jpg",
      alt: "A Kenyan landlord reviewing a building report by the window",
      icon: Building2,
      role: "The hands-on landlord",
      body: "Owns a few buildings, knows every tenant by name, and is tired of chasing rent over WhatsApp.",
      tag: "Fills units faster",
    },
    {
      img: "/landing/persona-manager.jpg",
      alt: "Two property managers reviewing rent-roll and arrears reports together",
      icon: TrendingUp,
      role: "The property manager",
      body: "Runs dozens of units across owners and needs clean rent-rolls, arrears and statements — not Sheets.",
      tag: "Automates the back office",
    },
    {
      img: "/landing/persona-diaspora.jpg",
      alt: "A diaspora property owner reviewing statements remotely",
      icon: Globe,
      role: "The diaspora owner",
      body: "Manages property from abroad and just wants to see who paid, who's late, and the proof — at a glance.",
      tag: "Full visibility, anywhere",
    },
  ]
  return (
    <section className="bg-[#F7F9F8]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
            Who it's for
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Built for people like these.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
            From a single block in Ngong to a portfolio managed from Dallas — Swyft fits the way
            you already work.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {people.map(({ img, alt, icon: Icon, role, body, tag }, i) => (
            <Reveal key={role} delay={i * 100}>
              <div className="group h-full overflow-hidden rounded-2xl border border-[#E6EBE8] bg-white transition-all hover:-translate-y-1 hover:shadow-lg">
                <div className="relative aspect-[5/4] overflow-hidden">
                  <Image
                    src={img}
                    alt={alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0A1F17] backdrop-blur">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                    {tag}
                  </span>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ECFDF5]">
                      <Icon className="h-4 w-4 text-emerald-600" />
                    </span>
                    <h3 className="font-semibold">{role}</h3>
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#5B6B64]">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120} className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-center text-sm text-[#5B6B64]">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
          Onboarding landlords concierge-style across Nairobi — Equity users first.
        </Reveal>
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
    <section className="bg-white">
      <div className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <Reveal>
          <h2 className="text-center text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Why Swyft over the alternatives
          </h2>
        </Reveal>
        <Reveal delay={80} className="mt-12 overflow-hidden rounded-2xl border border-[#E6EBE8] bg-white shadow-[0_20px_50px_-30px_rgba(10,31,23,0.25)]">
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
        </Reveal>
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
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">Simple, fair pricing</h2>
        <p className="mt-4 text-lg leading-relaxed text-[#5B6B64]">
          Free to list. Pay only when you want to fill faster or automate the back office.
        </p>
      </Reveal>
      <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
        {tiers.map((t, i) => (
          <Reveal key={t.name} delay={i * 90}>
            <div
              className={`relative h-full rounded-2xl border p-7 transition-all hover:-translate-y-1 hover:shadow-md ${t.highlight ? "border-emerald-600 bg-white shadow-lg shadow-emerald-600/5 md:-translate-y-2" : "border-[#E6EBE8] bg-white"}`}
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
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- Waitlist */
// WhatsApp Business number that receives waitlist submissions (no "+" for wa.me).
const WAITLIST_WHATSAPP = "254796652112"

function openWhatsApp(form: {
  name: string
  phone: string
  units: string
  bankUsed: string
  role: string
}) {
  const lines = [
    "New Swyft waitlist signup",
    "",
    `Name: ${form.name}`,
    `Phone (M-Pesa): ${form.phone}`,
    form.units ? `Units: ${form.units}` : null,
    form.role ? `Role: ${form.role}` : null,
    form.bankUsed ? `Bank/rail: ${form.bankUsed}` : null,
  ].filter(Boolean)

  const url = `https://wa.me/${WAITLIST_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`
  window.open(url, "_blank", "noopener,noreferrer")
}

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
      openWhatsApp(form)
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
