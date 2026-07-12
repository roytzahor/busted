import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePresenceTier, type PresenceTier } from "@/lib/analyze/presence-tier";
import { isCacheValid, normalizeProductUrl } from "@/lib/cache/product-cache";
import { domainFromUrl } from "@/lib/learning/priors";
import { computeDomainTier } from "@/lib/store/report";
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
      /**
       * "url" — a cached scan of this exact product page.
       * "domain" — no per-URL scan (or it's stale); this store has ≥2
       * decisive scans and a "flagged" aggregate tier (see
       * lib/store/report.ts). Weaker evidence than a direct verdict, so
       * presenceTier is capped at "amber" — never "flame" — for a domain hit.
       */
      basis: "url" | "domain";
      scanId: string | null;
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

function found(payload: LookupResponse): NextResponse<LookupResponse> {
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}

/**
 * Falls back to the store's aggregate tier when there's no usable per-URL
 * scan. Only a "flagged" store (≥2 decisive scans, ≥60% dropship) produces a
 * signal — "mixed"/"clean"/"insufficient" stay silent, same smoke-alarm rule
 * as the /store/[domain] page. presenceTier is capped at "amber": this is
 * inferred from other products on the same store, not a verdict on this one.
 */
async function domainFallback(rawUrl: string): Promise<NextResponse<LookupResponse>> {
  const domain = domainFromUrl(rawUrl);
  if (!domain) return notFound();

  const domainTier = await computeDomainTier(domain);
  if (domainTier?.tier !== "flagged") return notFound();

  return found({
    found: true,
    basis: "domain",
    scanId: null,
    storeTitle: domain,
    storePriceUsd: null,
    presenceTier: "amber",
    verdict: null,
    aliPriceUsd: null,
    savingsPercent: 0,
    permalink: `/store/${domain}`,
  });
}

export async function GET(request: NextRequest): Promise<NextResponse<LookupResponse>> {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ found: false }, { status: 200, headers: CORS_HEADERS });
  }

  let normalized: string;
  try {
    normalized = normalizeProductUrl(raw);
  } catch {
    return notFound();
  }

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

    // Missing, unparseable, or past the same 14-day TTL the rest of the app
    // enforces (lib/cache/product-cache.ts) — fall back to the store's
    // aggregate tier rather than confidently badging on stale data.
    if (!row || !isCacheValid(row.lastScrapedAt)) return domainFallback(raw);

    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const ali = parseAliExpressData(row.aliexpressData);

    // A cached verdict without a supplier match is still a hit — the badge
    // tier comes from the verdict; supplier prices are optional enrichment.
    if (!scrape || !ai) return domainFallback(raw);

    const storePrice =
      ai.prediction?.estimatedStorePriceUsd ??
      scrape.detectedStorePriceUsd ??
      null;
    const aliPrice = ali?.priceUsd ?? null;

    let savingsPercent = 0;
    if (storePrice && aliPrice !== null && storePrice > aliPrice) {
      savingsPercent = Math.round(((storePrice - aliPrice) / storePrice) * 100);
    }

    return found({
      found: true,
      basis: "url",
      scanId: row.id,
      storeTitle: scrape.attributes.title,
      storePriceUsd: storePrice,
      presenceTier: computePresenceTier(ai.prediction),
      verdict: ai.prediction?.verdict ?? null,
      aliPriceUsd: aliPrice,
      savingsPercent,
      permalink: `/scan/${row.id}`,
    });
  } catch (err) {
    console.error("[ext-quick-lookup] query failed", err);
    return notFound();
  }
}
