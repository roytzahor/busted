/**
 * Store report — aggregates every cached scan for a domain into the public
 * "Is {domain} legit?" page (ROADMAP Phase 2: programmatic SEO).
 *
 * Smoke-alarm discipline applies at store level too: a store is only
 * "flagged" when ≥60% of decisive verdicts are dropship AND there are at
 * least MIN_DECISIVE_SCANS of them. One bad scan never brands a store.
 *
 * The tier gate is what makes that true rather than aspirational. A `dropship`
 * verdict at 0.35 confidence is `silent` per computePresenceTier() — we would
 * not say a word about that product to the user who scanned it. Counting it
 * toward a public accusation against a named business, on an indexed page,
 * would say something louder on weaker evidence. So a dropship verdict counts
 * here only if it would have spoken on its own.
 *
 * The gate is deliberately asymmetric: it applies to `dropship` (an
 * accusation) and not to `legit` (an exoneration, and silent by definition —
 * gating it would empty the denominator and flag every store).
 */

import { computePresenceTier } from "@/lib/analyze/presence-tier";
import { domainFromUrl } from "@/lib/learning/priors";
import { prisma } from "@/lib/prisma";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";

export interface StoreScanSummary {
  scanId: string;
  title: string;
  /**
   * The verdict as this PUBLIC page is allowed to state it, which is not
   * always the raw one. A `dropship` whose presenceTier is silent is reported
   * as `insufficient_evidence`, because that is exactly what it is from here:
   * the aggregate refuses to count it, so a per-scan row must not print
   * "Dropship signals" next to a "Not enough data yet" banner and re-make the
   * accusation the gate just declined to make.
   */
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
  /**
   * Scans that cleared the tier gate and counted toward the verdict. Always
   * <= totalScans. Copy about sufficiency must cite THIS, not totalScans:
   * "only 9 scans on record" beside a 4-scan minimum reads as a bug.
   */
  decisiveCount: number;
  /** Mean savings across scans that had a confident supplier match. */
  avgSavingsPercent: number | null;
  tier: StoreTier;
  /** Newest first, capped. */
  scans: StoreScanSummary[];
  lastScannedAt: string;
}

/**
 * Two scans is not a pattern — it is an anecdote, and this page is indexed
 * and names a real business. Raised 2 → 4 alongside the tier gate.
 */
export const MIN_DECISIVE_SCANS = 4;
const FLAGGED_SHARE = 0.6;
const CLEAN_SHARE = 0.2;
const SCAN_LIST_CAP = 25;

/**
 * Whether a cached prediction is allowed to count as a dropship data point
 * for a *public* store verdict. Mirrors the user-facing contract exactly: if
 * presenceTier would be silent, we never said it, so it cannot be evidence.
 */
function countsAsDropship(prediction: Parameters<typeof computePresenceTier>[0]): boolean {
  return (
    prediction?.verdict === "dropship" && computePresenceTier(prediction) !== "silent"
  );
}

function tierFromCounts(dropshipCount: number, legitCount: number): StoreTier {
  const decisive = dropshipCount + legitCount;
  if (decisive < MIN_DECISIVE_SCANS) return "insufficient";
  const share = dropshipCount / decisive;
  return share >= FLAGGED_SHARE ? "flagged" : share <= CLEAN_SHARE ? "clean" : "mixed";
}

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

