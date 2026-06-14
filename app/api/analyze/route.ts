import { NextRequest, NextResponse } from "next/server";
import {
  getSafeErrorMessage,
  logPipelineError,
  resolveErrorCode,
  resolveHttpStatus,
} from "@/lib/api/error-utils";
import { PipelineWaterfall } from "@/lib/analyze/pipeline-waterfall";
import { buildSupplierMarketplacePrediction } from "@/lib/ai/supplier-marketplace-analysis";
import { verifyDropshipLikelihood } from "@/lib/ai/dropship-verifier";
import { findAliExpressSupplier } from "@/lib/aliexpress/find-supplier";
import { isSupplierSearchEnabled } from "@/lib/aliexpress/supplier-enabled";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import { findValidCachedProduct, normalizeProductUrl } from "@/lib/cache/product-cache";
import { persistScannedProduct } from "@/lib/cache/persist-product";
import {
  extractPriceFromMarkdown,
  extractStoreNameFromUrl,
} from "@/lib/scraping/extract-price";
import {
  detectProductSource,
  getSupplierMarketplaceLabel,
} from "@/lib/scraping/detect-source";
import { scrapeProductUrl } from "@/lib/scraping/router";
import { ScraperError } from "@/lib/scraping/types";
import type { CachedAiPrediction, CachedScrapeData } from "@/lib/types/cache";
import {
  parseCachedAiPrediction,
  parseCachedScrapeData,
} from "@/lib/types/cache";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import {
  type AnalyzeResponse,
  type ProductSourceType,
  parseAliExpressData,
} from "@/lib/types/analyze";

const MARKDOWN_PREVIEW_CHARS = 1_500;

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    route: "/api/analyze",
    methods: ["GET", "POST"],
    message: "POST a JSON body with { url: string } to analyze a product.",
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function shouldIncludeDebug(requested: boolean | undefined): boolean {
  return requested === true || process.env.NODE_ENV === "development";
}

function buildDebugScrape(
  normalizedUrl: string,
  scrape: CachedScrapeData,
): AnalyzeDebugInfo["scrape"] {
  return {
    provider: scrape.provider,
    normalizedUrl,
    metadata: {
      title: scrape.attributes.title,
      description: scrape.attributes.description,
      ogImage: scrape.attributes.mainImageUrl ?? undefined,
      sourceUrl: scrape.attributes.sourceUrl,
    },
    attributes: scrape.attributes,
    detectedStorePriceUsd: scrape.detectedStorePriceUsd,
    storeName: scrape.storeName,
    markdownPreview: scrape.markdownPreview,
    markdownLength: scrape.markdownLength,
  };
}

function buildDebugFromCache(
  normalizedUrl: string,
  scrape: CachedScrapeData,
  ai: CachedAiPrediction,
  waterfall: PipelineWaterfall,
): AnalyzeDebugInfo {
  return {
    scrape: buildDebugScrape(normalizedUrl, scrape),
    ai: {
      provider: ai.provider,
      model: ai.model,
      prediction: ai.prediction,
      rawResponse: ai.rawResponse,
      error: ai.error,
    },
    waterfall: waterfall.entries,
    pipeline: {
      cacheStatus: "HIT",
      steps: [
        "Cache lookup",
        "Valid entry found (< 7 days)",
        "Restored scrape + AI prediction from database",
      ],
    },
  };
}

function errorResponse(
  originalUrl: string,
  message: string,
  code: string,
  status: number,
  debug?: AnalyzeDebugInfo,
): NextResponse<AnalyzeResponse> {
  return NextResponse.json(
    {
      status: "error",
      cache: "MISS",
      originalUrl,
      message,
      code,
      aliexpressData: null,
      ...(debug ? { debug } : {}),
    } satisfies AnalyzeResponse,
    { status, headers: { "X-Cache": "MISS" } },
  );
}

