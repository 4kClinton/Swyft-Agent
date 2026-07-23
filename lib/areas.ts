// Nairobi areas — the JOIN KEY between this RPMS and the swyft-customer app.
//
// This list MUST stay byte-for-byte in sync (by `key`) with
// swyft-customer/constants/areas.ts → NAIROBI_AREAS. Leads are matched to
// property managers by intersecting a lead's `area` with the areas of the
// buildings a company owns (see rules/DATA_FLOW/leads.md §3). If the two repos
// disagree on a key, that area's leads silently never match — so treat this file
// as a contract, not a convenience. Add areas to BOTH repos in the same change.

export interface Area {
  key: string;
  name: string;
}

export const NAIROBI_AREAS: Area[] = [
  { key: "imara-daima", name: "Imara Daima" },
  { key: "kahawa-wendani", name: "Kahawa Wendani" },
  { key: "kahawa-sukari", name: "Kahawa Sukari" },
  { key: "ngong", name: "Ngong" },
  { key: "kilimani", name: "Kilimani" },
  { key: "kileleshwa", name: "Kileleshwa" },
  { key: "south-b", name: "South B" },
  { key: "south-c", name: "South C" },
  { key: "westlands", name: "Westlands" },
  { key: "roysambu", name: "Roysambu" },
  { key: "embakasi", name: "Embakasi" },
  { key: "donholm", name: "Donholm" },
  { key: "rongai", name: "Ongata Rongai" },
  { key: "ruaka", name: "Ruaka" },
];

const AREA_KEYS = new Set(NAIROBI_AREAS.map((a) => a.key));

/** True if `key` is a known area key. Use to validate input server-side. */
export function isAreaKey(key: string | undefined | null): key is string {
  return !!key && AREA_KEYS.has(key);
}

/** Display name for an area key, falling back to the key itself. */
export function areaName(key: string | undefined | null): string {
  if (!key) return "";
  return NAIROBI_AREAS.find((a) => a.key === key)?.name ?? key;
}
