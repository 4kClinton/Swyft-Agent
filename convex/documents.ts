import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import type { ActionCtx } from "./_generated/server";
import { buildReceiptPdf, buildInvoicePdf } from "./lib/pdf";
import type { ReceiptPdfData, InvoicePdfData } from "./lib/pdf";
import { sendResendEmail } from "./lib/comms";
import type { Doc, Id } from "./_generated/dataModel";

function bytesToBase64(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 63] : "=";
  }
  return out;
}

function invoiceLabel(inv: Doc<"invoices"> | null): string {
  if (!inv) return "Payment";
  if (inv.description) return inv.description;
  const kind = inv.kind.charAt(0).toUpperCase() + inv.kind.slice(1);
  return inv.period ? `${kind} — ${inv.period}` : kind;
}

// ---------------------------------------------------------------------------
// Internal data gatherers (no auth — called by guarded actions / schedulers).
// ---------------------------------------------------------------------------
export const receiptData = internalQuery({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return null;
    const company = await ctx.db.get(receipt.companyId);
    const tenant = await ctx.db.get(receipt.tenantId);
    const payment = await ctx.db.get(receipt.paymentId);
    const allocs = await ctx.db
      .query("allocations")
      .withIndex("by_payment", (q) => q.eq("paymentId", receipt.paymentId))
      .collect();
    const lines: { label: string; amount: number }[] = [];
    for (const al of allocs) {
      lines.push({ label: invoiceLabel(await ctx.db.get(al.invoiceId)), amount: al.amount });
    }
    const unit = tenant?.unitId ? await ctx.db.get(tenant.unitId) : null;
    const building = tenant?.buildingId
      ? await ctx.db.get(tenant.buildingId)
      : unit
        ? await ctx.db.get(unit.buildingId)
        : null;

    const data: ReceiptPdfData = {
      company: {
        name: company?.name ?? "Swyft",
        email: company?.email,
        phone: company?.phone,
        address: company?.address,
      },
      party: {
        name: tenant?.fullName ?? "Tenant",
        phone: tenant?.phone,
        email: tenant?.email,
        unit: unit?.unitNumber,
        building: building?.name,
      },
      number: receipt.number,
      issuedAt: receipt._creationTime,
      amount: receipt.amount,
      paymentRef: payment?.ref,
      paymentSource: payment?.source,
      paidAt: payment?.paidAt,
      lines,
      unallocated: payment?.unallocated,
    };
    return {
      data,
      existingPdf: receipt.pdfStorageId ?? null,
      tenantEmail: tenant?.email ?? null,
    };
  },
});

export const invoiceData = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) return null;
    const company = await ctx.db.get(invoice.companyId);
    const tenant = await ctx.db.get(invoice.tenantId);
    const unit = invoice.unitId
      ? await ctx.db.get(invoice.unitId)
      : tenant?.unitId
        ? await ctx.db.get(tenant.unitId)
        : null;
    const building = tenant?.buildingId
      ? await ctx.db.get(tenant.buildingId)
      : unit
        ? await ctx.db.get(unit.buildingId)
        : null;

    const data: InvoicePdfData = {
      company: {
        name: company?.name ?? "Swyft",
        email: company?.email,
        phone: company?.phone,
        address: company?.address,
      },
      party: {
        name: tenant?.fullName ?? "Tenant",
        phone: tenant?.phone,
        email: tenant?.email,
        unit: unit?.unitNumber,
        building: building?.name,
      },
      number: invoiceId.slice(-8).toUpperCase(),
      kind: invoice.kind,
      description: invoice.description,
      period: invoice.period,
      amount: invoice.amount,
      balance: invoice.balance,
      status: invoice.status,
      dueDate: invoice.dueDate,
      issuedAt: invoice._creationTime,
    };
    return { data, existingPdf: invoice.pdfStorageId ?? null };
  },
});

// ---------------------------------------------------------------------------
// Auth guards (caller must own the document).
// ---------------------------------------------------------------------------
export const assertReceiptAccess = query({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(receiptId), companyId);
    return true;
  },
});

export const assertInvoiceAccess = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(invoiceId), companyId);
    return true;
  },
});

export const setReceiptPdf = internalMutation({
  args: { receiptId: v.id("receipts"), storageId: v.id("_storage") },
  handler: async (ctx, { receiptId, storageId }) => {
    await ctx.db.patch(receiptId, { pdfStorageId: storageId });
    return null;
  },
});

