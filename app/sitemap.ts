import type { MetadataRoute } from "next";
import { SITE_URL, PUBLIC_ROUTES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: route === "/" ? SITE_URL : `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "yearly",
    priority: route === "/" ? 1 : 0.3,
  }));
}
