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
  // Verify-back could not confirm the credit with Jenga's query API (or that
  // API isn't wired yet) and the amount is above the verify-back threshold:
  // held for a human instead of being auto-reconciled.
  v.literal("needs_review"),
);

// A payment source may route/backfill/reconcile observed payments ONLY once its
// ownership is verified. New rows start "pending"; legacy rows (no `status`) are
// grandfathered as verified — see lib/paymentSource.ts:isVerifiedSource.
export const paymentSourceStatusValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

// How a source's ownership was proven.
export const verificationMethodValidator = v.union(
  v.literal("recent_credit"), // claimant confirmed amount+ref of an observed credit
  v.literal("statement_upload"), // bank statement + manual admin approval
  v.literal("admin_manual"), // out-of-band admin override
);

// Lifecycle of an uploaded bank-statement import. Rows are parsed into a
// staging area first ("parsed"), previewed by the landlord, then fed through
// the live reconciliation engine on confirm ("committed").
export const statementBatchStatusValidator = v.union(
  v.literal("extracting"),
  v.literal("parsed"),
  v.literal("committed"),
  v.literal("failed"),
);

export const statementDirectionValidator = v.union(
  v.literal("credit"),
  v.literal("debit"),
);

export const invoiceStatusValidator = v.union(
  v.literal("open"),
  v.literal("partial"),
  v.literal("paid"),
  v.literal("void"),
);

// --- Smart data-migration (CSV/Excel onboarding import) -----------------
// Lifecycle of an uploaded migration file. Raw is captured first, rows are
// AI-mapped into a staging area, the user previews/confirms, then commit writes
// in dependency order. `partially_committed` = some rows committed, others left
// parked for the user to resolve. Nothing is ever auto-deleted.
export const importBatchStatusValidator = v.union(
  v.literal("parsing"),
  v.literal("parsed"),
  v.literal("partially_committed"),
  v.literal("committed"),
  v.literal("failed"),
);

// The importable entities, plus `unknown` for sheets/rows the AI couldn't
// classify (parked, never dropped). `landlord` is the property-manager owner
// layer: a building row references its owner by `landlordName` natural key.
export const importEntityValidator = v.union(
  v.literal("landlord"),
  v.literal("building"),
  v.literal("unit"),
  v.literal("tenant"),
  v.literal("lease"),
  v.literal("unknown"),
);

