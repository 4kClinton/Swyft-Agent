import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Shared literal unions
// ---------------------------------------------------------------------------
export const roleValidator = v.union(
  v.literal("landlord"), // renamed from "owner"
  v.literal("manager"), // property-manager staff (and PM company owners)
  v.literal("agent"),
  // Transitional: legacy value pending the owner→landlord migration. Remove the
  // literal (and the ROLE_RANK entry in lib/rbac.ts) once migrations.migrateOwnerToLandlord
  // has run against the deployment.
  v.literal("owner"),
);

// A company is either a landlord (owns its own properties) or a property
// manager (manages properties for others and has manager/agent staff). Absent
// `kind` is treated as "landlord" for legacy rows.
export const companyKindValidator = v.union(
  v.literal("landlord"),
  v.literal("property_manager"),
);

export const adapterValidator = v.union(
  v.literal("jenga"),
  v.literal("daraja"),
  v.literal("coop"),
  v.literal("stanbic"),
  v.literal("kcb"),
  v.literal("lipana"),
  v.literal("sms"),
  v.literal("statement"),
);

export const matchStateValidator = v.union(
  v.literal("unmatched"),
  v.literal("auto_matched"),
  v.literal("manual_matched"),
);

export const invoiceStatusValidator = v.union(
  v.literal("open"),
  v.literal("partial"),
  v.literal("paid"),
  v.literal("void"),
);

