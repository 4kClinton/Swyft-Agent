// ── Central SEO / structured-data source of truth (Swyft Agent) ─────────────
// Everything an answer engine (Google, Bing, ChatGPT, Claude, Gemini, Perplexity)
// needs to understand and cite Swyft Agent. Kenya / landlord + property-manager focused.

export const SITE_URL = "https://agent.swyft.africa";
export const SUPPORT_EMAIL = "support@swyft.africa";
export const SUPPORT_PHONE = "+254796652112";

export const OG_IMAGE = "/landing/hero-professional.jpg";

// Public, indexable marketing routes (everything else is auth-gated app UI).
export const PUBLIC_ROUTES = ["/", "/terms", "/privacy"] as const;

// Auth-gated / private URL prefixes — kept out of the sitemap and blocked in robots.
export const PRIVATE_PREFIXES = [
  "/dashboard", "/notices", "/profile", "/ads", "/buildings", "/finances",
  "/admin", "/statements", "/new-building", "/new-vacant-unit", "/setup",
  "/settings", "/landlords", "/payments", "/analytics", "/new-listing",
  "/smart-data", "/import", "/wallet", "/packages", "/vacant-units",
  "/test-connection", "/inquiries", "/tenants", "/request-move",
  "/login", "/signup", "/reset-password", "/forgot-password", "/confirm-email",
] as const;

// ── JSON-LD graph (safe on marketing pages) ─────────────────────────────────
const organization = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Swyft Agent",
  legalName: "Taleel Holdings LTD.",
  url: SITE_URL,
  logo: `${SITE_URL}/swyft-logo.png`,
  description:
    "Swyft Agent helps Kenyan landlords and property managers fill vacant units from a trust-first rental marketplace and reconcile rent on the M-Pesa paybill or bank account they already use. Swyft never touches the money.",
  areaServed: { "@type": "Country", name: "Kenya" },
  address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: SUPPORT_PHONE,
      email: SUPPORT_EMAIL,
      contactType: "customer support",
      areaServed: "KE",
      availableLanguage: ["en", "sw"],
    },
  ],
  sameAs: ["https://www.instagram.com/_.swyft._"],
};

const website = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "Swyft Agent",
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "en-KE",
};

const softwareApp = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: "Swyft Agent",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "KES" },
  publisher: { "@id": `${SITE_URL}/#organization` },
  description:
    "List vacant units once to a trust-first rental marketplace of move-ready renters, then reconcile rent automatically on the M-Pesa paybill or bank account you already use — auto-matched payments, receipts, invoices and arrears statements. Money never moves through Swyft.",
};

const listingService = {
  "@type": "Service",
  name: "Swyft Agent — list rentals & fill vacant units in Kenya",
  serviceType: "Property listing marketplace",
  provider: { "@id": `${SITE_URL}/#organization` },
  areaServed: { "@type": "Country", name: "Kenya" },
  description:
    "List a vacant unit once. Verified creators film it and it reaches renters who are actually moving, so landlords and property managers fill units faster.",
};

const rentService = {
  "@type": "Service",
  name: "Swyft Agent — rent reconciliation on your own paybill",
  serviceType: "Rent collection and reconciliation",
  provider: { "@id": `${SITE_URL}/#organization` },
  areaServed: { "@type": "Country", name: "Kenya" },
  description:
    "Reconcile rent on the M-Pesa paybill or bank account you already use. Swyft reads your payment notifications to auto-match payments and generate receipts, invoices and arrears statements — money never moves through Swyft.",
};

// Site-wide marketing graph.
export const marketingLd = {
  "@context": "https://schema.org",
  "@graph": [organization, website, softwareApp, listingService, rentService],
};
