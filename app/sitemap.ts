import type { MetadataRoute } from "next";
import { domainFromUrl } from "@/lib/learning/priors";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Public sitemap — Sprint 11 Stage 28.
 *
 * Lists the homepage and the 1000 most-recent scan permalinks. Internal admin
 * surfaces (`/monitoring`, `/dev-monitor`, `/api/*`) are excluded via
 * `robots.ts` rather than by absence.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  try {
    const recent = await prisma.scannedProduct.findMany({
      select: { id: true, originalUrl: true, lastScrapedAt: true },
      orderBy: { lastScrapedAt: "desc" },
      take: 1000,
    });
    const storeDomains = new Map<string, Date>();
    for (const row of recent) {
      entries.push({
        url: `${base}/scan/${row.id}`,
        lastModified: row.lastScrapedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });
      const host = domainFromUrl(row.originalUrl);
      if (host && !storeDomains.has(host)) storeDomains.set(host, row.lastScrapedAt);
    }
    // Per-store "is {domain} legit" report pages — one per scanned domain.
    for (const [host, lastModified] of storeDomains) {
      entries.push({
        url: `${base}/store/${encodeURIComponent(host)}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (err) {
    console.error("[sitemap] failed to load scans", err);
  }

  return entries;
}
