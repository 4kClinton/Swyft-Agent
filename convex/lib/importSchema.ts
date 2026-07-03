import { normalizePhone } from "./phone";

// ---------------------------------------------------------------------------
// Import schema descriptor — the SINGLE SOURCE OF TRUTH the AI maps onto.
//
// This tells the model what fields exist, where each value belongs, and how to
// shape it. It is consumed three ways:
//   (a) rendered into the mapping prompt as the target spec (`buildSchemaSpec`)
//   (b) used to validate/filter the AI's chosen targets (`getEntitySpec`)
//   (c) drives deterministic coercion + validation at staging (`coerceValue`,
//       `validateMapped`)
//
// KEEP IN SYNC WITH convex/schema.ts. When a real field/enum on buildings,
// units, tenants, leases changes, update the matching entity here.
// ---------------------------------------------------------------------------

export type ImportEntity = "landlord" | "building" | "unit" | "tenant" | "lease";

export type FieldType =
  | "string"
  | "number"
  | "phone"
  | "date" // parsed to epoch ms
  | "enum"
  | "boolean";

export interface FieldSpec {
  /** Canonical target key (a real column, unless `ref`). */
  key: string;
  type: FieldType;
  required?: boolean;
  /** Allowed values for `enum` fields. */
  enumValues?: string[];
  /**
   * A reference/natural key (e.g. which building a unit belongs to) rather than
   * a stored column. Refs land in `naturalKeys`, resolved to ids at commit.
   */
  ref?: "buildingName" | "unitNumber" | "tenantPhone" | "landlordName";
  description: string;
}

export interface EntitySpec {
  entity: ImportEntity;
  label: string;
  /** How a record of this entity is uniquely identified (for dedupe/resolution). */
  naturalKey: string;
  fields: FieldSpec[];
}

// Common unit-type vocabulary, surfaced to the model as a hint.
const UNIT_TYPE_HINT =
  "free text, commonly: bedsitter | studio | single | 1br | 2br | 3br | 4br | shop | office";

