// Branded PDF builders for receipts and invoices (issues #3, #10). Pure
// pdf-lib — no Node builtins — so it runs in the default Convex runtime. The
// Swyft logo is embedded from a base64 constant (see logoData.ts).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SWYFT_LOGO_PNG_BASE64 } from "./logoData";

const BRAND = rgb(0.05, 0.5, 0.32); // emerald
const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.45, 0.48, 0.52);
const LINE = rgb(0.85, 0.87, 0.89);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;

export interface DocCompany {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}
export interface DocParty {
  name: string;
  phone?: string;
  email?: string;
  unit?: string;
  building?: string;
}
export interface ReceiptPdfData {
  company: DocCompany;
  party: DocParty;
  number: string;
  issuedAt: number;
  amount: number;
  paymentRef?: string;
  paymentSource?: string;
  paidAt?: number;
  lines: { label: string; amount: number }[];
  unallocated?: number;
}
export interface InvoicePdfData {
  company: DocCompany;
  party: DocParty;
  number: string; // short id
  kind: string;
  description?: string;
  period?: string;
  amount: number;
  balance: number;
  status: string;
  dueDate: number;
  issuedAt: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const trimmed = b64.replace(/=+$/, "");
  const len = trimmed.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = lookup[trimmed.charCodeAt(i)];
    const e1 = lookup[trimmed.charCodeAt(i + 1)];
    const e2 = lookup[trimmed.charCodeAt(i + 2)];
    const e3 = lookup[trimmed.charCodeAt(i + 3)];
    bytes[p++] = (e0 << 2) | (e1 >> 4);
    if (i + 2 < len) bytes[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (i + 3 < len) bytes[p++] = ((e2 & 3) << 6) | e3;
  }
  return bytes;
}

// Standard (Helvetica) fonts can only encode WinAnsi. Replace control chars
// (incl. the newlines that crash widthOfTextAtSize) with spaces, and drop the
// undefined WinAnsi slots and anything outside Latin-1, so user-entered text
// never throws. Uses numeric char-code checks only (no literal control bytes).
const WINANSI_UNDEFINED = new Set([129, 141, 143, 144, 157]);
function clean(s: string | undefined | null): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === undefined) continue;
    if (c === 9 || c === 10 || c === 13) {
      out += " ";
      continue;
    }
    if (c < 32 || c === 127) continue; // other control chars
    if (c > 255) continue; // outside Latin-1 (emoji, etc.)
    if (WINANSI_UNDEFINED.has(c)) continue;
    out += ch;
  }
  return out.replace(/ {2,}/g, " ").trim();
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

async function startDoc(title: string, company: DocCompany) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo (scaled to a 34pt height).
  try {
    const logo = await pdf.embedPng(base64ToBytes(SWYFT_LOGO_PNG_BASE64));
    const h = 34;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: MARGIN, y: A4.h - MARGIN - h, width: w, height: h });
  } catch {
    page.drawText("Swyft", {
      x: MARGIN,
      y: A4.h - MARGIN - 24,
      size: 22,
      font: bold,
      color: BRAND,
    });
  }

  // Company block (right-aligned).
  const right = A4.w - MARGIN;
  let cy = A4.h - MARGIN - 4;
  const rline = (raw: string, f = font, size = 9, color = MUTED) => {
    const text = clean(raw);
    if (!text) return;
    const tw = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: right - tw, y: cy, size, font: f, color });
    cy -= size + 3;
  };
  rline(company.name, bold, 11, INK);
  rline(company.address ?? "");
  rline(company.phone ?? "");
  rline(company.email ?? "");

  // Title.
  let y = A4.h - MARGIN - 70;
  page.drawText(title, { x: MARGIN, y, size: 24, font: bold, color: INK });
  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: right, y },
    thickness: 2,
    color: BRAND,
  });
  y -= 24;

  return { pdf, page, font, bold, right, y };
}