// `parked` = unknown/invalid/needs attention (survives commit); `ready` = valid
// & eligible for commit; `committed` = written.
export const importRowStateValidator = v.union(
  v.literal("parked"),
  v.literal("ready"),
  v.literal("committed"),
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
    // Epoch ms the current paid/trial period ends. Absent on legacy rows — the
    // entitlement helper (lib/subscription.ts) then derives a TRIAL_DAYS window
    // from `_creationTime`. Pushed forward on each successful renewal.
    currentPeriodEnd: v.optional(v.number()),
    // Lipana transaction id of the last settled renewal — webhook idempotency
    // guard so a re-delivered callback can't extend the period twice.
    lastPaymentRef: v.optional(v.string()),
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
    // Platform super-admin (Swyft staff). Orthogonal to the company-scoped
    // `role` above: it grants access to the cross-company /platform admin area,
    // NOT to any single company's data. Absent/false for every normal user.
    // Grant with the `platformAdmin.grantPlatformAdmin` internal mutation.
    isPlatformAdmin: v.optional(v.boolean()),
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
  // Property-owner clients of a property-manager company. For landlord-kind
  // companies the owner is implicit (the company itself) and this table is
  // unused — buildings simply leave `landlordId` empty. Landlords are pure data
  // records: they have NO login/portal; reports are pushed to them via
  // `reportChannel`. See [[pm-landlord-layer]].
  landlords: defineTable({
    companyId: v.id("companyAccounts"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    kraPin: v.optional(v.string()),
    nextOfKinName: v.optional(v.string()),
    nextOfKinPhone: v.optional(v.string()),
    // How/how often the owner receives pushed performance reports.
    reportChannel: v.optional(
      v.union(v.literal("email"), v.literal("whatsapp"), v.literal("sms")),
    ),
    reportCadence: v.optional(
      v.union(v.literal("monthly"), v.literal("quarterly")),
    ),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_company", ["companyId"]),

  buildings: defineTable({
    companyId: v.id("companyAccounts"),
    // The owning landlord (property-manager companies only). Optional: absent on
    // landlord-kind companies (implicit self-owner) and on legacy rows.
    landlordId: v.optional(v.id("landlords")),
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    // Structured Nairobi area key from lib/areas.ts (NAIROBI_AREAS) — the JOIN
    // KEY for lead matching (rules/DATA_FLOW/leads.md §3). Optional here for
    // legacy rows; required in the building form going forward. Kept distinct
    // from free-text city/county, which are useless for matching.
    area: v.optional(v.string()),
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
    // Free-text landmark directions for the Swyft field team capturing the unit
    // ("blue gate opposite the shop"). Sent in the capture-job sync payload.
    directions: v.optional(v.string()),
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
    // Marketplace media captured at building creation. `mediaKeyPrefix` is a
    // client-generated UUID: the building image lives under `<prefix>_building`
    // and each unit type's video + images under `<prefix>_type_<type>` in the
    // swyft-customer deployment. Sent in the publish payload so the customer app
    // can auto-publish a reel from the pre-recorded media. `imageUrl` is the
    // building cover's customer-served URL, kept only for our own dashboard.
    mediaKeyPrefix: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    // How many building photos live under `<prefix>_building`. Lets the edit UI
    // show what's already recorded on reopen (the bytes live customer-side).
    buildingImageCount: v.optional(v.number()),
    // Per-unit-type vacant-sample photo manifest: how many images each unit type
    // has under `<prefix>_type_<type>`. `type` is a UNIT_TYPES key (studio | 1br
    // | 2br | ...). Same tagging as the new-building wizard.
    unitTypeMedia: v.optional(
      v.array(
        v.object({
          type: v.string(),
          imageCount: v.number(),
        }),
      ),
    ),
  })
    .index("by_company", ["companyId"])
    .index("by_landlord", ["landlordId"]),

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
      // Manually pulled off the marketplace by the manager (distinct from
      // "taken", which means a renter took the unit). Auto retire/reopen skips it.
      v.literal("unlisted"),
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
    // Extended profile (captured at import or edited later).
    kraPin: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()), // free-form/ISO; not parsed to epoch
    gender: v.optional(v.string()),
    occupation: v.optional(v.string()),
    employer: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    emergencyContactRelation: v.optional(v.string()),
    // URL of the signed tenancy agreement (uploaded file or external link).
    tenantAgreementUrl: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_phone", ["companyId", "phone"])
    .index("by_unit", ["unitId"])
    .index("by_building", ["buildingId"]),

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

  // Signed tenancy/lease agreements. Canonical scope is the tenant (+ the lease
  // term); a tenant accrues a new row on each renewal. Replaces the thin
  // `tenants.tenantAgreementUrl` (kept for back-compat — a non-empty value is
  // treated as an implicit "tenancy" agreement when no row exists here). The
  // file is either an uploaded PDF (`storageId`) or an external link
  // (`externalUrl`). See [[pm-landlord-layer]].
  agreements: defineTable({
    companyId: v.id("companyAccounts"),
    tenantId: v.id("tenants"),
    leaseId: v.optional(v.id("leases")),
    storageId: v.optional(v.id("_storage")),
    externalUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    kind: v.union(
      v.literal("tenancy"),
      v.literal("lease"),
      v.literal("other"),
    ),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_company", ["companyId"])
    .index("by_lease", ["leaseId"]),

  // Bulk agreement migration: PDFs whose filename couldn't be matched to a tenant
  // are parked here (never dropped — see [[never-lose-import-data]]) for the user
  // to assign manually. Matched files become `agreements` rows directly. The
  // stored file lives in `_storage` until resolved or discarded.
  pendingAgreements: defineTable({
    companyId: v.id("companyAccounts"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    // What we parsed from the filename but couldn't resolve (shown to the user).
    guessedPhone: v.optional(v.string()),
  }).index("by_company", ["companyId"]),

  // Auditable record of operational reports PUSHED to a landlord (no portal —
  // see [[pm-landlord-layer]]). One row per (landlord, period, send). Mirrors the
  // `noticeRecipients` pattern. `summary` caches the headline metrics so the
  // history reads without recomputing.
  reportDeliveries: defineTable({
    companyId: v.id("companyAccounts"),
    landlordId: v.id("landlords"),
    period: v.string(), // "2026-06"
    storageId: v.optional(v.id("_storage")), // the generated PDF
    channel: v.optional(
      v.union(v.literal("email"), v.literal("whatsapp"), v.literal("sms")),
    ),
    recipient: v.optional(v.string()), // email / phone the report went to
    state: v.union(
      v.literal("generated"), // PDF built, not yet sent
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"), // no channel/recipient configured
    ),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    summary: v.optional(
      v.object({
        buildings: v.number(),
        units: v.number(),
        occupied: v.number(),
        vacant: v.number(),
        expectedMonthlyRent: v.number(),
        arrears: v.number(),
      }),
    ),
  })
    .index("by_company", ["companyId"])
    .index("by_landlord", ["landlordId"]),

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
    // Ownership verification. New rows are inserted status="pending", active=false
    // and route/backfill/reconcile NOTHING until proven. Absent on legacy rows,
    // which are grandfathered as verified (isVerifiedSource). Only a VERIFIED
    // source locks an accountNumber; multiple pending claims may coexist.
    status: v.optional(paymentSourceStatusValidator),
    verificationMethod: v.optional(verificationMethodValidator),
    verifiedAt: v.optional(v.number()),
    // Brute-force guard for the "confirm a recent credit" challenge, scoped to
    // this pending claim (one claim per company+account). Cleared on success.
    verifyAttempts: v.optional(v.number()),
    verifyWindowStart: v.optional(v.number()),
    verifyLockedUntil: v.optional(v.number()),
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

  // Raw IPN capture for the first ~50 notifications per adapter, so we can
  // confirm WHICH payload field actually carries the credited account number
  // (Jenga's field table is internally inconsistent) before trusting extraction
  // in production. Capped by the ingest path; intentionally NOT company-scoped.
  ipnDebug: defineTable({
    source: v.string(), // "jenga" | "kcb" | ...
    extractedAccount: v.optional(v.string()), // what our parser chose
    raw: v.any(), // verbatim payload
  }).index("by_source", ["source"]),

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

  // --- Statement-upload front (deterministic bank-statement import) -------
  // One row per uploaded statement. Holds the parsed transactions in a staging
  // area so the landlord can preview before anything is reconciled. The raw PDF
  // is NEVER persisted — it's deleted from storage immediately after extraction.
  statementBatches: defineTable({
    companyId: v.id("companyAccounts"),
    // Optional building the statement's account belongs to (routing aid).
    buildingId: v.optional(v.id("buildings")),
    // The account number the credit rows route to (paymentSources.accountNumber).
    account: v.string(),
    source: v.literal("equity"), // first (and only) supported adapter
    status: statementBatchStatusValidator,
    fileName: v.optional(v.string()),
    rowCount: v.number(),
    creditCount: v.number(),
    error: v.optional(v.string()),
    committedAt: v.optional(v.number()),
  }).index("by_company", ["companyId"]),

  // Child rows of a statementBatch (split out: an unbounded list must not live
  // inside the parent document — Convex 1MB / rewrite-on-update rule).
  statementRows: defineTable({
    companyId: v.id("companyAccounts"),
    batchId: v.id("statementBatches"),
    date: v.number(),
    amount: v.number(),
    direction: statementDirectionValidator,
    ref: v.string(),
    payerName: v.optional(v.string()),
    payerPhone: v.optional(v.string()),
    rawLine: v.string(), // reconstructed source line, for audit/debugging
    include: v.boolean(), // preview toggle; only included credits are committed
    paymentId: v.optional(v.id("payments")), // set once committed
  }).index("by_batch", ["batchId"]),

  // --- Smart data-migration staging (CSV/Excel onboarding import) ---------
  // One row per uploaded file. The ORIGINAL file is retained in `_storage`
  // (`rawStorageId`) — unlike statement uploads, this is the user's portfolio
  // data (an asset, not a liability), so we never delete it. `parkedCount`
  // tracks rows that still need attention after a (partial) commit.
  importBatches: defineTable({
    companyId: v.id("companyAccounts"),
    status: importBatchStatusValidator,
    fileName: v.optional(v.string()),
    rawStorageId: v.optional(v.id("_storage")),
    rowCount: v.number(),
    committedCount: v.number(),
    parkedCount: v.number(),
    error: v.optional(v.string()),
    createdBy: v.optional(v.id("profiles")),
  }).index("by_company", ["companyId"]),

  // Child rows of an importBatch. `rawRow` is the VERBATIM source row (never
  // mutated), `data` is the AI-mapped shape, `extra` holds unmapped columns
  // (preserved, never dropped), `naturalKeys` carry references resolved at
  // commit. Nothing is lost: unclassifiable/invalid rows are `parked`.
  importRows: defineTable({
    companyId: v.id("companyAccounts"),
    batchId: v.id("importBatches"),
    // Which uploaded sheet the row came from — lets re-parse regroup by sheet
    // and lets the user override a misdetected sheet's entity type.
    sheetName: v.optional(v.string()),
    entityType: importEntityValidator,
    rawRow: v.any(), // verbatim source row
    data: v.any(), // mapped onto our schema
    extra: v.any(), // unmapped source columns, preserved
    naturalKeys: v.object({
      // Building rows reference their owner by name (resolved to landlordId at
      // commit, after landlord rows are committed first).
      landlordName: v.optional(v.string()),
      buildingName: v.optional(v.string()),
      unitNumber: v.optional(v.string()),
      tenantPhone: v.optional(v.string()),
    }),
    rowState: importRowStateValidator,
    include: v.boolean(), // preview toggle
    validation: v.object({
      ok: v.boolean(),
      message: v.optional(v.string()),
    }),
    resultId: v.optional(v.string()), // id of the created record, once committed
  })
    .index("by_batch", ["batchId"])
    .index("by_batch_and_state", ["batchId", "rowState"]),

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

  // Pending Lipana STK-push payments, keyed by the M-Pesa checkoutRequestId.
  // Lipana has no reference passthrough, so this row is how the webhook maps a
  // settled payment back to what it was for (subscription renewal or boost).
  // See lib/lipana.ts and http.ts /api/lipana/webhook.
  paymentIntents: defineTable({
    kind: v.union(v.literal("subscription"), v.literal("boost")),
    companyId: v.id("companyAccounts"),
    // Lipana's `transactionId` is the primary reconciliation key (the STK-push
    // ACK returns it; the webhook echoes it). `checkoutRequestId` often isn't in
    // the ACK, so it's optional and only a fallback match key.
    transactionId: v.optional(v.string()),
    checkoutRequestId: v.optional(v.string()),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("settled"),
      v.literal("failed"),
    ),
    // subscription-only
    plan: v.optional(v.string()),
    months: v.optional(v.number()),
    // boost-only
    boostId: v.optional(v.id("boosts")),
  })
    .index("by_transactionId", ["transactionId"])
    .index("by_checkoutRequestId", ["checkoutRequestId"])
    .index("by_company", ["companyId"]),

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

  // --- Leads (house-hunting demand) ---------------------------------------
  // De-identified projection of a swyft-customer lead, pushed here via the
  // HMAC-signed POST /api/leads/upsert (rules/DATA_FLOW/leads.md). NO tenant PII
  // ever lands here — no name, no phone, no exact budget. A property manager
  // sees a lead only if they have a building in its `area` (gated in the query).
  leadMatches: defineTable({
    leadRef: v.string(), // opaque customer-side id; idempotency key
    area: v.string(), // shared area key — the hard match gate
    unitType: v.string(),
    bedrooms: v.optional(v.number()),
    budgetMin: v.number(),
    budgetMax: v.number(),
    budgetBand: v.string(), // display label, e.g. "12k–16k"
    moveWindow: v.string(),
    depositReady: v.boolean(),
    status: v.string(), // open | matched | viewing | closed | expired (mirrors customer)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_leadRef", ["leadRef"])
    .index("by_area_and_status", ["area", "status"]),

  // A manager's offer of a vacant unit against a lead. Server-enforced cap of 3
  // sends per lead (rules/DATA_FLOW/leads.md §4). One row per (leadRef, unit).
  leadSends: defineTable({
    leadRef: v.string(),
    companyId: v.id("companyAccounts"),
    unitId: v.id("units"),
    buildingId: v.id("buildings"),
    status: v.union(
      v.literal("sent"),
      v.literal("interested"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
  })
    .index("by_leadRef", ["leadRef"])
    .index("by_leadRef_and_unit", ["leadRef", "unitId"])
    .index("by_company", ["companyId"]),

  // A viewing a tenant requested against a unit a manager offered. Lands from the
  // customer app via POST /api/leads/viewing-request (no PII — leadRef + unit
  // only). When the manager confirms, it becomes the §5 "viewing confirmed
  // in-app" trigger that releases contact both ways. One row per (leadRef, unit).
  leadViewings: defineTable({
    leadRef: v.string(),
    unitId: v.id("units"),
    companyId: v.id("companyAccounts"),
    buildingId: v.id("buildings"),
    status: v.union(
      v.literal("requested"),
      v.literal("confirmed"),
      v.literal("declined"),
    ),
    requestedAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_leadRef", ["leadRef"])
    .index("by_leadRef_and_unit", ["leadRef", "unitId"])
    .index("by_company", ["companyId"]),

  // The tenant contact grant — the ONLY place agent-side PII for a house-hunter
  // lives, and only ever after a confirmed viewing (rules/DATA_FLOW/leads.md §5).
  // Delivered by the customer app via POST /api/leads/contact-grant, scoped to
  // the company whose viewing was confirmed. Never crosses back over the wire.
  leadContacts: defineTable({
    leadRef: v.string(),
    companyId: v.id("companyAccounts"),
    name: v.string(),
    phone: v.string(),
    message: v.optional(v.string()), // composed from the structured request
    photoUrl: v.optional(v.string()),
    grantedAt: v.number(),
  })
    .index("by_leadRef", ["leadRef"])
    .index("by_leadRef_and_company", ["leadRef", "companyId"]),
});
