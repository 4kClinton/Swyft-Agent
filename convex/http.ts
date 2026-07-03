import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { parsePaymentSms } from "./lib/smsParse";

const http = httpRouter();

// Convex Auth endpoints (/.well-known/..., /api/auth/*).
auth.addHttpRoutes(http);

// ---------------------------------------------------------------------------
// Equity Jenga IPN — inbound credit notifications (jengaIpnSpike.md §3.2).
// Jenga authenticates to US with HTTP Basic Auth (the user/pass we registered).
// Design rules: never trust the body before auth; ack fast; reconcile async;
// idempotent on transactionReference; store the raw payload verbatim.
// ---------------------------------------------------------------------------
http.route({
  path: "/jenga/ipn",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // The Basic-Auth secret is the ONLY thing protecting this endpoint (Jenga
    // offers no payload signature), so refuse anything not over HTTPS.
    if (!isHttps(request)) {
      return new Response("HTTPS required", { status: 400 });
    }

    // Read credentials from env only — never logged, never hardcoded. Fail
    // CLOSED if unconfigured, so a missing env var can't be auth'd as
    // "undefined:undefined".
    const user = process.env.JENGA_IPN_USER;
    const pass = process.env.JENGA_IPN_PASS;
    if (!user || !pass) {
      return new Response("Unauthorized", { status: 401 });
    }
    const expected = "Basic " + btoa(`${user}:${pass}`);
    const provided = request.headers.get("authorization") ?? "";
    if (!(await timingSafeEqualStr(provided, expected))) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Real Jenga IPN shape (confirmed from docs): nested customer/transaction/bank.
    // NOTE: do NOT log `p`, payer PII, or the raw payload to stdout in prod — the
    // verbatim body is persisted to `payments.raw` (+ ipnDebug) for audit instead.
    const p = await request.json();
    const tx = p.transaction ?? {};
    const cust = p.customer ?? {};
    const bank = p.bank ?? {};
    const bill = p.bill ?? {};

    // Defensive account extraction. Jenga's docs say the account number arrives
    // in `transaction.billNumber` ("This is the account number") and `bank.account`
    // is often null, but their field table is internally inconsistent — so try
    // billNumber first, then bill.account, then bank.account. The first ~50 raw
    // payloads are mirrored to ipnDebug (in recordObserved) to confirm the field.
    const account = String(
      tx.billNumber ?? bill.account ?? bank.account ?? "",
    ).trim();

    // Only record SUCCESSFUL CREDITS. Ignore failures and debits
    // (bank.transactionType "C" = credit, "D" = debit) so we never count
    // money leaving the account as rent received. 200 so Jenga stops retrying.
    const status = String(tx.status ?? "").toUpperCase();
    const isCredit =
      String(bank.transactionType ?? "C").toUpperCase() === "C";
    if (status === "SUCCESS" && isCredit) {
      await ctx.runMutation(internal.payments.recordObserved, {
        source: "jenga",
        ref: String(tx.reference ?? bank.reference ?? crypto.randomUUID()),
        amount: Number(tx.amount ?? 0),
        currency: String(tx.currency ?? "KES"),
        payerPhone: cust.mobileNumber, // "254712345678"
        payerName: cust.name,
        account,
        paidAt: Date.parse(tx.date ?? "") || Date.now(),
        status,
        raw: p,
      });
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

// ---------------------------------------------------------------------------
// SMS-forwarding adapter (universal fallback, 1stPlan.md §5.3 D). A dedicated
// phone forwards payment-alert SMS to this endpoint with a per-deploy secret.
// Body: { token, text, account }. We parse the alert into a payment event.
// ---------------------------------------------------------------------------
http.route({
  path: "/sms/forward",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    if (
      !process.env.SMS_FORWARD_TOKEN ||
      body.token !== process.env.SMS_FORWARD_TOKEN
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    const parsed = parsePaymentSms(String(body.text ?? ""));
    if (!parsed) {
      return new Response(JSON.stringify({ ok: false, reason: "unparsed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    await ctx.runMutation(internal.payments.recordObserved, {
      source: "sms",
      ref: parsed.ref,
      amount: parsed.amount,
      currency: "KES",
      payerPhone: parsed.payerPhone,
      payerName: parsed.payerName,
      account: String(body.account ?? ""),
      paidAt: Date.now(),
      status: "SUCCESS",
      raw: { text: body.text },
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

// ---------------------------------------------------------------------------
// Lipana webhook — boosts & subscriptions ONLY (never rent). Verify the
// shared secret, then settle the referenced boost. (1stPlan.md §4.2)
// ---------------------------------------------------------------------------
http.route({
  path: "/api/lipana/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const sig = request.headers.get("x-lipana-signature") ?? "";
    const ok = await verifyHmac(
      raw,
      sig,
      process.env.LIPANA_WEBHOOK_SECRET ?? "",
    );
    if (!ok) return new Response("Unauthorized", { status: 401 });

    const evt = JSON.parse(raw);
    // reference shape: "boost:<boostId>" | "invoice:<invoiceId>"
    if (
      /success/i.test(String(evt.status ?? evt.event ?? "")) &&
      typeof evt.reference === "string" &&
      evt.reference.startsWith("boost:")
    ) {
      await ctx.runMutation(internal.boosts.settle, {
        boostId: evt.reference.slice("boost:".length),
        lipanaRef: String(evt.transactionId ?? evt.reference),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

// ---------------------------------------------------------------------------
// Sync callback from swyft-customer (listing status + inquiries, §3.1 step 4).
// ---------------------------------------------------------------------------
http.route({
  path: "/api/sync/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const sig = request.headers.get("x-swyft-signature") ?? "";
    const ok = await verifyHmac(raw, sig, process.env.SYNC_SHARED_SECRET ?? "");
    if (!ok) return new Response("Unauthorized", { status: 401 });

    const evt = JSON.parse(raw);
    await ctx.runMutation(internal.marketplace.handleCallback, {
      externalRef: String(evt.externalRef ?? ""),
      kind: String(evt.kind ?? ""), // "status" | "inquiry"
      reelId: evt.reelId ? String(evt.reelId) : undefined,
      status: evt.status ? String(evt.status) : undefined,
      inquiry: evt.inquiry,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

// ---------------------------------------------------------------------------
// KCB Buni IPN — inbound credit notifications (swagger: InstantPaymentNotification).
// KCB POSTs flat `account-notification` / `till-notification` bodies and expects a
// specific success response. Register your callback base as
//   https://<deployment>.convex.site/kcb
// so KCB hits /kcb/account-notification and /kcb/till-notification.
// Auth: enforced only if KCB_IPN_USER/PASS are set (Basic) — set them for prod.
// ---------------------------------------------------------------------------
function kcbAuthOk(request: Request): boolean {
  const user = process.env.KCB_IPN_USER;
  const pass = process.env.KCB_IPN_PASS;
  if (!user || !pass) return true; // UAT: no creds configured yet → accept.
  const expected = "Basic " + btoa(`${user}:${pass}`);
  return (request.headers.get("authorization") ?? "") === expected;
}

/** Parse compact bank timestamps: "20250519133100" (yyyyMMddHHmmss) or
 * "202111110305" (yyyyMMddHHmm). Shared by KCB, Co-op and Stanbic (all EAT/+03:00). */
function parseCompactTimestamp(s: unknown): number {
  const d = String(s ?? "").replace(/\D/g, "");
  if (d.length < 12) return Date.now();
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(
    8,
    10,
  )}:${d.slice(10, 12)}:${d.length >= 14 ? d.slice(12, 14) : "00"}+03:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Date.now() : t;
}

// Account IPN — paid into a bank account (creditAccountIdentifier).
http.route({
  path: "/kcb/account-notification",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!kcbAuthOk(request)) return new Response("Unauthorized", { status: 401 });
    const p = await request.json();
    await ctx.runMutation(internal.payments.recordObserved, {
      source: "kcb",
      ref: String(p.transactionReference ?? p.requestId ?? crypto.randomUUID()),
      amount: Number(p.transactionAmount ?? 0),
      currency: String(p.currency ?? "KES"),
      payerPhone: p.customerMobileNumber, // "2547..."
      payerName: p.customerName,
      account: String(
        p.creditAccountIdentifier ?? p.tillNumber ?? p.organizationShortCode ?? "",
      ),
      paidAt: parseCompactTimestamp(p.timestamp),
      status: "SUCCESS",
      raw: p,
    });
    return new Response(
      JSON.stringify({
        transactionID: String(p.requestId ?? p.transactionReference ?? ""),
        statusCode: "0",
        statusMessage: "Notification received successfully",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

// Till IPN — paid to a till (nested header/requestPayload.notificationData).
http.route({
  path: "/kcb/till-notification",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!kcbAuthOk(request)) return new Response("Unauthorized", { status: 401 });
    const p = await request.json();
    const header = p.header ?? {};
    const nd =
      p.requestPayload?.additionalData?.notificationData ??
      p.requestPayload?.primaryData ??
      {};
    await ctx.runMutation(internal.payments.recordObserved, {
      source: "kcb",
      ref: String(
        header.originatorConversationID ??
          header.messageID ??
          nd.transactionReference ??
          crypto.randomUUID(),
      ),
      amount: Number(nd.transactionAmount ?? nd.amount ?? 0),
      currency: String(nd.currency ?? "KES"),
      payerPhone: nd.debitMSISDN ?? nd.customerMobileNumber,
      payerName: nd.customerName,
      account: String(nd.businessKey ?? p.requestPayload?.primaryData?.businessKey ?? ""),
      paidAt: parseCompactTimestamp(header.timeStamp),
      status: "SUCCESS",
      raw: p,
    });
    return new Response(
      JSON.stringify({
        header: {
          messageID: String(header.messageID ?? ""),
          originatorConversationID: String(header.originatorConversationID ?? ""),
          statusCode: "0",
          statusMessage: "Notification received successfully",
        },
        responsePayload: {
          transactionInfo: {
            transactionId: String(header.originatorConversationID ?? header.messageID ?? ""),
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

// Optional pre-payment validation hook — accept all (never gate a payment). If
// you later want to validate a bill ref against a tenant, do the lookup here.
http.route({
  path: "/kcb/validation",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    if (!kcbAuthOk(request)) return new Response("Unauthorized", { status: 401 });
    const p = await request.json();
    return new Response(
      JSON.stringify({
        transactionID: String(p.requestId ?? ""),
        statusCode: "0",
        statusMessage: "Success",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

// ---------------------------------------------------------------------------
// Co-operative Bank Instant Notification Service (INS) — inbound credit/debit
// notifications (rules/coop swagger: INSTransactionSimulationRequest).
// Co-op POSTs the transaction event to OUR registered NotificationEndpoint and
// authenticates with a Basic-Auth credential carried in the `EndpointCredential`
// header (the credential we registered with Co-op). Register your endpoint as
//   https://<deployment>.convex.site/coop/ins
// Co-op INS carries NO payer MSISDN/name — only AccountNumber, Narration and
// CustMemo — so most rows land in the manual-assign queue until matched once.
// Design rules (same as Jenga/KCB): never trust the body before auth; record
// only successful CREDITS; ack fast; idempotent on the bank's TransactionId.
// ---------------------------------------------------------------------------
function coopAuthOk(request: Request): boolean {
  const user = process.env.COOP_INS_USER;
  const pass = process.env.COOP_INS_PASS;
  if (!user || !pass) return true; // UAT: no creds configured yet → accept.
  const expected = btoa(`${user}:${pass}`);
  // Co-op may send the bare base64 or a "Basic <base64>" form.
  const got = (request.headers.get("EndpointCredential") ?? "").replace(
    /^Basic\s+/i,
    "",
  );
  return got === expected;
}

http.route({
  path: "/coop/ins",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!coopAuthOk(request)) return new Response("Unauthorized", { status: 401 });

    const p = await request.json();
    const eventType = String(p.EventType ?? "").toUpperCase();

    // Only record CREDITS — never count money leaving the account as rent.
    if (eventType === "CREDIT") {
      await ctx.runMutation(internal.payments.recordObserved, {
        source: "coop",
        // Co-op's processed transaction number is the stable dedupe key; fall
        // back to the payment ref, then the per-message reference.
        ref: String(
          p.TransactionId ?? p.PaymentRef ?? p.MessageReference ?? crypto.randomUUID(),
        ),
        amount: Number(p.Amount ?? 0),
        currency: String(p.Currency ?? "KES"),
        // INS exposes no payer MSISDN/name; matching relies on the narration
        // (manual-assign queue learns the phone on first match).
        payerPhone: undefined,
        payerName: undefined,
        account: String(p.AccountNumber ?? ""),
        paidAt: parseCompactTimestamp(p.TransactionDate),
        status: "SUCCESS",
        raw: p,
      });
    }

    // Synchronous SuccessAcknowledgement shape Co-op expects.
    return new Response(
      JSON.stringify({
        MessageReference: String(p.MessageReference ?? p.TransactionId ?? ""),
        MessageDateTime: new Date().toISOString(),
        MessageCode: "0",
        MessageDescription: "Acknowledged",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

// ---------------------------------------------------------------------------
// Stanbic Transaction Notification — inbound credit notifications
// (rules/stanbic transaction-notification-api_1.0.0.json). Stanbic POSTs to OUR
// registered CallbackUrl. The default gateway template delivers the flat
// `OutboundTransactionNotificationRequest` shape (M-Pesa-C2B-like: TransID,
// TransAmount "KES 1,234.00", BusinessAccountNo, MSISDN, Narrative...). We also
// tolerate the rich nested `Letter` shape. It expects a BackendResponse:
//   {"ResultCode":0,"ResultDesc":"Accepted"}
// Register your endpoint as https://<deployment>.convex.site/stanbic/ins
// Auth: Stanbic uses an API key (X-IBM-Client-Id header or the ApiKey body
// field). Enforced only if STANBIC_IPN_SECRET is set (UAT-friendly).
// Direction: the default outbound template DROPS ActionType, so we record
// unless direction is explicitly DEBIT (only present in the Letter shape).
// ---------------------------------------------------------------------------
function stanbicAuthOk(request: Request, body: any): boolean {
  const secret = process.env.STANBIC_IPN_SECRET;
  if (!secret) return true; // UAT: no key configured yet → accept.
  const headerKey = request.headers.get("X-IBM-Client-Id");
  const bodyKey = body?.ApiKey ?? body?.Letter?.ApiKey;
  return headerKey === secret || bodyKey === secret;
}

/** Flatten loose XML (<Tag>value</Tag>) into a key→value map. Stanbic's
 * ClientFormat can be XML or JSON; this lets the callback handle either. Leaf
 * tags only (good enough for the flat notification payload); namespaces dropped. */
function parseLooseXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z0-9_.:-]+)\b[^>]*>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1].includes(":") ? m[1].split(":").pop()! : m[1];
    out[key] = m[2].trim();
  }
  return out;
}

/** Parse Stanbic money strings like "KES 1,234.00" → { amount, currency }. */
function parseStanbicAmount(s: unknown): { amount: number; currency: string } {
  const str = String(s ?? "").trim();
  const m = str.match(/^([A-Za-z]{3})?\s*([\d,]+(?:\.\d+)?)/);
  const currency = (m?.[1] ?? "KES").toUpperCase();
  const amount = m ? Number(m[2].replace(/,/g, "")) : 0;
  return { amount: Number.isNaN(amount) ? 0 : amount, currency };
}

/** Parse Stanbic dates like "10/03/2020 at 09:11AM" (dd/MM/yyyy, EAT). */
function parseStanbicDate(s: unknown): number {
  const str = String(s ?? "").trim();
  const m = str.match(
    /(\d{2})\/(\d{2})\/(\d{4})(?:\s+at\s+(\d{2}):(\d{2})\s*([AP]M))?/i,
  );
  if (!m) return Date.now();
  const [, dd, mm, yyyy, hh, min, ap] = m;
  let hour = hh ? Number(hh) : 0;
  if (ap?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (ap?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const iso = `${yyyy}-${mm}-${dd}T${String(hour).padStart(2, "0")}:${
    min ?? "00"
  }:00+03:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Date.now() : t;
}

http.route({
  path: "/stanbic/ins",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();

    // To inspect an unknown Stanbic contract, use the capped ipnDebug table (the
    // verbatim body is persisted via recordObserved) — never console.log the raw
    // body, content-type, or X-IBM-Client-Id: that leaks payer PII and the auth
    // secret to stdout/log retention (DPA exposure).

    // Stanbic ClientFormat may be JSON or XML — accept either.
    let p: any;
    try {
      p = JSON.parse(raw);
    } catch {
      p = parseLooseXml(raw);
    }

    if (!stanbicAuthOk(request, p)) return new Response("Unauthorized", { status: 401 });

    // Support the flat outbound shape, the nested Letter shape, or flattened XML.
    const L = p.Letter ?? p;
    const action = String(L.ActionType ?? "").toUpperCase();
    const { amount, currency } = parseStanbicAmount(L.TxnAmount ?? L.TransAmount);

    // Record unless explicitly a DEBIT (direction absent in the default template).
    if (action !== "DEBIT") {
      await ctx.runMutation(internal.payments.recordObserved, {
        source: "stanbic",
        ref: String(
          L.OurTxnReference ??
            L.TransID ??
            L.ThirdPartyRef ??
            L.ThirdPartyTransID ??
            crypto.randomUUID(),
        ),
        amount,
        currency,
        payerPhone: L.MSISDN, // "2547..." — enables auto-matching
        payerName: L.CustomerName ?? L.FirstName,
        account: String(L.AccountNo ?? L.BusinessAccountNo ?? L.BusinessShortCode ?? ""),
        paidAt: parseStanbicDate(L.Date ?? L.TransTime),
        status: "SUCCESS",
        raw: p,
      });
    }

    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

/**
 * Constant-time string comparison. Hashes both sides with SHA-256 first so that
 * neither the length nor the content of the secret leaks through timing. Used to
 * compare the inbound Basic-Auth header against the expected credential.
 */
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Enforce that a request arrived over HTTPS. The Jenga IPN's only protection is
 * a Basic-Auth secret, so it must never travel in cleartext. Convex serves
 * httpAction routes over https in production; we read the forwarded proto and
 * fall back to the request URL's scheme.
 */
function isHttps(request: Request): boolean {
  const fwd = request.headers.get("x-forwarded-proto");
  if (fwd) return fwd.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Constant-time-ish HMAC-SHA256 hex verification using Web Crypto. */
async function verifyHmac(
  payload: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !signatureHex) return false;
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
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return diff === 0;
}

export default http;