export const setInvoicePdf = internalMutation({
  args: { invoiceId: v.id("invoices"), storageId: v.id("_storage") },
  handler: async (ctx, { invoiceId, storageId }) => {
    await ctx.db.patch(invoiceId, { pdfStorageId: storageId });
    return null;
  },
});

// ---------------------------------------------------------------------------
// "Open document" actions — generate (cache) a branded PDF, return a URL.
// ---------------------------------------------------------------------------
export const receiptPdfUrl = action({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }): Promise<{ url: string }> => {
    await ctx.runQuery(api.documents.assertReceiptAccess, { receiptId });
    const ctxData = await ctx.runQuery(internal.documents.receiptData, { receiptId });
    if (!ctxData) throw new Error("Receipt not found");

    // Receipts are immutable — reuse the cached PDF when present.
    if (ctxData.existingPdf) {
      const url = await ctx.storage.getUrl(ctxData.existingPdf);
      if (url) return { url };
    }
    const bytes = await buildReceiptPdf(ctxData.data);
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/pdf" }),
    );
    await ctx.runMutation(internal.documents.setReceiptPdf, { receiptId, storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to store receipt PDF");
    return { url };
  },
});

export const invoicePdfUrl = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }): Promise<{ url: string }> => {
    await ctx.runQuery(api.documents.assertInvoiceAccess, { invoiceId });
    const ctxData = await ctx.runQuery(internal.documents.invoiceData, { invoiceId });
    if (!ctxData) throw new Error("Invoice not found");

    // Invoice balance/status change over time → always regenerate.
    const bytes = await buildInvoicePdf(ctxData.data);
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/pdf" }),
    );
    await ctx.runMutation(internal.documents.setInvoicePdf, { invoiceId, storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to store invoice PDF");
    return { url };
  },
});

