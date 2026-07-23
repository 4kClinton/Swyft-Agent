// HMAC-SHA256 hex signing for the customer-sync surface. The swyft-customer
// backend verifies this digest (keyed by SYNC_SHARED_SECRET) on every request
// it receives from us — vacancy publishes, taken callbacks, and media uploads.
// crypto.subtle runs in the default Convex runtime, so callers need no "use node".
export async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time compare to avoid leaking the signature via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// Verify a hex HMAC signature over `raw`. Used on inbound calls FROM the
// customer backend (e.g. lead pushes to /api/leads/upsert).
export async function verifyHmac(
  raw: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const expected = await hmacHex(raw, secret);
  return timingSafeEqual(expected, signature);
}
