// Broker for uploading pre-recorded marketplace media into the swyft-customer
// deployment. The browser must never hold SYNC_SHARED_SECRET, so it calls these
// Convex actions, which sign the request (HMAC) and forward to the customer's
// /api/media/* endpoints. The actions hand back a pre-signed URL the browser
// then uploads bytes to directly (Convex storage URL for images, Mux PUT URL for
// videos). See convex/media.ts in swyft-customer for the receiving side.
import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { requireCompany } from "./lib/rbac";
import { hmacHex } from "./lib/hmac";

/** Any signed-in company member may upload media (same bar as buildings.create). */
export const assertCanUploadMedia = query({
  args: {},
  handler: async (ctx) => {
    await requireCompany(ctx);
    return true;
  },
});

async function postSigned(path: string, payload: unknown): Promise<any> {
  const url = process.env.CUSTOMER_BACKEND_URL;
  const secret = process.env.SYNC_SHARED_SECRET;
  if (!url || !secret) {
    throw new Error("CUSTOMER_BACKEND_URL / SYNC_SHARED_SECRET not configured");
  }
  const body = JSON.stringify(payload);
  const signature = await hmacHex(body, secret);
  const resp = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-swyft-signature": signature },
    body,
  });
  if (!resp.ok) throw new Error(`customer backend ${resp.status}`);
  return resp.json();
}

// Mint a Convex-storage upload URL on the customer deployment. The browser POSTs
// the image to it, gets a storageId back, then calls attachImage below.
export const requestImageUploadUrl = action({
  args: { mediaKey: v.string() },
  handler: async (ctx, { mediaKey }): Promise<{ uploadUrl: string }> => {
    await ctx.runQuery(api.marketplaceMedia.assertCanUploadMedia, {});
    return await postSigned("/api/media/image-upload-url", { mediaKey });
  },
});

// Record an uploaded image under its media key on the customer deployment.
export const attachImage = action({
  args: { mediaKey: v.string(), storageId: v.string() },
  handler: async (
    ctx,
    { mediaKey, storageId },
  ): Promise<{ ok: boolean; url?: string | null }> => {
    await ctx.runQuery(api.marketplaceMedia.assertCanUploadMedia, {});
    return await postSigned("/api/media/attach-image", { mediaKey, storageId });
  },
});

// Mint a Mux direct-upload URL on the customer deployment. The browser PUTs the
// video to it; the customer's Mux webhook flips the media to ready.
export const requestVideoUploadUrl = action({
  args: { mediaKey: v.string() },
  handler: async (
    ctx,
    { mediaKey },
  ): Promise<{ uploadUrl: string; uploadId: string }> => {
    await ctx.runQuery(api.marketplaceMedia.assertCanUploadMedia, {});
    return await postSigned("/api/media/video-upload-url", { mediaKey });
  },
});