export async function loadStoreReport(domain: string): Promise<StoreReport | null> {
  // `contains` over-fetches (path hits, sibling domains); the hostname
  // filter below is the source of truth. Note: LIKE '%domain%' can't use the
  // originalUrl index — fine at current row counts; at scale this needs a
  // normalized domain column with its own index.
  const rows = await prisma.scannedProduct.findMany({
    where: { originalUrl: { contains: domain } },
    select: {
      id: true,
      originalUrl: true,
      lastScrapedAt: true,
      scrapeData: true,
      aiPrediction: true,
      aliexpressData: true,
    },
    orderBy: { lastScrapedAt: "desc" },
    take: 200,
  });

  const matching = rows.filter((row) => {
    const host = domainFromUrl(row.originalUrl);
    return host === domain || host?.endsWith(`.${domain}`) === true;
  });
  if (matching.length === 0) return null;

  let dropshipCount = 0;
  let legitCount = 0;
  const savings: number[] = [];
  const scans: StoreScanSummary[] = [];

  for (const row of matching) {
    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const ali = parseAliExpressData(row.aliexpressData);
    const verdict = ai?.prediction?.verdict ?? null;

    // A dropship verdict the tier system would have kept quiet about is not
    // counted at all — neither as dropship nor as legit. It is an absence of
    // evidence, not evidence of absence.
    if (countsAsDropship(ai?.prediction)) dropshipCount += 1;
    else if (verdict === "legit" || verdict === "collection_page") legitCount += 1;

    const storePrice =
      ai?.prediction?.estimatedStorePriceUsd ?? scrape?.detectedStorePriceUsd ?? null;
    const supplierPrice = ali?.priceUsd ?? null;
    let savingsPercent: number | null = null;
    if (storePrice && supplierPrice !== null && storePrice > supplierPrice) {
      savingsPercent = Math.round(((storePrice - supplierPrice) / storePrice) * 100);
      savings.push(savingsPercent);
    }

    // Silent dropship -> report it as what the gate treats it as. Derived here
    // rather than in the page so the row and the aggregate cannot drift apart.
    const publicVerdict =
      verdict === "dropship" && !countsAsDropship(ai?.prediction)
        ? "insufficient_evidence"
        : verdict;

    if (scans.length < SCAN_LIST_CAP) {
      scans.push({
        scanId: row.id,
        title: scrape?.attributes.title ?? row.originalUrl,
        verdict: publicVerdict,
        confidence: ai?.prediction?.confidence ?? null,
        storePriceUsd: storePrice,
        supplierPriceUsd: supplierPrice,
        savingsPercent,
        scannedAt: row.lastScrapedAt.toISOString(),
      });
    }
  }

  return {
    domain,
    totalScans: matching.length,
    dropshipCount,
    decisiveCount: dropshipCount + legitCount,
    legitCount,
    avgSavingsPercent:
      savings.length > 0
        ? Math.round(savings.reduce((s, n) => s + n, 0) / savings.length)
        : null,
    tier: tierFromCounts(dropshipCount, legitCount),
    scans,
    lastScannedAt: matching[0].lastScrapedAt.toISOString(),
  };
}

/**
 * Lean version of loadStoreReport() for the extension's quick-lookup
 * fallback — only the tier, no per-scan summaries or price aggregation.
 * Selects just `aiPrediction` (skips scrapeData/aliexpressData) since tier
 * only needs the verdict.
 */
export async function computeDomainTier(
  domain: string,
): Promise<{ tier: StoreTier; decisiveCount: number } | null> {
  const rows = await prisma.scannedProduct.findMany({
    where: { originalUrl: { contains: domain } },
    select: { originalUrl: true, aiPrediction: true },
    take: 200,
  });

  let dropshipCount = 0;
  let legitCount = 0;
  let matched = false;

  for (const row of rows) {
    const host = domainFromUrl(row.originalUrl);
    if (host !== domain && host?.endsWith(`.${domain}`) !== true) continue;
    matched = true;

    const prediction = parseCachedAiPrediction(row.aiPrediction)?.prediction;
    const verdict = prediction?.verdict ?? null;
    if (countsAsDropship(prediction)) dropshipCount += 1;
    else if (verdict === "legit" || verdict === "collection_page") legitCount += 1;
  }

  if (!matched) return null;
  return { tier: tierFromCounts(dropshipCount, legitCount), decisiveCount: dropshipCount + legitCount };
}
