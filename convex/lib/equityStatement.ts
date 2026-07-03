/**
 * Deterministic Equity bank-statement adapter (NO AI). Two layers:
 *
 *   1. `reconstructLines` — GENERIC and bank-agnostic. PDF text comes out of
 *      pdfjs as positioned glyph runs, not rows; we cluster items by their
 *      y-coordinate into visual lines and order each line's cells by x. This is
 *      the "use the x-coordinate, not naive concatenation" requirement and is
 *      safe to rely on for any tabular statement.
 *
 *   2. `parseEquityStatement` — maps reconstructed lines → normalised rows.
 *      ⚠️ CALIBRATION GATE: the field heuristics below are GENERIC (find a date
 *      token, find money tokens, find an M-Pesa phone) and are PROVISIONAL until
 *      verified against a real Equity statement. Do NOT hardcode Equity-specific
 *      column x-positions or narration formats until the raw reconstructed table
 *      from an actual PDF has been inspected. See plan task "GATE: Equity adapter
 *      regex from real sample".
 */

export type TextItem = { str: string; x: number; y: number };

/** A reconstructed visual line: its cells left-to-right + the joined text. */
export type Line = { y: number; cells: { x: number; str: string }[]; text: string };

export type ParsedRow = {
  date: number; // epoch ms (0 if the line had no parseable date)
  amount: number; // positive KES
  direction: "credit" | "debit";
  ref: string;
  payerName?: string;
  payerPhone?: string;
  rawLine: string;
};

/**
 * Cluster positioned text items into visual lines by y-coordinate, then order
 * each line left-to-right by x. `yTolerance` absorbs sub-pixel baseline jitter
 * within a single row.
 */
export function reconstructLines(items: TextItem[], yTolerance = 2): Line[] {
  const buckets: Line[] = [];
  // Top-to-bottom: PDF y grows upward, so sort descending.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    if (!it.str.trim() && it.str !== " ") continue;
    const line = buckets.find((l) => Math.abs(l.y - it.y) <= yTolerance);
    if (line) {
      line.cells.push({ x: it.x, str: it.str });
    } else {
      buckets.push({ y: it.y, cells: [{ x: it.x, str: it.str }], text: "" });
    }
  }
  for (const l of buckets) {
    l.cells.sort((a, b) => a.x - b.x);
    l.text = l.cells
      .map((c) => c.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return buckets;
}

// --- Generic token extractors (provisional until Equity calibration) --------

const PHONE_RE = /(?:254|\+254|0)?7\d{8}/; // Kenyan M-Pesa, normalised downstream
const MONEY_RE = /-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2}/g;
// dd/mm/yyyy or dd-mm-yyyy or yyyy-mm-dd
const DATE_RE =
  /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;

function parseMoney(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function parseDate(text: string): number {
  const m = DATE_RE.exec(text);
  if (!m) return 0;
  let y: number, mo: number, d: number;
  if (m[4]) {
    // yyyy-mm-dd
    y = Number(m[4]);
    mo = Number(m[5]);
    d = Number(m[6]);
  } else {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += 2000;
  }
  const t = Date.parse(
    `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+03:00`,
  );
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Map reconstructed lines → normalised statement rows. GENERIC heuristics:
 *   - a row is a transaction line if it carries a date AND at least one money token;
 *   - direction is inferred from an explicit Dr/Cr or +/- marker, else from a
 *     debit/credit column split when present (calibrated against a real sample);
 *   - the payer phone is any embedded Kenyan mobile; the narration (line minus the
 *     recognised date/money/phone tokens) is the provisional payer name;
 *   - `ref` falls back to a stable hash of the raw line when the statement carries
 *     no per-row reference, so `recordObserved` idempotency still holds.
 */
export function parseEquityStatement(lines: Line[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const text = line.text;
    const date = parseDate(text);
    const money = text.match(MONEY_RE) ?? [];
    if (!date || money.length === 0) continue; // not a transaction line

    // Provisional: the transaction amount is the first money token; the last is
    // typically the running balance. Calibrate column choice against the sample.
    const amountRaw = money[0];
    if (!amountRaw) continue;
    const amount = Math.abs(parseMoney(amountRaw));
    if (!Number.isFinite(amount) || amount === 0) continue;

    const direction: "credit" | "debit" =
      /\bcr\b|\bcredit\b|\+/i.test(text) && !/\bdr\b|\bdebit\b/i.test(text)
        ? "credit"
        : /\bdr\b|\bdebit\b|-/i.test(text)
          ? "debit"
          : amountRaw.startsWith("-")
            ? "debit"
            : "credit";

    const phoneMatch = PHONE_RE.exec(text);
    const payerPhone = phoneMatch ? phoneMatch[0] : undefined;

    // Narration / payer name = the line with date, money and phone stripped out.
    let narration = text
      .replace(DATE_RE, " ")
      .replace(MONEY_RE, " ")
      .replace(PHONE_RE, " ")
      .replace(/\b(dr|cr|debit|credit)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (narration.length > 80) narration = narration.slice(0, 80);

    rows.push({
      date,
      amount,
      direction,
      ref: extractRef(text) ?? `eq-${hashLine(text)}`,
      payerName: narration || undefined,
      payerPhone,
      rawLine: text,
    });
  }
  return rows;
}

/** Equity transaction refs look like alphanumeric tokens; provisional grab. */
function extractRef(text: string): string | undefined {
  const m = text.match(/\b[A-Z0-9]{8,}\b/);
  return m ? m[0] : undefined;
}

/** Tiny stable hash (djb2) — only for synthesising a dedupe ref when none exists. */
function hashLine(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
