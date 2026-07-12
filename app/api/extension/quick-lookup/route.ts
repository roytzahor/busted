import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePresenceTier, type PresenceTier } from "@/lib/analyze/presence-tier";
import { normalizeProductUrl } from "@/lib/cache/product-cache";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extension quick-lookup — Sprint 12 Stage 36.
 *
 * Returns cached scan summary for a given product URL. CACHE-ONLY: never
 * triggers a scrape, never calls Gemini, never calls AliExpress. Designed
 * to be called from the content script as soon as a product page loads —
 * fast (single Prisma read) and free.
 *
 * CORS: open to all origins so chrome-extension:// can call it.
 */

type LookupResponse =
  | { found: false }
  | {
      found: true;
      scanId: string;
      storeTitle: string;
      storePriceUsd: number | null;
      /** Badge contract — computed from the cached verdict server-side. */
      presenceTier: PresenceTier;
      verdict: string | null;
      /** null when the scan had no confident supplier match. */
      aliPriceUsd: number | null;
      savingsPercent: number;
      permalink: string;
    };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function notFound(): NextResponse<LookupResponse> {
  return NextResponse.json({ found: false }, { status: 200, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest): Promise<NextResponse<LookupResponse>> {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ found: false }, { status: 200, headers: CORS_HEADERS });
  }

  const normalized = normalizeProductUrl(raw);

  try {
    const row = await prisma.scannedProduct.findUnique({
      where: { originalUrl: normalized },
      select: {
        id: true,
        scrapeData: true,
        aiPrediction: true,
        aliexpressData: true,
        lastScrapedAt: true,
      },
    });

    if (!row) return notFound();

    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const ali = parseAliExpressData(row.aliexpressData);

    // A cached verdict without a supplier match is still a hit — the badge
    // tier comes from the verdict; supplier prices are optional enrichment.
    if (!scrape || !ai) return notFound();

    const storePrice =
      ai.prediction?.estimatedStorePriceUsd ??
      scrape.detectedStorePriceUsd ??
      null;
    const aliPrice = ali?.priceUsd ?? null;

    let savingsPercent = 0;
    if (storePrice && aliPrice !== null && storePrice > aliPrice) {
      savingsPercent = Math.round(((storePrice - aliPrice) / storePrice) * 100);
    }

    const payload: LookupResponse = {
      found: true,
      scanId: row.id,
      storeTitle: scrape.attributes.title,
      storePriceUsd: storePrice,
      presenceTier: computePresenceTier(ai.prediction),
      verdict: ai.prediction?.verdict ?? null,
      aliPriceUsd: aliPrice,
      savingsPercent,
      permalink: `/scan/${row.id}`,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[ext-quick-lookup] query failed", err);
    return notFound();
  }
}
