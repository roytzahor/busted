import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";

/**
 * Trending Now feed — surfaces recently-scanned products with confirmed
 * supplier savings as social proof on the home page.
 *
 * Privacy: only scans that already returned a confident match (and are
 * therefore reachable via the public /scan/[id] permalink) are exposed.
 * No user identity, no IP, no per-visitor history. All prices are stored
 * and shipped as USD — the client converts to the user's currency.
 *
 * Caching: 5 minutes at the CDN. The feed is read-heavy and the underlying
 * data only changes when someone scans, so a short cache is plenty.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

const TRENDING_DEFAULT_LIMIT = 12;
const TRENDING_MAX_LIMIT = 24;
const TRENDING_WINDOW_HOURS = 72;

export interface TrendingItem {
  scanId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  storeName: string;
  storePriceUsd: number;
  supplierPriceUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  scannedAtIso: string;
}

export interface TrendingPayload {
  items: TrendingItem[];
  windowHours: number;
  refreshedAt: string;
}

function clampLimit(raw: string | null): number {
  if (!raw) return TRENDING_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return TRENDING_DEFAULT_LIMIT;
  return Math.min(parsed, TRENDING_MAX_LIMIT);
}

export async function GET(request: Request): Promise<NextResponse<TrendingPayload>> {
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const windowSince = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);

  // Pull a larger pool than we'll render — many rows will lack the
  // store/supplier-price pair we need, and we want to fall back gracefully
  // rather than under-fill the grid.
  const rows = await prisma.scannedProduct.findMany({
    where: {
      lastScrapedAt: { gt: windowSince },
      aliexpressData: { not: undefined },
    },
    orderBy: { lastScrapedAt: "desc" },
    take: limit * 4,
    select: {
      id: true,
      originalUrl: true,
      lastScrapedAt: true,
      scrapeData: true,
      aiPrediction: true,
      aliexpressData: true,
    },
  });

  const items: TrendingItem[] = [];
  for (const row of rows) {
    if (items.length >= limit) break;

    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const supplier = parseAliExpressData(row.aliexpressData);
    if (!scrape || !supplier) continue;

    const storePriceUsd =
      ai?.prediction?.estimatedStorePriceUsd ??
      scrape.detectedStorePriceUsd ??
      0;
    const supplierPriceUsd = supplier.priceUsd;
    if (storePriceUsd <= 0 || supplierPriceUsd <= 0) continue;
    if (supplierPriceUsd >= storePriceUsd) continue;

    const savingsUsd = storePriceUsd - supplierPriceUsd;
    const savingsPercent = Math.round((savingsUsd / storePriceUsd) * 100);

    items.push({
      scanId: row.id,
      url: row.originalUrl,
      title: scrape.attributes.title,
      imageUrl: scrape.attributes.mainImageUrl,
      storeName: scrape.storeName,
      storePriceUsd,
      supplierPriceUsd,
      savingsUsd,
      savingsPercent,
      scannedAtIso: row.lastScrapedAt.toISOString(),
    });
  }

  const payload: TrendingPayload = {
    items,
    windowHours: TRENDING_WINDOW_HOURS,
    refreshedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