function drawParty(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  party: DocParty,
  yStart: number,
): number {
  let y = yStart;
  page.drawText("BILL TO", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
  y -= 15;
  page.drawText(clean(party.name) || "Tenant", { x: MARGIN, y, size: 12, font: bold, color: INK });
  y -= 14;
  const sub = [
    party.phone,
    party.email,
    [party.building, party.unit && `Unit ${party.unit}`].filter(Boolean).join(" - "),
  ]
    .map((s) => clean(s ?? ""))
    .filter(Boolean);
  for (const s of sub) {
    page.drawText(s, { x: MARGIN, y, size: 9, font, color: MUTED });
    y -= 12;
  }
  return y - 12;
}

function rightText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  raw: string,
  right: number,
  y: number,
  size: number,
  color = INK,
) {
  const text = clean(raw);
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export async function buildReceiptPdf(d: ReceiptPdfData): Promise<Uint8Array> {
  const { pdf, page, font, bold, right, y: y0 } = await startDoc(
    "PAYMENT RECEIPT",
    d.company,
  );

  rightText(page, bold, `Receipt ${d.number}`, right, y0 + 8, 11, INK);
  rightText(page, font, `Issued ${fmtDate(d.issuedAt)}`, right, y0 - 6, 9, MUTED);

  let y = drawParty(page, font, bold, d.party, y0);

  // Allocation table header.
  page.drawText("Applied to", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
  rightText(page, bold, "Amount", right, y, 8, MUTED);
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 16;

  const rows = d.lines.length ? d.lines : [{ label: "Unallocated credit", amount: d.amount }];
  for (const row of rows) {
    page.drawText(clean(row.label) || "Payment", { x: MARGIN, y, size: 10, font, color: INK });
    rightText(page, font, kes(row.amount), right, y, 10, INK);
    y -= 16;
  }
  if (d.unallocated && d.unallocated > 0) {
    page.drawText("Unallocated (credit on account)", { x: MARGIN, y, size: 10, font, color: MUTED });
    rightText(page, font, kes(d.unallocated), right, y, 10, MUTED);
    y -= 16;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 22;
  page.drawText("TOTAL PAID", { x: MARGIN, y, size: 12, font: bold, color: INK });
  rightText(page, bold, kes(d.amount), right, y - 1, 14, BRAND);

  y -= 40;
  const meta = [
    d.paymentRef && `Payment ref: ${d.paymentRef}`,
    d.paymentSource && `Channel: ${d.paymentSource}`,
    d.paidAt && `Paid: ${fmtDate(d.paidAt)}`,
  ].filter(Boolean) as string[];
  for (const m of meta) {
    page.drawText(clean(m), { x: MARGIN, y, size: 9, font, color: MUTED });
    y -= 12;
  }

  drawFooter(page, font);
  return await pdf.save();
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const { pdf, page, font, bold, right, y: y0 } = await startDoc("INVOICE", d.company);

  rightText(page, bold, `Invoice ${d.number}`, right, y0 + 8, 11, INK);
  rightText(page, font, `Due ${fmtDate(d.dueDate)}`, right, y0 - 6, 9, MUTED);

  let y = drawParty(page, font, bold, d.party, y0);

  page.drawText("Description", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
  rightText(page, bold, "Amount", right, y, 8, MUTED);
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 16;

  const kindLabel = d.kind.charAt(0).toUpperCase() + d.kind.slice(1);
  const label = d.description || (d.period ? `${kindLabel} - ${d.period}` : kindLabel);
  page.drawText(clean(label) || "Charge", { x: MARGIN, y, size: 10, font, color: INK });
  rightText(page, font, kes(d.amount), right, y, 10, INK);
  y -= 24;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: LINE });

  y -= 22;
  page.drawText("Balance due", { x: MARGIN, y, size: 12, font: bold, color: INK });
  rightText(page, bold, kes(d.balance), right, y - 1, 14, d.balance <= 0 ? BRAND : INK);
  y -= 22;
  page.drawText(`Status: ${clean(d.status)}`, { x: MARGIN, y, size: 9, font, color: MUTED });

  drawFooter(page, font);
  return await pdf.save();
}

function drawFooter(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  page.drawText("Generated by Swyft - automated rent reconciliation.", {
    x: MARGIN,
    y: MARGIN - 6,
    size: 8,
    font,
    color: MUTED,
  });
}
