/**
 * Load a persisted scan by ScannedProduct.id and reconstruct an
 * AnalyzeResponse so the same downstream mapper (`mapAnalyzeResponseToComparison`)
 * can render the result on the `/scan/[id]` permalink page.
 *
 * This re-uses the same cache parsers that the live analyze route uses for a
 * cache HIT — no duplicated decoding logic.
 */

import { prisma } from "@/lib/prisma";
import {
  detectProductSource,
  isSupplierMarketplaceUrl,
} from "@/lib/scraping/detect-source";
import { mapAnalyzeResponseToComparison, type AnalyzeClientResult } from "@/lib/analyze/map-response";
import {
  parseAliExpressData,
  type AnalyzeResponse,
} from "@/lib/types/analyze";
import {
  parseCachedAiPrediction,
  parseCachedScrapeData,
} from "@/lib/types/cache";

interface LoadedScan {
  scanId: string;
  originalUrl: string;
  lastScrapedAt: string;
  response: AnalyzeResponse & { status: "success" };
  comparison: AnalyzeClientResult | null;
}

function resolveStorePrice(
  ai: ReturnType<typeof parseCachedAiPrediction>,
  scrape: ReturnType<typeof parseCachedScrapeData>,
): number {
  return (
    ai?.prediction?.estimatedStorePriceUsd ??
    scrape?.detectedStorePriceUsd ??
    0
  );
}

export async function loadScanById(id: string): Promise<LoadedScan | null> {
  if (!id || id.length > 64) return null; // cheap guard against junk

  const row = await prisma.scannedProduct.findUnique({ where: { id } });
  if (!row) return null;

  const scrape = parseCachedScrapeData(row.scrapeData);
  const ai = parseCachedAiPrediction(row.aiPrediction);
  const aliexpressData = parseAliExpressData(row.aliexpressData);

  if (!scrape || !ai) return null;

  const sourceType = detectProductSource(row.originalUrl);
  const supplierListing = isSupplierMarketplaceUrl(row.originalUrl);

  const supplierStatus: "complete" | "skipped" = aliexpressData
    ? "complete"
    : "skipped";
  const supplierSkipReason = aliexpressData
    ? undefined
    : supplierListing
      ? "Already on supplier marketplace"
      : "No supplier data on record";

  const response: AnalyzeResponse & { status: "success" } = {
    status: "success",
    cache: "HIT",
    originalUrl: row.originalUrl,
    scanId: row.id,
    aliexpressUrl: row.aliexpressUrl,
    aliexpressData,
    supplierStatus,
    supplierSkipReason,
    sourceType,
    dropshipPrediction: ai.prediction,
    lastScrapedAt: row.lastScrapedAt.toISOString(),
    storeProduct: {
      title: scrape.attributes.title,
      priceUsd: resolveStorePrice(ai, scrape),
      imageUrl: scrape.attributes.mainImageUrl,
      storeName: scrape.storeName,
    },
  };

  const comparison = mapAnalyzeResponseToComparison(response);

  return {
    scanId: row.id,
    originalUrl: row.originalUrl,
    lastScrapedAt: row.lastScrapedAt.toISOString(),
    response,
    comparison,
  };
}