function resolveStorePrice(
  aiPrediction: CachedAiPrediction["prediction"],
  scrape: CachedScrapeData,
): number {
  return (
    aiPrediction?.estimatedStorePriceUsd ??
    scrape.detectedStorePriceUsd ??
    0
  );
}

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  let normalizedUrl = "";
  let partialDebug: AnalyzeDebugInfo | undefined;
  const waterfall = new PipelineWaterfall();

  try {
    const body = (await request.json()) as {
      url?: string;
      debug?: boolean;
      forceRefresh?: boolean;
    };
    const includeDebug = shouldIncludeDebug(body.debug);

    if (!body.url || typeof body.url !== "string" || !isValidHttpUrl(body.url)) {
      return errorResponse(
        body.url ?? "",
        "A valid HTTP or HTTPS product URL is required.",
        "INVALID_URL",
        400,
      );
    }

    normalizedUrl = normalizeProductUrl(body.url);
    waterfall.mark("cache", "Cache lookup initiated…");

    if (!body.forceRefresh) {
      const cached = await findValidCachedProduct(normalizedUrl);

      if (cached) {
        const scrape = parseCachedScrapeData(cached.scrapeData);
        const ai = parseCachedAiPrediction(cached.aiPrediction);
        const aliexpressData = parseAliExpressData(cached.aliexpressData);

        if (scrape && ai) {
          waterfall.mark("cache", "Cache HIT — scrape + AI restored (< 7 days)", "complete");

          if (!aliexpressData) {
            waterfall.mark(
              "supplier",
              "Supplier search skipped — AliExpress API not configured",
              "skipped",
            );
          } else {
            waterfall.mark(
              "supplier",
              "Supplier data restored from cache",
              "complete",
            );
          }

          waterfall.mark("persist", "Served from database — no live scrape", "skipped");

          const storePrice = resolveStorePrice(ai.prediction, scrape);

          const sourceType = detectProductSource(cached.originalUrl);

          const hitResponse: AnalyzeResponse = {
            status: "success",
            cache: "HIT",
            originalUrl: cached.originalUrl,
            aliexpressUrl: cached.aliexpressUrl,
            aliexpressData,
            supplierStatus: aliexpressData ? "complete" : "skipped",
            sourceType,
            supplierSkipReason: aliexpressData
              ? undefined
              : "AliExpress Affiliate API keys are not configured in .env",
            dropshipPrediction: ai.prediction,
            lastScrapedAt: cached.lastScrapedAt.toISOString(),
            storeProduct: {
              title: scrape.attributes.title,
              priceUsd: storePrice,
              imageUrl: scrape.attributes.mainImageUrl,
              storeName: scrape.storeName,
            },
            ...(includeDebug
              ? { debug: buildDebugFromCache(normalizedUrl, scrape, ai, waterfall) }
              : {}),
          };

          return NextResponse.json(hitResponse, {
            status: 200,
            headers: { "X-Cache": "HIT" },
          });
        }
      }
    }

    waterfall.mark("cache", "Cache MISS — starting live scrape", "complete");
    const pipelineSteps = ["Cache lookup", "Cache miss — starting scrape"];

    const scrapeResult = await scrapeProductUrl(normalizedUrl);
    pipelineSteps.push(`Scraped via ${scrapeResult.raw.provider}`);
    waterfall.mark(
      "scrape",
      `Firecrawl returned Markdown (${scrapeResult.raw.markdown.length.toLocaleString()} chars). Title & price extracted.`,
    );

    const storePriceUsd = extractPriceFromMarkdown(scrapeResult.raw.markdown);
    const storeName = extractStoreNameFromUrl(normalizedUrl);

    const scrapeData: CachedScrapeData = {
      provider: scrapeResult.raw.provider,
      attributes: scrapeResult.attributes,
      detectedStorePriceUsd: storePriceUsd,
      storeName,
      markdownLength: scrapeResult.raw.markdown.length,
      markdownPreview: scrapeResult.raw.markdown.slice(0, MARKDOWN_PREVIEW_CHARS),
    };

    if (includeDebug) {
      partialDebug = {
        scrape: buildDebugScrape(normalizedUrl, scrapeData),
        ai: {
          provider: "pending",
          model: "pending",
          prediction: null,
          rawResponse: "",
          error: null,
        },
        waterfall: waterfall.entries,
        pipeline: { cacheStatus: "MISS", steps: pipelineSteps },
      };
    }

    pipelineSteps.push("Running AI dropship verification");
    const sourceType: ProductSourceType = detectProductSource(normalizedUrl);
    const isSupplierListing = sourceType === "supplier_marketplace";

    const aiResult = isSupplierListing
      ? (() => {
          const prediction = buildSupplierMarketplacePrediction(
            normalizedUrl,
            scrapeResult.attributes,
            storePriceUsd,
          );
          return {
            prediction,
            provider: "rules",
            model: "supplier-marketplace-detector",
            rawResponse: JSON.stringify(prediction, null, 2),
            error: null,
          };
        })()
      : await verifyDropshipLikelihood({
          attributes: scrapeResult.attributes,
          markdownExcerpt: scrapeResult.raw.markdown,
          storePriceUsd,
        });

    waterfall.mark(
      "ai",
      isSupplierListing
        ? `${getSupplierMarketplaceLabel(normalizedUrl)} detected — not a retail dropship target. Skipped AI markup analysis.`
        : aiResult.prediction
          ? `Gemini returned structured JSON. Confidence: ${Math.round(aiResult.prediction.confidence * 100)}%. Category: ${aiResult.prediction.productCategory}.`
          : `AI verification failed: ${aiResult.error ?? "unknown error"}`,
      isSupplierListing ? "skipped" : aiResult.prediction ? "complete" : "error",
    );

    pipelineSteps.push(
      isSupplierListing
        ? `Supplier marketplace URL — dropship check skipped (${getSupplierMarketplaceLabel(normalizedUrl)})`
        : aiResult.prediction
          ? `AI verdict: ${aiResult.prediction.isLikelyDropship ? "likely dropship" : "unclear"} (${Math.round(aiResult.prediction.confidence * 100)}%)`
          : "AI verification unavailable",
    );

    const aiPrediction: CachedAiPrediction = {
      provider: aiResult.provider,
      model: aiResult.model,
      prediction: aiResult.prediction,
      rawResponse: aiResult.rawResponse,
      error: aiResult.error,
      analyzedAt: new Date().toISOString(),
    };

    let aliexpressUrl: string | null = null;
    let aliexpressData = null;
    let supplierStatus: "complete" | "skipped" = "skipped";
    let supplierSkipReason: string | undefined =
      "AliExpress Affiliate API keys are not configured in .env";
    let supplierDebug: AnalyzeDebugInfo["supplier"] | undefined;

    if (isSupplierSearchEnabled() && !isSupplierListing) {
      pipelineSteps.push("Searching AliExpress for matching supplier");

      try {
        const match = await findAliExpressSupplier({
          attributes: scrapeResult.attributes,
          storePriceUsd,
        });

        aliexpressUrl = match.aliexpressUrl;
        aliexpressData = match.aliexpressData;
        supplierStatus = "complete";
        supplierSkipReason = undefined;

        waterfall.mark(
          "supplier",
          `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates). Affiliate ${match.searchMeta.affiliateLinkValidated ? "validated" : "fallback"}.`,
        );

        pipelineSteps.push(
          `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates)`,
        );

        supplierDebug = {
          keywords: match.searchMeta.keywords,
          provider: match.searchMeta.provider,
          candidateCount: match.searchMeta.candidateCount,
          winnerProductId: match.searchMeta.winnerProductId,
          winnerTitle: match.aliexpressData.title,
          winnerPriceUsd: match.aliexpressData.priceUsd,
          affiliateProvider: match.searchMeta.affiliateProvider,
          affiliateLinkValidated: match.searchMeta.affiliateLinkValidated,
        };
      } catch (error) {
        if (error instanceof AliExpressSearchError) {
          waterfall.mark("supplier", error.message, "error");
          pipelineSteps.push(`Supplier search failed: ${error.message}`);
        } else {
          throw error;
        }
      }
    } else if (isSupplierListing) {
      aliexpressUrl = normalizedUrl;
      waterfall.mark(
        "supplier",
        "Already on supplier marketplace — search skipped.",
        "skipped",
      );
      pipelineSteps.push("Supplier search skipped — URL is already an AliExpress listing");
    } else {
      waterfall.mark(
        "supplier",
        "Supplier search skipped — configure ALIEXPRESS_APP_KEY in .env to enable",
        "skipped",
      );
      pipelineSteps.push("Supplier search skipped — AliExpress API not configured");
    }

    const persisted = await persistScannedProduct({
      originalUrl: normalizedUrl,
      scrapeData,
      aiPrediction,
      aliexpressUrl,
      aliexpressData,
    });

    waterfall.mark("persist", "Scrape + AI prediction written to database.", "complete");
    pipelineSteps.push("Persisted scrape + AI to database");

    const storePrice =
      aiResult.prediction?.estimatedStorePriceUsd ?? storePriceUsd ?? 0;

    const successResponse: AnalyzeResponse = {
      status: "success",
      cache: "MISS",
      originalUrl: persisted.originalUrl,
      aliexpressUrl,
      aliexpressData,
      supplierStatus,
      supplierSkipReason,
      sourceType,
      dropshipPrediction: aiResult.prediction,
      lastScrapedAt: persisted.lastScrapedAt.toISOString(),
      scrapeProvider: scrapeResult.raw.provider,
      storeProduct: {
        title: scrapeResult.attributes.title,
        priceUsd: storePrice,
        imageUrl: scrapeResult.attributes.mainImageUrl,
        storeName,
      },
      ...(includeDebug
        ? {
            debug: {
              scrape: buildDebugScrape(normalizedUrl, scrapeData),
              ai: {
                provider: aiResult.provider,
                model: aiResult.model,
                prediction: aiResult.prediction,
                rawResponse: aiResult.rawResponse,
                error: aiResult.error,
              },
              supplier: supplierDebug,
              waterfall: waterfall.entries,
              pipeline: { cacheStatus: "MISS", steps: pipelineSteps },
            },
          }
        : {}),
    };

    return NextResponse.json(successResponse, {
      status: 200,
      headers: { "X-Cache": "MISS" },
    });
  } catch (error) {
    logPipelineError("pipeline failure", error);

    if (error instanceof ScraperError) {
      return errorResponse(
        normalizedUrl,
        error.message,
        error.code,
        error.statusCode,
        partialDebug,
      );
    }

    if (error instanceof AliExpressSearchError) {
      return errorResponse(
        normalizedUrl,
        error.message,
        error.code,
        error.statusCode,
        partialDebug,
      );
    }

    return errorResponse(
      normalizedUrl,
      getSafeErrorMessage(error, "Unable to process analyze request."),
      resolveErrorCode(error),
      resolveHttpStatus(error),
      partialDebug,
    );
  }
}
