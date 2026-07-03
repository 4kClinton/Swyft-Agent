import { z } from "zod";
import {
  buildSchemaSpec,
  cleanUnitNumber,
  coerceValue,
  getEntitySpec,
  validateMapped,
  type FieldSpec,
  type ImportEntity,
} from "./importSchema";

// ---------------------------------------------------------------------------
// Column mapping: the AI maps arbitrary spreadsheet columns onto our schema
// ONCE per sheet (from headers + a sample); deterministic code then applies that
// mapping to every row. The model never sees or writes the full dataset.
// ---------------------------------------------------------------------------

/**
 * What the AI returns for one sheet. Kept LOOSE on purpose — strict enums/numbers
 * are the usual cause of "response did not match schema" on smaller models. We
 * normalise/validate everything deterministically in `applyMapping`.
 */
export const MappingResultSchema = z.object({
  entityType: z.string().describe("landlord | building | unit | tenant | lease | unknown"),
  confidence: z.number().nullish(),
  fieldMap: z
    .array(
      z.object({
        source: z.string().describe("the spreadsheet column header"),
        target: z.string().nullish().describe("the matching field key from the schema, or empty if none"),
      }),
    )
    .nullish()
    .describe("one entry per spreadsheet column you can map"),
  unmappedColumns: z
    .array(z.string())
    .nullish()
    .describe("source columns that have no matching field (kept, never dropped)"),
});

export type MappingResult = z.infer<typeof MappingResultSchema>;

export function buildMappingPrompt(
  headers: string[],
  sampleRows: Array<Record<string, unknown>>,
  opts: { sheetName?: string; forcedEntity?: ImportEntity; existingBuildings?: string[] } = {},
): string {
  const { sheetName, forcedEntity, existingBuildings } = opts;
  const sample = sampleRows
    .slice(0, 20)
    .map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`)
    .join("\n");

  const entityInstruction = forcedEntity
    ? `This sheet has been confirmed to represent a "${forcedEntity}". Set entityType to "${forcedEntity}" and map each column to that entity's field keys.`
    : `Decide which ONE entity this sheet represents (landlord, building, unit, tenant,
lease, or unknown if it doesn't fit), then map each column header to the matching field
key. A "landlord" sheet lists property OWNERS (the people/companies a building belongs
to), distinct from tenants who rent units.`;

  const buildingsContext =
    existingBuildings && existingBuildings.length > 0
      ? `\n\nThe user ALREADY has these buildings: ${existingBuildings
          .map((b) => `"${b}"`)
          .join(", ")}. When a column references a building, map the column whose values best match these names (don't rename — we resolve the exact match later).`
      : "";

  return `You map a landlord/property-manager's spreadsheet onto Swyft's data model.

${entityInstruction}${buildingsContext}
Use ONLY the field keys listed below. Map a column to '' (and list it in
unmappedColumns) when nothing fits — never invent fields, never drop data.

These are Kenyan rentals: money is KES, phones are Kenyan mobiles. Relationship
fields (buildingName, unitNumber, tenantPhone) link records together.

TARGET SCHEMA
${buildSchemaSpec()}

SHEET${sheetName ? `: "${sheetName}"` : ""}
Headers: ${headers.join(", ")}

Sample rows:
${sample}`;
}

export interface StagedRow {
  entityType: ImportEntity | "unknown";
  rawRow: Record<string, unknown>;
  data: Record<string, unknown>;
  extra: Record<string, unknown>;
  naturalKeys: {
    landlordName?: string;
    buildingName?: string;
    unitNumber?: string;
    tenantPhone?: string;
  };
  rowState: "parked" | "ready";
  include: boolean;
  validation: { ok: boolean; message?: string };
}

// Entities with a free-text column we can park leftover info into so it stays visible.
const FREE_TEXT_FIELD: Partial<Record<ImportEntity, string>> = {
  tenant: "notes",
  building: "description",
};

/**
 * Apply one sheet's mapping to all its rows (deterministic, free, reliable).
 * Coerces by field type, routes reference fields into naturalKeys, preserves
 * unmapped columns in `extra` (+ folds them into a free-text field where one
 * exists), validates, and parks anything unknown/invalid.
 */
/** Normalise the model's free-text entity label to a canonical entity. */
function normalizeEntity(raw: string): ImportEntity | "unknown" {
  const v = (raw ?? "").toLowerCase().trim().replace(/s$/, "");
  return v === "landlord" || v === "building" || v === "unit" || v === "tenant" || v === "lease"
    ? v
    : "unknown";
}

export function applyMapping(
  mapping: MappingResult,
  rows: Array<Record<string, unknown>>,
): StagedRow[] {
  const entity = normalizeEntity(mapping.entityType);
  const spec = getEntitySpec(entity); // null for "unknown"
  const lowConfidence = (mapping.confidence ?? 1) < 0.5;

  // header -> FieldSpec (only valid, recognised targets)
  const targetBySource = new Map<string, FieldSpec>();
  if (spec) {
    for (const m of mapping.fieldMap ?? []) {
      if (!m.target) continue;
      const field = spec.fields.find((f) => f.key === m.target);
      if (field) targetBySource.set(m.source, field);
    }
  }

  return rows.map((rawRow) => {
    if (!spec) {
      return {
        entityType: "unknown" as const,
        rawRow,
        data: {},
        extra: { ...rawRow },
        naturalKeys: {},
        rowState: "parked" as const,
        include: false,
        validation: { ok: false, message: "Unrecognised data — set the type to import it" },
      };
    }

    const data: Record<string, unknown> = {};
    const naturalKeys: StagedRow["naturalKeys"] = {};
    const extra: Record<string, unknown> = {};
    const consumed = new Set<string>();

    for (const [source, value] of Object.entries(rawRow)) {
      const field = targetBySource.get(source);
      if (!field) continue;
      const coerced = coerceValue(field, value);
      consumed.add(source);
      if (coerced === undefined) continue;
      if (field.ref) {
        const val = String(coerced);
        naturalKeys[field.ref] = field.ref === "unitNumber" ? cleanUnitNumber(val) : val;
      } else {
        data[field.key] = coerced;
      }
    }

    // Everything not consumed is preserved verbatim.
    for (const [source, value] of Object.entries(rawRow)) {
      if (!consumed.has(source) && value !== null && value !== undefined && String(value).trim() !== "") {
        extra[source] = value;
      }
    }

    // Backfill canonical natural keys from the entity's own identity fields.
    if (entity === "building" && typeof data.name === "string") {
      naturalKeys.buildingName ??= data.name;
    }
    if (entity === "tenant" && typeof data.phone === "string") {
      naturalKeys.tenantPhone ??= data.phone;
    }

    // Fold leftover columns into a free-text field if the entity has an empty one,
    // so nothing important hides only in `extra`.
    const ftField = FREE_TEXT_FIELD[entity as ImportEntity];
    const extraKeys = Object.keys(extra);
    if (ftField && extraKeys.length > 0 && !data[ftField]) {
      data[ftField] = extraKeys.map((k) => `${k}: ${extra[k]}`).join("; ");
    }

    const validation = validateMapped(entity as ImportEntity, data, naturalKeys);
    const message =
      validation.ok && lowConfidence
        ? "Low confidence — please confirm this is correct"
        : validation.message;

    return {
      entityType: entity,
      rawRow,
      data,
      extra,
      naturalKeys,
      rowState: validation.ok ? ("ready" as const) : ("parked" as const),
      include: validation.ok,
      validation: { ok: validation.ok, message },
    };
  });
}
