import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

/**
 * robots.txt — Sprint 11 Stage 28.
 *
 * Allows all crawlers on the public surface; explicitly hides the API,
 * monitoring, and dev tooling. Points at the dynamic sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/monitoring", "/dev-monitor", "/dashboard"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
