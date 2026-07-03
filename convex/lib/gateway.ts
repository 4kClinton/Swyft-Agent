import { generateObject } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Vercel AI Gateway — Claude access for the import pipeline. Used only by
// "use node" actions. The key lives on the Convex deployment (NOT the Next.js
// .env): `npx convex env set VERCEL_AI_GATEWAY_KEY <key>`.
//
// Gateway slugs use dotted notation and can lag the newest model IDs — override
// the primary with IMPORT_MODEL if the catalog name differs.
// ---------------------------------------------------------------------------

// Free-tier gateways only allow a subset of models. Haiku 4.5 works on free tier;
// the fallback stays on an inexpensive Haiku (override both via env if your plan
// allows more capable models). We deliberately do NOT fall back to a paid-only
// model like Sonnet — that just turns a transient error into a billing error.
export const GATEWAY_PRIMARY_MODEL =
  process.env.IMPORT_MODEL ?? "anthropic/claude-haiku-4.5";
export const GATEWAY_FALLBACK_MODEL =
  process.env.IMPORT_FALLBACK_MODEL ?? "anthropic/claude-3.5-haiku";

function friendlyGatewayError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/free tier|paid credits|upgrade|insufficient|access to this model/i.test(msg)) {
    return new Error(
      "Your Vercel AI Gateway plan can't access this model. Add credits, or set " +
        "IMPORT_MODEL / IMPORT_FALLBACK_MODEL on the Convex deployment to a model your plan allows.",
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export function gatewayModel(modelId: string) {
  const apiKey =
    process.env.VERCEL_AI_GATEWAY_KEY ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Vercel AI Gateway key missing. Set it on the Convex deployment: " +
        "`npx convex env set VERCEL_AI_GATEWAY_KEY <key>`",
    );
  }
  return createGateway({ apiKey })(modelId);
}

/** Structured generation with a primary→fallback model. */
export async function generateStructured<S extends z.ZodTypeAny>(
  schema: S,
  prompt: string,
): Promise<z.infer<S>> {
  try {
    console.log(`[import] generating with ${GATEWAY_PRIMARY_MODEL}…`);
    const { object } = await generateObject({
      model: gatewayModel(GATEWAY_PRIMARY_MODEL),
      schema,
      prompt,
    });
    return object;
  } catch (err) {
    console.warn(
      `[import] ${GATEWAY_PRIMARY_MODEL} failed (${err instanceof Error ? err.message : String(err)}); ` +
        `retrying with ${GATEWAY_FALLBACK_MODEL}`,
    );
    try {
      const { object } = await generateObject({
        model: gatewayModel(GATEWAY_FALLBACK_MODEL),
        schema,
        prompt,
      });
      return object;
    } catch (err2) {
      console.error(
        `[import] both models failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
      );
      throw friendlyGatewayError(err2);
    }
  }
}