export const IMPORT_SCHEMA: Record<ImportEntity, EntitySpec> = {
  landlord: {
    entity: "landlord",
    label: "Landlord / property owner",
    naturalKey: "name (unique within the company)",
    fields: [
      { key: "name", type: "string", required: true, description: "Landlord / owner full name or company, e.g. 'John Kamau' or 'Acme Holdings Ltd'" },
      { key: "email", type: "string", description: "Landlord email address" },
      { key: "phone", type: "phone", description: "Landlord phone (Kenyan mobile)" },
      { key: "nationalId", type: "string", description: "National ID number" },
      { key: "kraPin", type: "string", description: "KRA PIN / tax number" },
      { key: "nextOfKinName", type: "string", description: "Next of kin name" },
      { key: "nextOfKinPhone", type: "string", description: "Next of kin phone (keep as given)" },
    ],
  },

  building: {
    entity: "building",
    label: "Building / property",
    naturalKey: "name (unique within the company)",
    fields: [
      { key: "name", type: "string", required: true, description: "Building or property name, e.g. 'Riverside Court'" },
      { key: "landlordName", type: "string", ref: "landlordName", description: "Name of the landlord / owner of this building, if known (matched to an imported or existing landlord)" },
      { key: "address", type: "string", description: "Street address" },
      { key: "city", type: "string", description: "City / town" },
      { key: "county", type: "string", description: "County" },
      {
        key: "propertyType",
        type: "enum",
        enumValues: ["apartment", "house", "commercial", "mixed"],
        description: "Kind of property",
      },
      { key: "caretakerName", type: "string", description: "On-site caretaker name, if present" },
      { key: "caretakerPhone", type: "phone", description: "On-site caretaker phone (Kenyan mobile)" },
      { key: "totalUnits", type: "number", description: "Total number of units in the building" },
      { key: "description", type: "string", description: "Any free-text notes about the property" },
    ],
  },

  unit: {
    entity: "unit",
    label: "Unit / apartment",
    naturalKey: "building name + unit number",
    fields: [
      { key: "buildingName", type: "string", required: true, ref: "buildingName", description: "Name of the building this unit belongs to" },
      { key: "unitNumber", type: "string", required: true, ref: "unitNumber", description: "Unit / house / door / room number — map any column like 'Unit No.', 'Hse No.', 'House Number', 'Door', 'Room'. Values look like 'A10', 'D1', '22', 'Hse No. 22'." },
      { key: "unitType", type: "string", description: `Unit type — ${UNIT_TYPE_HINT}` },
      { key: "bedrooms", type: "number", description: "Number of bedrooms" },
      { key: "bathrooms", type: "number", description: "Number of bathrooms" },
      { key: "rentAmount", type: "number", required: true, description: "Monthly rent in KES (number only)" },
      { key: "depositAmount", type: "number", description: "Deposit held, in KES" },
      {
        key: "status",
        type: "enum",
        enumValues: ["vacant", "occupied", "maintenance", "reserved"],
        description: "Occupancy status; default vacant",
      },
    ],
  },

  tenant: {
    entity: "tenant",
    label: "Tenant",
    naturalKey: "phone (Kenyan mobile, normalised)",
    fields: [
      { key: "fullName", type: "string", required: true, description: "Tenant full name" },
      { key: "phone", type: "phone", required: true, description: "Tenant mobile number (the #1 matching key)" },
      { key: "email", type: "string", description: "Email address" },
      { key: "nationalId", type: "string", description: "National ID number" },
      { key: "buildingName", type: "string", ref: "buildingName", description: "Building the tenant lives in, if known" },
      { key: "unitNumber", type: "string", ref: "unitNumber", description: "Unit / house / door / room number the tenant occupies — map any column like 'Unit No.', 'Hse No.', 'House Number', 'Door', 'Room'. Values look like 'A10', 'D1', '22', 'Hse No. 22'." },
      { key: "unitType", type: "string", description: `Type of unit the tenant occupies — ${UNIT_TYPE_HINT}` },
      { key: "rentAmount", type: "number", description: "Monthly rent for the tenant's unit, in KES (used to create the unit/lease if not already present)" },
      { key: "arrearsBroughtForward", type: "number", description: "Outstanding balance / arrears owed at migration, in KES" },
      {
        key: "status",
        type: "enum",
        enumValues: ["active", "inactive", "pending", "terminated"],
        description: "Tenancy status; default active",
      },
      { key: "kraPin", type: "string", description: "KRA PIN / tax number" },
      { key: "dateOfBirth", type: "string", description: "Date of birth (keep as given)" },
      { key: "gender", type: "string", description: "Gender" },
      { key: "occupation", type: "string", description: "Occupation / job title" },
      { key: "employer", type: "string", description: "Employer / company they work for" },
      { key: "emergencyContactName", type: "string", description: "Emergency contact's name" },
      { key: "emergencyContactPhone", type: "string", description: "Emergency contact's phone (keep as given)" },
      { key: "emergencyContactRelation", type: "string", description: "Relationship of the emergency contact" },
      { key: "tenantAgreementUrl", type: "string", description: "URL/link to the tenant's signed agreement document" },
      { key: "notes", type: "string", description: "Any free-text notes about the tenant" },
    ],
  },

  lease: {
    entity: "lease",
    label: "Lease / tenancy",
    naturalKey: "tenant phone + unit number",
    fields: [
      { key: "tenantPhone", type: "phone", required: true, ref: "tenantPhone", description: "Phone of the tenant on this lease" },
      { key: "buildingName", type: "string", ref: "buildingName", description: "Building of the leased unit, if known" },
      { key: "unitNumber", type: "string", required: true, ref: "unitNumber", description: "Unit / house / door / room number being leased (e.g. 'A10', 'D1', 'Hse No. 22')" },
      { key: "startDate", type: "date", description: "Lease start date" },
      { key: "endDate", type: "date", description: "Lease end date, if any" },
      { key: "rentAmount", type: "number", required: true, description: "Monthly rent in KES" },
      { key: "depositAmount", type: "number", description: "Deposit, in KES" },
      { key: "billingDay", type: "number", description: "Day of month rent is invoiced (1–28); default 1" },
    ],
  },
};

