import type { MetadataRoute } from "next";
import { SITE_URL, PRIVATE_PREFIXES } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep auth-gated app UI (dashboard, auth flows) out of the index — those
        // routes render as empty/loading shells to anonymous crawlers anyway.
        disallow: PRIVATE_PREFIXES.map((p) => `${p}/`),
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
