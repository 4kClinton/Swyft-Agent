import { normalizePhone } from "./phone";

export type ParsedSms = {
  ref: string;
  amount: number;
  payerPhone?: string;
  payerName?: string;
};

/**
 * Parse an M-Pesa / bank payment-alert SMS into a normalised payment. Handles
 * the common Safaricom shape, e.g.:
 *   "QGR7XXXX Confirmed. You have received Ksh15,000.00 from JOHN DOE 0712345678
 *    on 14/6/26 at 2:02 PM ..."
 * Returns null when it can't confidently extract a ref + amount.
 */
export function parsePaymentSms(text: string): ParsedSms | null {
  if (!text) return null;

  // Transaction ref: leading alphanumeric code (e.g. "QGR7ABCD").
  const refMatch = text.match(/\b([A-Z0-9]{8,12})\b/);
  const ref = refMatch ? refMatch[1] : null;

  // Amount: "Ksh15,000.00" / "KES 15000".
  const amtMatch = text.match(/K(?:sh|ES)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amtMatch ? Number(amtMatch[1].replace(/,/g, "")) : null;

  if (!ref || amount === null || Number.isNaN(amount)) return null;

  // Payer name: "from NAME NAME" up to a phone number / "on".
  const nameMatch = text.match(
    /from\s+([A-Za-z][A-Za-z .'-]+?)(?=\s+(?:0\d|2547|\d|on\b))/i,
  );
  const payerName = nameMatch ? nameMatch[1].trim() : undefined;

  // Phone anywhere in the alert.
  const phoneMatch = text.match(/(?:\+?254|0)[17]\d{8}/);
  const payerPhone = phoneMatch
    ? (normalizePhone(phoneMatch[0]) ?? undefined)
    : undefined;

  return { ref, amount, payerName, payerPhone };
}
