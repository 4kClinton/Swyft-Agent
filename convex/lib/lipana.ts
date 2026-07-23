/**
 * Lipana M-Pesa STK-push client. Lipana is for boosts & subscriptions ONLY,
 * never rent (1stPlan.md §4.2).
 *
 * IMPORTANT: Lipana's STK push has NO reference/metadata passthrough — the
 * request body accepts only `phone` and `amount`. The push ACK returns a
 * `transactionId` (e.g. "TXN...") with `status: "pending"` and does NOT include
 * a `checkoutRequestID` (that only appears — if at all — on the settlement
 * webhook). So `transactionId` is our reconciliation key: the caller persists a
 * `paymentIntents` row keyed by it and the webhook (http.ts /api/lipana/webhook)
 * matches on it. Docs: https://lipana.dev/docs → "STK Push".
 */

const LIPANA_STK_URL = "https://api.lipana.dev/v1/transactions/push-stk";

export type StkPushResult = {
  /** Lipana transaction id (e.g. "TXN..."). The reconciliation key. */
  transactionId: string;
  /** M-Pesa checkout request id (e.g. "ws_CO_..."). Often absent on the ACK. */
  checkoutRequestId: string;
};

/** Initiate an M-Pesa STK push. Throws on missing config or a non-2xx reply. */
export async function initiateStkPush(
  phone: string,
  amount: number,
): Promise<StkPushResult> {
  const secret = process.env.LIPANA_SECRET_KEY;
  if (!secret) throw new Error("LIPANA_SECRET_KEY not configured");

  const resp = await fetch(LIPANA_STK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": secret,
    },
    body: JSON.stringify({ phone, amount }),
  });
  if (!resp.ok) {
    throw new Error(`Lipana STK error ${resp.status}: ${await resp.text()}`);
  }

  const body = (await resp.json()) as {
    success?: boolean;
    message?: string;
    data?: {
      transactionId?: string;
      checkoutRequestID?: string;
      status?: string;
    };
  };
  const transactionId = body.data?.transactionId ?? "";
  const checkoutRequestId = body.data?.checkoutRequestID ?? "";
  // The push succeeded if Lipana returns success + a transactionId. The
  // checkoutRequestID is NOT part of the ACK, so don't require it here.
  if (body.success === false || !transactionId) {
    throw new Error(`Lipana STK push failed: ${JSON.stringify(body)}`);
  }
  return { transactionId, checkoutRequestId };
}
