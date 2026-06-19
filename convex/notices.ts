import { v } from "convex/values";
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCompany, assertSameCompany } from "./lib/rbac";
import { sendResendEmail, sendAtSms } from "./lib/comms";

const channelValidator = v.union(v.literal("email"), v.literal("sms"));

/** Notices with their saved recipients joined (issue #5). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { companyId } = await requireCompany(ctx);
    const notices = await ctx.db
      .query("notices")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(200);
    return await Promise.all(
      notices.map(async (n) => {
        const recipients = await ctx.db
          .query("noticeRecipients")
          .withIndex("by_notice", (q) => q.eq("noticeId", n._id))
          .collect();
        return { ...n, recipients };
      }),
    );
  },
});

/**
 * Create a notice addressed to one or more saved tenants, persist a recipient
 * row per (tenant, channel), and schedule delivery via email (Resend) and/or
 * SMS (Africa's Talking).
 */
export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    noticeType: v.string(),
    buildingId: v.optional(v.id("buildings")),
    tenantIds: v.array(v.id("tenants")),
    channels: v.array(channelValidator),
  },
  handler: async (ctx, args) => {
    const { companyId } = await requireCompany(ctx);
    if (args.channels.length === 0) {
      throw new Error("Pick at least one delivery channel");
    }

    const noticeId = await ctx.db.insert("notices", {
      companyId,
      title: args.title,
      content: args.content,
      noticeType: args.noticeType,
      buildingId: args.buildingId,
      status: args.tenantIds.length > 0 ? "sent" : "draft",
    });

    for (const tenantId of args.tenantIds) {
      const tenant = await ctx.db.get(tenantId);
      assertSameCompany(tenant, companyId);
      for (const channel of args.channels) {
        const hasContact =
          channel === "email" ? !!tenant!.email : !!tenant!.phone;
        await ctx.db.insert("noticeRecipients", {
          companyId,
          noticeId,
          tenantId,
          tenantName: tenant!.fullName,
          email: tenant!.email,
          phone: tenant!.phone,
          channel,
          state: hasContact ? "pending" : "skipped",
        });
      }
    }

    if (args.tenantIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notices.deliver, { noticeId });
    }
    return noticeId;
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("notices"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("acknowledged"),
    ),
  },
  handler: async (ctx, { id, status }) => {
    const { companyId } = await requireCompany(ctx);
    assertSameCompany(await ctx.db.get(id), companyId);
    await ctx.db.patch(id, { status });
    return null;
  },
});

// --- Delivery (internal) ---------------------------------------------------
export const deliveryContext = internalQuery({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }) => {
    const notice = await ctx.db.get(noticeId);
    if (!notice) return null;
    const company = await ctx.db.get(notice.companyId);
    const recipients = await ctx.db
      .query("noticeRecipients")
      .withIndex("by_notice", (q) => q.eq("noticeId", noticeId))
      .collect();
    return {
      title: notice.title,
      content: notice.content,
      companyName: company?.name ?? "Swyft",
      recipients: recipients
        .filter((r) => r.state === "pending")
        .map((r) => ({
          _id: r._id,
          channel: r.channel,
          email: r.email,
          phone: r.phone,
          name: r.tenantName,
        })),
    };
  },
});

export const setRecipientState = internalMutation({
  args: {
    recipientId: v.id("noticeRecipients"),
    state: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
  },
  handler: async (ctx, { recipientId, state }) => {
    await ctx.db.patch(recipientId, { state });
    return null;
  },
});

export const deliver = internalAction({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }) => {
    const info = await ctx.runQuery(internal.notices.deliveryContext, { noticeId });
    if (!info) return;

    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? "Swyft <onboarding@resend.dev>";
    const atUser = process.env.AT_USERNAME;
    const atKey = process.env.AT_API_KEY;

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#1a1f26;max-width:520px;margin:auto">
        <h2 style="color:#0d8050">${info.title}</h2>
        <p style="white-space:pre-wrap">${info.content}</p>
        <p style="color:#9ca3af;font-size:12px">Sent via Swyft on behalf of ${info.companyName}.</p>
      </div>`;

    for (const r of info.recipients) {
      let ok = false;
      if (r.channel === "email" && r.email && resendKey) {
        ok = await sendResendEmail({
          apiKey: resendKey,
          from,
          to: r.email,
          subject: info.title,
          html,
        });
      } else if (r.channel === "sms" && r.phone && atUser && atKey) {
        ok = await sendAtSms({
          username: atUser,
          apiKey: atKey,
          senderId: process.env.AT_SENDER_ID,
          to: `+${r.phone}`,
          message: `${info.title}: ${info.content}`,
        });
      }
      await ctx.runMutation(internal.notices.setRecipientState, {
        recipientId: r._id,
        state: ok ? "sent" : "failed",
      });
    }
  },
});