// ---------------------------------------------------------------------------
// Email an invoice (branded PDF) to the tenant via Resend.
// ---------------------------------------------------------------------------
async function emailOneInvoice(
  ctx: ActionCtx,
  invoiceId: Id<"invoices">,
  overrideEmail?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.RESEND_FROM ?? "Swyft <onboarding@resend.dev>";

  const ctxData = await ctx.runQuery(internal.documents.invoiceData, { invoiceId });
  if (!ctxData) return false;
  const d = ctxData.data;
  const to = (overrideEmail ?? d.party.email ?? "").trim();
  if (!to) return false;
  d.party.email = to;

  const bytes = await buildInvoicePdf(d);
  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: "application/pdf" }),
  );
  await ctx.runMutation(internal.documents.setInvoicePdf, { invoiceId, storageId });

  const amount = `KES ${Math.round(d.amount).toLocaleString()}`;
  const balance = `KES ${Math.round(d.balance).toLocaleString()}`;
  const due = new Date(d.dueDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const item = d.description || (d.period ? `${d.kind} — ${d.period}` : d.kind);
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1a1f26;max-width:520px;margin:auto">
      <h2 style="color:#0d8050;margin-bottom:4px">Invoice ${d.number}</h2>
      <p style="color:#6b7280;margin-top:0">From ${d.company.name}</p>
      <p>Hi ${d.party.name},</p>
      <p>Please find your invoice attached. Details below.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 0;color:#374151">${item}</td><td style="padding:6px 0;text-align:right">${amount}</td></tr>
        <tr><td style="padding:6px 0;color:#374151">Due date</td><td style="padding:6px 0;text-align:right">${due}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:bold">Balance due</td><td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:bold;color:#0d8050">${balance}</td></tr>
      </table>
      <p style="color:#9ca3af;font-size:12px">Sent via Swyft on behalf of ${d.company.name}.</p>
    </div>`;

  return await sendResendEmail({
    apiKey,
    from,
    to,
    subject: `Invoice ${d.number} from ${d.company.name}`,
    html,
    attachments: [{ filename: `Invoice-${d.number}.pdf`, content: bytesToBase64(bytes) }],
  });
}

/** Save an email onto the invoice's tenant so future sends are automatic. */
export const setInvoiceTenantEmail = internalMutation({
  args: { invoiceId: v.id("invoices"), email: v.string() },
  handler: async (ctx, { invoiceId, email }) => {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) return null;
    await ctx.db.patch(invoice.tenantId, { email });
    return null;
  },
});

/** Open + partial invoice ids for the caller's company (for bulk send). */
export const openInvoicesForSend = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(1000);
    const pending = invoices.filter(
      (i) => (i.status === "open" || i.status === "partial") && i.balance > 0,
    );
    const out: { invoiceId: Id<"invoices">; hasEmail: boolean }[] = [];
    for (const inv of pending) {
      const tenant = await ctx.db.get(inv.tenantId);
      out.push({ invoiceId: inv._id, hasEmail: !!tenant?.email });
    }
    return out;
  },
});

/**
 * Email a single invoice to its tenant. Optionally pass `email` to send to (and
 * save) an address when the tenant has none. Returns a result rather than
 * throwing for the expected "no email" case so the UI can prompt for one.
 */
export const sendInvoiceEmail = action({
  args: { invoiceId: v.id("invoices"), email: v.optional(v.string()) },
  handler: async (
    ctx,
    { invoiceId, email },
  ): Promise<{ sent: boolean; reason?: string }> => {
    await ctx.runQuery(api.documents.assertInvoiceAccess, { invoiceId });
    if (!process.env.RESEND_API_KEY) {
      return { sent: false, reason: "email_not_configured" };
    }
    const override = email?.trim();
    const sent = await emailOneInvoice(ctx, invoiceId, override);
    if (sent && override) {
      // Persist the address so next time it's automatic.
      await ctx.runMutation(internal.documents.setInvoiceTenantEmail, {
        invoiceId,
        email: override,
      });
    }
    if (!sent) {
      return { sent: false, reason: override ? "send_failed" : "no_email" };
    }
    return { sent: true };
  },
});

/** Email every open/partial invoice to tenants who have an email on file. */
export const sendAllOpenInvoices = action({
  args: {},
  handler: async (ctx): Promise<{ sent: number; skipped: number }> => {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Email is not configured (RESEND_API_KEY missing)");
    }
    const list = await ctx.runQuery(api.documents.openInvoicesForSend, {});
    let sent = 0;
    let skipped = 0;
    for (const it of list) {
      if (!it.hasEmail) {
        skipped++;
        continue;
      }
      const ok = await emailOneInvoice(ctx, it.invoiceId);
      ok ? sent++ : skipped++;
    }
    return { sent, skipped };
  },
});

// ---------------------------------------------------------------------------
// Email a receipt to the tenant via Resend (issue #3). Fire-and-forget;
// skips gracefully when there's no tenant email or RESEND_API_KEY isn't set.
// ---------------------------------------------------------------------------
export const sendReceiptEmail = internalAction({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    const ctxData = await ctx.runQuery(internal.documents.receiptData, { receiptId });
    if (!ctxData || !ctxData.tenantEmail) return; // no email on file → skip

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return; // not configured yet
    const from = process.env.RESEND_FROM ?? "Swyft <onboarding@resend.dev>";

    const bytes = await buildReceiptPdf(ctxData.data);
    // Cache the generated PDF on the receipt for later viewing.
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/pdf" }),
    );
    await ctx.runMutation(internal.documents.setReceiptPdf, { receiptId, storageId });

    const d = ctxData.data;
    const amount = `KES ${Math.round(d.amount).toLocaleString()}`;
    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#1a1f26;max-width:520px;margin:auto">
        <h2 style="color:#0d8050;margin-bottom:4px">Payment received</h2>
        <p style="color:#6b7280;margin-top:0">Receipt ${d.number} from ${d.company.name}</p>
        <p>Hi ${d.party.name},</p>
        <p>We've received your payment of <strong>${amount}</strong>. Your receipt is attached as a PDF.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          ${d.lines
            .map(
              (l) =>
                `<tr><td style="padding:6px 0;color:#374151">${l.label}</td><td style="padding:6px 0;text-align:right">KES ${Math.round(l.amount).toLocaleString()}</td></tr>`,
            )
            .join("")}
          <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:bold">Total paid</td><td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:bold;color:#0d8050">${amount}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px">Sent via Swyft — automated rent reconciliation.</p>
      </div>`;

    // best-effort — the SMS receipt still covers delivery if this fails
    await sendResendEmail({
      apiKey,
      from,
      to: ctxData.tenantEmail,
      subject: `Receipt ${d.number} — payment received`,
      html,
      attachments: [{ filename: `${d.number}.pdf`, content: bytesToBase64(bytes) }],
    });
  },
});
