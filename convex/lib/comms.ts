// Shared outbound-comms helpers (plain async functions, no Convex registration)
// so actions can reuse them without action→action calls. fetch() works in the
// default Convex runtime.

export interface EmailAttachment {
  filename: string;
  content: string; // base64
}

/** Send an email via Resend. Returns true on a 2xx response. */
export async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.attachments ? { attachments: opts.attachments } : {}),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Send an SMS via Africa's Talking. `to` should be in +2547… form. */
export async function sendAtSms(opts: {
  username: string;
  apiKey: string;
  senderId?: string;
  to: string;
  message: string;
}): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      username: opts.username,
      to: opts.to,
      message: opts.message,
      ...(opts.senderId ? { from: opts.senderId } : {}),
    });
    const resp = await fetch(
      "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: {
          apiKey: opts.apiKey,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body,
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}