export const IMPORT_ENTITIES: ImportEntity[] = ["landlord", "building", "unit", "tenant", "lease"];

export function getEntitySpec(entity: string): EntitySpec | null {
  return (IMPORT_SCHEMA as Record<string, EntitySpec>)[entity] ?? null;
}

/**
 * Normalise a messy unit label to its identifier. Strips leading prefixes like
 * "Hse No.", "Unit no.", "House", "Room", "Door", "Apt", "#" so values such as
 * "Hse No. 22", "Unit No. A10", "Room B2" become "22", "A10", "B2". Pure
 * identifiers like "A10" or "D1" are left unchanged.
 */
export function cleanUnitNumber(raw: string): string {
  const original = raw.trim();
  let s = original
    .replace(
      /^(house|hse|unit|room|rm|door|apartment|apt|flat|plot|stall|shop|office)\s*(no\.?|number|#)?\s*[:.\-]?\s*/i,
      "",
    )
    .replace(/^(no\.?|number|#)\s*[:.\-]?\s*/i, "")
    .trim();
  return s || original;
}

/** Is `key` a valid target field for `entity`? */
export function isValidTarget(entity: ImportEntity, key: string): boolean {
  return IMPORT_SCHEMA[entity].fields.some((f) => f.key === key);
}

// ---------------------------------------------------------------------------
// Prompt rendering — the model sees this exact target spec.
// ---------------------------------------------------------------------------
export function buildSchemaSpec(): string {
  const lines: string[] = [];
  for (const entity of IMPORT_ENTITIES) {
    const spec = IMPORT_SCHEMA[entity];
    lines.push(`## ${entity} (${spec.label}) — identified by ${spec.naturalKey}`);
    for (const f of spec.fields) {
      const bits: string[] = [f.type];
      if (f.required) bits.push("required");
      if (f.ref) bits.push("reference");
      if (f.enumValues) bits.push(`one of: ${f.enumValues.join(" | ")}`);
      lines.push(`- ${f.key} (${bits.join(", ")}): ${f.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic coercion — applied to EVERY row after the (one-shot) AI map.
// ---------------------------------------------------------------------------

/** Coerce a raw cell value to the field's type. Returns undefined if empty/invalid. */
export function coerceValue(field: FieldSpec, raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (s === "") return undefined;

  switch (field.type) {
    case "string":
      return s;
    case "phone":
      return normalizePhone(s) ?? undefined;
    case "number": {
      // Strip currency symbols, thousands separators, KES/Ksh labels.
      const n = Number(s.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean": {
      const t = s.toLowerCase();
      if (["true", "yes", "y", "1", "occupied", "active"].includes(t)) return true;
      if (["false", "no", "n", "0", "vacant", "inactive"].includes(t)) return false;
      return undefined;
    }
    case "date": {
      const ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : undefined;
    }
    case "enum": {
      const t = s.toLowerCase();
      const match = field.enumValues?.find((e) => e.toLowerCase() === t);
      return match; // undefined if no exact enum match — surfaced in validation
    }
  }
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * Validate a mapped + coerced row against the entity spec: required fields
 * present, enums valid. Invalid → the caller parks the row (never drops it).
 */
export function validateMapped(
  entity: ImportEntity,
  data: Record<string, unknown>,
  naturalKeys: Record<string, unknown>,
): ValidationResult {
  const spec = IMPORT_SCHEMA[entity];
  const missing: string[] = [];
  for (const f of spec.fields) {
    if (!f.required) continue;
    const present = f.ref ? naturalKeys[f.ref] : data[f.key];
    if (present === undefined || present === "") missing.push(f.key);
  }
  if (missing.length > 0) {
    return { ok: false, message: `Missing required: ${missing.join(", ")}` };
  }
  // billingDay range guard (lease).
  if (entity === "lease" && typeof data.billingDay === "number") {
    if (data.billingDay < 1 || data.billingDay > 28) {
      return { ok: false, message: "billingDay must be 1–28" };
    }
  }
  return { ok: true };
}
