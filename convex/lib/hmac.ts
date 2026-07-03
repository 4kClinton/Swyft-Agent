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
