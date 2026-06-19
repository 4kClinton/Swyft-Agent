/**
 * Normalise a Kenyan M-Pesa number to the canonical `2547########` /
 * `2541########` form (12 digits, no `+`). This MUST match the format the
 * Jenga IPN payload uses (e.g. "254712345678") so phone-matching works — it is
 * the #1 reconciliation key (1stPlan.md §5.4). Returns null if it can't be
 * confidently normalised so callers can reject invalid input.
 */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  let s = input.replace(/[\s\-()]/g, "").trim();
  s = s.replace(/^\+/, "");

  // 07XXXXXXXX or 01XXXXXXXX  → 2547######## / 2541########
  if (/^0[17]\d{8}$/.test(s)) return "254" + s.slice(1);
  // 7XXXXXXXX or 1XXXXXXXX (9 digits, leading 0 dropped)
  if (/^[17]\d{8}$/.test(s)) return "254" + s;
  // already 2547######## / 2541########
  if (/^254[17]\d{8}$/.test(s)) return s;

  return null;
}

export function isValidKenyanMobile(input: string | undefined | null): boolean {
  return normalizePhone(input) !== null;
}
