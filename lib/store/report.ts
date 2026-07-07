/**
 * Store report — aggregates every cached scan for a domain into the public
 * "Is {domain} legit?" page (ROADMAP Phase 2: programmatic SEO).
 *
 * Smoke-alarm discipline applies at store level too: a store is only
 * "flagged" when ≥60% of decisive verdicts are dropship AND there are at
 * least MIN_DECISIVE_SCANS of them. One bad scan never brands a store.
 */

import { prisma } from "@/lib/prisma";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";

export interface StoreScanSummary {
  scanId: string;
  title: string;
  verdict: string | null;
  confidence: number | null;
  storePriceUsd: number | null;
  supplierPriceUsd: number | null;
  savingsPercent: number | null;
  scannedAt: string;
}

export type StoreTier = "flagged" | "mixed" | "clean" | "insufficient";

export interface StoreReport {
  domain: string;
  totalScans: number;
  dropshipCount: number;
  legitCount: number;
  otherCount: number;
  /** Mean savings across scans that had a confident supplier match. */
  avgSavingsPercent: number | null;
  tier: StoreTier;
  /** Newest first, capped. */
  scans: StoreScanSummary[];
  lastScannedAt: string;
}

const MIN_DECISIVE_SCANS = 2;
const FLAGGED_SHARE = 0.6;
const CLEAN_SHARE = 0.2;
const SCAN_LIST_CAP = 25;

/**
 * Sanitizes the [domain] route param. Returns null for anything that isn't
 * a plausible hostname — the page 404s rather than querying with junk.
 */
export function normalizeDomainParam(raw: string): string | null {
  let cleaned: string;
  try {
    cleaned = decodeURIComponent(raw).toLowerCase().trim();
  } catch {
    return null;
  }
  cleaned = cleaned.replace(/^www\./, "");
  if (cleaned.length > 80 || !cleaned.includes(".")) return null;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(cleaned)) return null;
  return cleaned;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function loadStoreReport(domain: string): Promise<StoreReport | null> {
  // `contains` over-fetches (path hits, sibling domains); the hostname
  // filter below is the source of truth.
  const rows = await prisma.scannedProduct.findMany({
    where: { originalUrl: { contains: domain } },
    orderBy: { lastScrapedAt: "desc" },
    take: 200,
  });

  const matching = rows.filter((row) => {
    const host = hostnameOf(row.originalUrl);
    return host === domain || host?.endsWith(`.${domain}`) === true;
  });
  if (matching.length === 0) return null;

  let dropshipCount = 0;
  let legitCount = 0;
  let otherCount = 0;
  const savings: number[] = [];
  const scans: StoreScanSummary[] = [];

  for (const row of matching) {
    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const ali = parseAliExpressData(row.aliexpressData);
    const verdict = ai?.prediction?.verdict ?? null;

    if (verdict === "dropship") dropshipCount += 1;
    else if (verdict === "legit" || verdict === "collection_page") legitCount += 1;
    else otherCount += 1;

    const storePrice =
      ai?.prediction?.estimatedStorePriceUsd ?? scrape?.detectedStorePriceUsd ?? null;
    const supplierPrice = ali?.priceUsd ?? null;
    let savingsPercent: number | null = null;
    if (storePrice && supplierPrice !== null && storePrice > supplierPrice) {
      savingsPercent = Math.round(((storePrice - supplierPrice) / storePrice) * 100);
      savings.push(savingsPercent);
    }

    if (scans.length < SCAN_LIST_CAP) {
      scans.push({
        scanId: row.id,
        title: scrape?.attributes.title ?? row.originalUrl,
        verdict,
        confidence: ai?.prediction?.confidence ?? null,
        storePriceUsd: storePrice,
        supplierPriceUsd: supplierPrice,
        savingsPercent,
        scannedAt: row.lastScrapedAt.toISOString(),
      });
    }
  }

  const decisive = dropshipCount + legitCount;
  let tier: StoreTier = "insufficient";
  if (decisive >= MIN_DECISIVE_SCANS) {
    const share = dropshipCount / decisive;
    tier = share >= FLAGGED_SHARE ? "flagged" : share <= CLEAN_SHARE ? "clean" : "mixed";
  }

  return {
    domain,
    totalScans: matching.length,
    dropshipCount,
    legitCount,
    otherCount,
    avgSavingsPercent:
      savings.length > 0
        ? Math.round(savings.reduce((s, n) => s + n, 0) / savings.length)
        : null,
    tier,
    scans,
    lastScannedAt: matching[0].lastScrapedAt.toISOString(),
  };
}