// ---------------------------------------------------------------------------
// Schema — Swyft agent backend (Convex rebuild). See rules/1stPlan.md §3.2,
// rules/jengaIpnSpike.md §3.1, rules/stepByStepPlan.md Part D/E.
// ---------------------------------------------------------------------------
export default defineSchema({
  // Convex Auth tables (authAccounts, authSessions, authVerificationCodes, ...).
  ...authTables,

  // --- Tenancy boundary ---------------------------------------------------
  companyAccounts: defineTable({
    name: v.string(),
    // Landlord vs property-manager company. Optional for legacy rows (treated
    // as "landlord"). Only property_manager companies see the /admin section.
    kind: v.optional(companyKindValidator),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    size: v.optional(v.string()),
    description: v.optional(v.string()),
    plan: v.union(
      v.literal("free"),
      v.literal("standard"),
      v.literal("premium"),
      v.literal("enterprise"),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("trial"),
      v.literal("inactive"),
      v.literal("cancelled"),
    ),
  }),

  // The canonical identity row is the auth-managed `users` table (from
  // authTables). We attach app-level data via `profiles`, one per auth user.
  profiles: defineTable({
    userId: v.id("users"), // the authTables `users` _id (ctx auth subject)
    companyId: v.id("companyAccounts"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: roleValidator,
    isCompanyOwner: v.boolean(),
    // Module → access levels, mirrors legacy RBAC (lib/rbac.ts).
    access: v.optional(v.record(v.string(), v.array(v.string()))),
  })
    .index("by_userId", ["userId"])
    .index("by_company", ["companyId"]),

  // Pending team-member invites. When a property manager adds a member we record
  // the target company + role here, then the auth `afterUserCreatedOrUpdated`
  // hook attaches the new user to this company (instead of seeding a new one).
  memberInvites: defineTable({
    companyId: v.id("companyAccounts"),
    email: v.string(), // normalised lower-case
    role: roleValidator,
    invitedBy: v.id("profiles"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
  })
    .index("by_email", ["email"])
    .index("by_company", ["companyId"]),

  // --- Verified creators (filmers) ----------------------------------------
  creators: defineTable({
    companyId: v.optional(v.id("companyAccounts")),
    customerCreatorId: v.optional(v.string()), // id on swyft-customer backend
    fullName: v.string(),
    phone: v.string(),
    kycStatus: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    earningsRef: v.optional(v.string()),
  }).index("by_phone", ["phone"]),

  // --- Portfolio ----------------------------------------------------------
  buildings: defineTable({
    companyId: v.id("companyAccounts"),
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    description: v.optional(v.string()),
    propertyType: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("commercial"),
        v.literal("mixed"),
      ),
    ),
    // On-site caretaker contact. Collected at listing time (required in the UI;
    // optional here for legacy rows pre-dating the field).
    caretakerName: v.optional(v.string()),
    caretakerPhone: v.optional(v.string()),
    totalUnits: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    amenities: v.optional(v.array(v.string())),
    // Composition summary: how many units of each type the building consists of,
    // with an optional indicative monthly rent per type. Not the canonical
    // per-unit data (that lives in `units`).
    unitMix: v.optional(
      v.array(
        v.object({
          type: v.string(), // "bedsitter" | "1br" | "2br" | "3br" | ...
          count: v.number(),
          rent: v.optional(v.number()),
        }),
      ),
    ),
  }).index("by_company", ["companyId"]),

  units: defineTable({
    companyId: v.id("companyAccounts"),
    buildingId: v.id("buildings"),
    unitNumber: v.string(),
    unitType: v.optional(v.string()), // studio | 1br | 2br | ...
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    rentAmount: v.number(),
    depositAmount: v.optional(v.number()),
    status: v.union(
      v.literal("vacant"),
      v.literal("occupied"),
      v.literal("maintenance"),
      v.literal("reserved"),
    ),
  })
    .index("by_company", ["companyId"])
    .index("by_building", ["buildingId"]),

  // One unit → at most one active listing (sync record to swyft-customer).
  vacantListings: defineTable({
    companyId: v.id("companyAccounts"),
    // Optional: type-based listings (advertise "a 2BR in X") aren't tied to a
    // named unit, since vacant units are derived (building total − occupied).
    unitId: v.optional(v.id("units")),
    unitType: v.optional(v.string()),
    buildingId: v.id("buildings"),
    title: v.optional(v.string()),
    rentAmount: v.number(),
    availableFrom: v.optional(v.number()),
    description: v.optional(v.string()),
    externalRef: v.string(), // stable agent-side id sent to customer backend
    reelId: v.optional(v.string()), // returned by customer backend
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("taken"),
      v.literal("error"),
    ),
    boostId: v.optional(v.id("boosts")),
    lastSyncedAt: v.optional(v.number()),
    syncError: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_unit", ["unitId"])
    .index("by_externalRef", ["externalRef"]),

  // --- Tenancy ------------------------------------------------------------
  tenants: defineTable({
    companyId: v.id("companyAccounts"),
    fullName: v.string(),
    // Primary reconciliation key. Stored normalised to 2547######## (no +).
    phone: v.string(),
    email: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    unitId: v.optional(v.id("units")),
    buildingId: v.optional(v.id("buildings")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending"),
      v.literal("terminated"),
    ),
    // Opening balance brought forward for tenants migrated mid-tenancy.
    arrearsBroughtForward: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_phone", ["companyId", "phone"])
    .index("by_unit", ["unitId"]),

  leases: defineTable({
    companyId: v.id("companyAccounts"),
    tenantId: v.id("tenants"),
    unitId: v.id("units"),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    rentAmount: v.number(),
    depositAmount: v.optional(v.number()),
    billingDay: v.number(), // day-of-month invoices are generated (1-28)
    status: v.union(
      v.literal("active"),
      v.literal("ended"),
      v.literal("terminated"),
    ),
  })
    .index("by_company", ["companyId"])
    .index("by_tenant", ["tenantId"])
    .index("by_company_and_billingDay", ["companyId", "billingDay"])
    // System-wide cron scans leases due today regardless of company.
    .index("by_billingDay_and_status", ["billingDay", "status"]),

  // --- Money: invoices, payments, allocations, receipts -------------------
  invoices: defineTable({
    companyId: v.id("companyAccounts"),
    tenantId: v.id("tenants"),
    leaseId: v.optional(v.id("leases")),
    unitId: v.optional(v.id("units")),
    period: v.optional(v.string()), // "2026-06" for recurring rent
    kind: v.union(
      v.literal("rent"),
      v.literal("deposit"),
      v.literal("penalty"),
      v.literal("repair"),
      v.literal("water"),
      v.literal("service"),
      v.literal("opening_balance"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    amount: v.number(),
    balance: v.number(), // remaining unpaid; 0 when fully paid
    dueDate: v.number(),
    status: invoiceStatusValidator,
    // Cached branded PDF, generated on demand when the invoice is opened.
    pdfStorageId: v.optional(v.id("_storage")),
  })
    .index("by_company", ["companyId"])
    .index("by_tenant", ["tenantId"])
    // Open invoices oldest-first for FIFO allocation.
    .index("by_tenant_and_status", ["tenantId", "status"])
    .index("by_company_and_period", ["companyId", "period"]),

  // Per-landlord connector config (which account we observe, via which adapter).
  paymentSources: defineTable({
    companyId: v.id("companyAccounts"),
    // Optional link to the building whose rent lands in this account. Lets a
    // landlord route each building to its own paybill/account.
    buildingId: v.optional(v.id("buildings")),
    adapter: adapterValidator,
    accountNumber: v.string(), // e.g. "102030404"
    paybill: v.optional(v.string()), // e.g. "277277"
    label: v.optional(v.string()),
    active: v.boolean(),
    // Authorisation record (Part F: "read-only authorisation record per landlord").
    authorisedBy: v.optional(v.id("profiles")),
    authorisedAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_building", ["buildingId"])
    .index("by_account", ["accountNumber"]),

  // Every observed payment, normalised across adapters. Idempotent on `ref`.
  payments: defineTable({
    companyId: v.optional(v.id("companyAccounts")), // null until routed
    source: v.string(), // "jenga" | "daraja" | "lipana" | ...
    ref: v.string(), // transactionReference — dedupe key
    amount: v.number(),
    currency: v.string(),
    payerPhone: v.optional(v.string()),
    payerName: v.optional(v.string()),
    account: v.optional(v.string()),
    paidAt: v.number(),
    status: v.string(),
    raw: v.any(), // verbatim payload for audit/replay
    matchState: matchStateValidator,
    tenantId: v.optional(v.id("tenants")),
    // Overpayment that couldn't be allocated → tenant credit.
    unallocated: v.optional(v.number()),
  })
    .index("by_ref", ["ref"])
    .index("by_account", ["account"])
    .index("by_company", ["companyId"])
    .index("by_company_and_matchState", ["companyId", "matchState"]),

  // Learned payer-phone → tenant mapping (self-improving matcher).
  phoneTenantMap: defineTable({
    companyId: v.id("companyAccounts"),
    phone: v.string(),
    tenantId: v.id("tenants"),
  }).index("by_company_and_phone", ["companyId", "phone"]),

  // Payment → invoice links (supports partial / split payments).
  allocations: defineTable({
    companyId: v.id("companyAccounts"),
    paymentId: v.id("payments"),
    invoiceId: v.id("invoices"),
    tenantId: v.id("tenants"),
    amount: v.number(),
  })
    .index("by_payment", ["paymentId"])
    .index("by_invoice", ["invoiceId"]),

  receipts: defineTable({
    companyId: v.id("companyAccounts"),
    number: v.string(), // sequential, e.g. "SW-000123"
    paymentId: v.id("payments"),
    tenantId: v.id("tenants"),
    amount: v.number(),
    invoiceIds: v.array(v.id("invoices")),
    pdfStorageId: v.optional(v.id("_storage")),
    smsState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed"),
      ),
    ),
  })
    .index("by_company", ["companyId"])
    .index("by_payment", ["paymentId"])
    .index("by_number", ["number"]),

  // Monotonic counters (receipt numbers, etc.) — avoids count() scans.
  counters: defineTable({
    companyId: v.id("companyAccounts"),
    name: v.string(), // e.g. "receipt"
    value: v.number(),
  }).index("by_company_and_name", ["companyId", "name"]),

  // --- Comms & leads ------------------------------------------------------
  notices: defineTable({
    companyId: v.id("companyAccounts"),
    title: v.string(),
    content: v.string(),
    noticeType: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("acknowledged"),
    ),
    tenantId: v.optional(v.id("tenants")),
    unitId: v.optional(v.id("units")),
    buildingId: v.optional(v.id("buildings")),
    dueDate: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_tenant", ["tenantId"]),

  // One row per (notice, tenant) delivery. A notice is addressed to one or more
  // saved tenants; we persist who received it and the per-channel delivery
  // state so the comms history is auditable. (Issue #5)
  noticeRecipients: defineTable({
    companyId: v.id("companyAccounts"),
    noticeId: v.id("notices"),
    tenantId: v.id("tenants"),
    tenantName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    channel: v.union(v.literal("email"), v.literal("sms")),
    state: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
  })
    .index("by_notice", ["noticeId"])
    .index("by_company", ["companyId"])
    .index("by_tenant", ["tenantId"]),

  inquiries: defineTable({
    companyId: v.id("companyAccounts"),
    fullName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    message: v.optional(v.string()),
    inquiryType: v.optional(v.string()),
    status: v.union(
      v.literal("new"),
      v.literal("responded"),
      v.literal("closed"),
      v.literal("spam"),
    ),
    unitId: v.optional(v.id("units")),
    buildingId: v.optional(v.id("buildings")),
    listingId: v.optional(v.id("vacantListings")),
    source: v.optional(v.string()), // "website" | "sync_callback" | ...
    externalRef: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_externalRef", ["externalRef"]),

  // --- Monetization -------------------------------------------------------
  boosts: defineTable({
    companyId: v.id("companyAccounts"),
    listingId: v.id("vacantListings"),
    amount: v.number(),
    durationDays: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("failed"),
    ),
    lipanaRef: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_listing", ["listingId"])
    .index("by_lipanaRef", ["lipanaRef"]),

  // --- Config -------------------------------------------------------------
  settings: defineTable({
    scope: v.union(
      v.literal("company"),
      v.literal("user"),
      v.literal("system"),
    ),
    companyId: v.optional(v.id("companyAccounts")),
    userId: v.optional(v.id("users")),
    key: v.string(),
    value: v.any(),
  })
    .index("by_company_and_key", ["companyId", "key"])
    .index("by_scope_and_key", ["scope", "key"]),

  // --- Landing page waitlist (Part A) -------------------------------------
  waitlist: defineTable({
    name: v.string(),
    phone: v.string(),
    units: v.optional(v.number()),
    bankUsed: v.optional(v.string()),
    role: v.optional(v.string()),
  }).index("by_phone", ["phone"]),
});
