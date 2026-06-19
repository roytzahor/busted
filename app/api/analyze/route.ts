import { NextRequest, NextResponse } from "next/server";
import {
  getSafeErrorMessage,
  logPipelineError,
  resolveErrorCode,
  resolveHttpStatus,
} from "@/lib/api/error-utils";
import { checkRateLimit, resolveClientIp } from "@/lib/api/rate-limit";
import { isValidProductUrl } from "@/lib/api/validate-url";
import { PipelineWaterfall } from "@/lib/analyze/pipeline-waterfall";
import { findAliExpressSupplier } from "@/lib/aliexpress/find-supplier";
import { isSupplierSearchEnabled } from "@/lib/aliexpress/supplier-enabled";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import { findValidCachedProduct, normalizeProductUrl } from "@/lib/cache/product-cache";
import {
  patchCachedAliExpressData,
  persistScannedProduct,
} from "@/lib/cache/persist-product";
import {
  detectProductSource,
  getSupplierMarketplaceLabel,
} from "@/lib/scraping/detect-source";
import { ScraperError } from "@/lib/scraping/types";
import { verify as verdictService } from "@/lib/services/dropship-verdict";
import { identify as identifierService } from "@/lib/services/product-identifier";
import { scrape as scraperService } from "@/lib/services/scraper";
import { findSupplier as supplierService } from "@/lib/services/supplier-match";
import type { ProductIdentity, ServiceEvent } from "@/lib/services/types";
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

function shouldIncludeDebug(requested: boolean | undefined): boolean {
  // Debug info is only available in development — never expose pipeline internals in production.
  return process.env.NODE_ENV === "development" && requested === true;
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
  // Rate limiting — 10 requests per IP per minute
  const ip = resolveClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        status: "error",
        cache: "MISS",
        originalUrl: "",
        message: "Too many requests. Please wait a moment before scanning again.",
        code: "RATE_LIMITED",
        aliexpressData: null,
      } satisfies AnalyzeResponse,
      {
        status: 429,
        headers: {
          "X-Cache": "MISS",
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

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

    if (!body.url || typeof body.url !== "string") {
      return errorResponse("", "A valid HTTP or HTTPS product URL is required.", "INVALID_URL", 400);
    }

    const urlCheck = isValidProductUrl(body.url);
    if (!urlCheck.ok) {
      return errorResponse(body.url, urlCheck.reason, "INVALID_URL", 400);
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
          waterfall.mark("cache", "Cache HIT — scrape + AI restored (< 14 days)", "complete");

          const sourceType = detectProductSource(cached.originalUrl);
          const isSupplierListing = sourceType === "supplier_marketplace";
          const aiVerdict = ai.prediction?.verdict;
          const verdictBlocksSupplier =
            aiVerdict === "not_a_product" || aiVerdict === "insufficient_evidence";

          let resolvedAliexpressData = aliexpressData;
          let resolvedAliexpressUrl: string | null = cached.aliexpressUrl;
          let resolvedSupplierStatus: "complete" | "skipped" = aliexpressData
            ? "complete"
            : "skipped";
          let resolvedSupplierSkipReason: string | undefined;
          let resolvedMatchConfidence: number | undefined;
          let resolvedMatchQuality: "high" | "medium" | "low" | "none" | undefined;
          let resolvedMatchReasons: string[] | undefined;
          let resolvedImageMatchScore: number | undefined;
          let resolvedImageMatchSameFunction: boolean | undefined;
          let resolvedImageMatchReasoning: string | undefined;

          if (!aliexpressData && isSupplierSearchEnabled() && !isSupplierListing && !verdictBlocksSupplier) {
            // Cached record has no AliExpress data (was scanned before keys were configured).
            // Run supplier search now using the cached scrape + AI attributes.
            waterfall.mark("supplier", "Cache had no supplier data — running live search…");
            try {
              const match = await findAliExpressSupplier({
                attributes: scrape.attributes,
                storePriceUsd: scrape.detectedStorePriceUsd,
                productCategory: ai.prediction?.productCategory,
                aiKeywords: ai.prediction?.aliexpressKeywords,
              });
              resolvedAliexpressData = match.aliexpressData;
              resolvedAliexpressUrl = match.aliexpressUrl;
              resolvedSupplierStatus = "complete";
              resolvedMatchConfidence = match.matchConfidence;
              resolvedMatchQuality = match.matchQuality;
              resolvedMatchReasons = match.matchReasons;
              resolvedImageMatchScore = match.imageMatchScore;
              resolvedImageMatchSameFunction = match.imageMatchSameFunction;
              resolvedImageMatchReasoning = match.imageMatchReasoning;

              waterfall.mark(
                "supplier",
                `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates, ${(match.matchConfidence * 100).toFixed(0)}% confidence). Patching cache record.`,
                "complete",
              );

              // Patch the DB so future cache hits include the supplier data
              await patchCachedAliExpressData({
                originalUrl: normalizedUrl,
                aliexpressUrl: match.aliexpressUrl,
                aliexpressData: match.aliexpressData,
              });
              waterfall.mark("persist", "AliExpress data patched into cache record.", "complete");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Supplier search failed.";
              resolvedSupplierSkipReason = msg;
              waterfall.mark("supplier", `Live supplier search failed: ${msg}`, "error");
              waterfall.mark("persist", "Served from database — no live scrape", "skipped");
            }
          } else if (aliexpressData) {
            waterfall.mark("supplier", "Supplier data restored from cache", "complete");
            waterfall.mark("persist", "Served from database — no live scrape", "skipped");
          } else {
            const skipReason = isSupplierListing
              ? "Already on supplier marketplace"
              : verdictBlocksSupplier
                ? `AI verdict (${aiVerdict}) — supplier search skipped`
                : "AliExpress supplier search not enabled";
            resolvedSupplierSkipReason = skipReason;
            waterfall.mark("supplier", skipReason, "skipped");
            waterfall.mark("persist", "Served from database — no live scrape", "skipped");
          }

          const storePrice = resolveStorePrice(ai.prediction, scrape);

          const hitResponse: AnalyzeResponse = {
            status: "success",
            cache: "HIT",
            originalUrl: cached.originalUrl,
            aliexpressUrl: resolvedAliexpressUrl,
            aliexpressData: resolvedAliexpressData,
            supplierStatus: resolvedSupplierStatus,
            supplierSkipReason: resolvedSupplierSkipReason,
            supplierMatchConfidence: resolvedMatchConfidence,
            supplierMatchQuality: resolvedMatchQuality,
            supplierMatchReasons: resolvedMatchReasons,
            supplierImageMatchScore: resolvedImageMatchScore,
            supplierImageMatchSameFunction: resolvedImageMatchSameFunction,
            supplierImageMatchReasoning: resolvedImageMatchReasoning,
            sourceType,
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
    const serviceEvents: ServiceEvent[] = [];

    // ── ScraperService ────────────────────────────────────────────────
    const scrapeRes = await scraperService({ url: normalizedUrl });
    serviceEvents.push(...scrapeRes.events);

    if (!scrapeRes.ok) {
      throw new ScraperError(
        scrapeRes.error.code,
        scrapeRes.error.message,
        scrapeRes.error.recoverable ? 422 : 500,
      );
    }

    const scrapeOut = scrapeRes.value;
    const storePriceUsd = scrapeOut.detectedStorePriceUsd;
    const storeName = scrapeOut.storeName;
    pipelineSteps.push(`Scraped via ${scrapeOut.provider}`);
    waterfall.mark(
      "scrape",
      `Firecrawl returned Markdown (${scrapeOut.markdown.length.toLocaleString()} chars). Title & price extracted.`,
    );

    const scrapeData: CachedScrapeData = {
      provider: scrapeOut.provider,
      attributes: scrapeOut.attributes,
      detectedStorePriceUsd: storePriceUsd,
      storeName,
      markdownLength: scrapeOut.markdown.length,
      markdownPreview: scrapeOut.markdown.slice(0, MARKDOWN_PREVIEW_CHARS),
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

    // ── ProductIdentifierService (Phase 3 — wired, output not yet consumed) ──
    const sourceType: ProductSourceType = detectProductSource(normalizedUrl);
    let identity: ProductIdentity | null = null;
    if (sourceType !== "supplier_marketplace") {
      const identifierRes = await identifierService({
        attributes: scrapeOut.attributes,
        markdown: scrapeOut.markdown,
      });
      serviceEvents.push(...identifierRes.events);
      if (identifierRes.ok) {
        identity = identifierRes.value.identity;
        if (identity) {
          waterfall.mark(
            "ai",
            `Identified: "${identity.canonicalName}" (${identity.source}, conf ${Math.round(identity.confidence * 100)}%)`,
          );
          pipelineSteps.push(
            `Identifier: ${identity.canonicalName} [${identity.searchKeywords.primary.slice(0, 3).join(", ")}]`,
          );
        }
      } else {
        pipelineSteps.push(`Identifier unavailable: ${identifierRes.error.message}`);
      }
    }

    // ── DropshipVerdictService ───────────────────────────────────────
    pipelineSteps.push("Running AI dropship verification");

    const verdictRes = await verdictService({
      url: normalizedUrl,
      attributes: scrapeOut.attributes,
      markdown: scrapeOut.markdown,
      storePriceUsd,
    });
    serviceEvents.push(...verdictRes.events);

    // Verdict failure is recoverable — we proceed with null prediction.
    const verdictOut = verdictRes.ok
      ? verdictRes.value
      : {
          prediction: null,
          provider: "google",
          model: process.env.GOOGLE_AI_MODEL ?? "gemini-3.5-flash",
          rawResponse: "",
          error: verdictRes.error.message,
          isSupplierListing: sourceType === "supplier_marketplace",
        };

    const isSupplierListing = verdictOut.isSupplierListing;
    const aiResult = {
      prediction: verdictOut.prediction,
      provider: verdictOut.provider,
      model: verdictOut.model,
      rawResponse: verdictOut.rawResponse,
      error: verdictOut.error,
    };

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
    let supplierMatchConfidence: number | undefined;
    let supplierMatchQuality: "high" | "medium" | "low" | "none" | undefined;
    let supplierMatchReasons: string[] | undefined;
    let supplierImageMatchScore: number | undefined;
    let supplierImageMatchSameFunction: boolean | undefined;
    let supplierImageMatchReasoning: string | undefined;
    let supplierDebug: AnalyzeDebugInfo["supplier"] | undefined;

    // ── SupplierMatchService ──────────────────────────────────────────
    pipelineSteps.push(
      identity
        ? `Searching AliExpress (identity: ${identity.canonicalName})`
        : "Searching AliExpress for matching supplier",
    );
    const supplierRes = await supplierService({
      attributes: scrapeOut.attributes,
      storePriceUsd,
      prediction: aiResult.prediction,
      isSupplierListing,
      identity,
    });
    serviceEvents.push(...supplierRes.events);

    if (!supplierRes.ok) {
      // Hard failure (non-recoverable supplier error) — bail
      throw new AliExpressSearchError(
        supplierRes.error.code,
        supplierRes.error.message,
        supplierRes.error.recoverable ? 422 : 500,
      );
    }

    const supplierOut = supplierRes.value;
    if (supplierOut.kind === "matched") {
      const match = supplierOut.match;
      aliexpressUrl = match.aliexpressUrl;
      aliexpressData = match.aliexpressData;
      supplierStatus = "complete";
      supplierSkipReason = undefined;
      supplierMatchConfidence = match.matchConfidence;
      supplierMatchQuality = match.matchQuality;
      supplierMatchReasons = match.matchReasons;
      supplierImageMatchScore = match.imageMatchScore;
      supplierImageMatchSameFunction = match.imageMatchSameFunction;
      supplierImageMatchReasoning = match.imageMatchReasoning;

      const imgNote =
        typeof match.imageMatchScore === "number"
          ? ` · img-AI ${(match.imageMatchScore * 100).toFixed(0)}%${match.imageMatchSameFunction === false ? " (different function!)" : ""}`
          : "";
      waterfall.mark(
        "supplier",
        `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates). Match ${(match.matchConfidence * 100).toFixed(0)}% (${match.matchQuality})${imgNote}. Affiliate ${match.searchMeta.affiliateLinkValidated ? "validated" : "fallback"}.`,
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
        // Stage 7 — SmartMatch + preprocess outcome tracking.
        ...(match.searchMeta.preprocessAttempted !== undefined
          ? {
              preprocess: {
                attempted: match.searchMeta.preprocessAttempted,
                cacheHit: match.searchMeta.preprocessCacheHit,
                durationMs: match.searchMeta.preprocessDurationMs,
                qualityScore: match.searchMeta.preprocessQualityScore,
                lightPromptUsed: match.searchMeta.preprocessLightPromptUsed,
              },
            }
          : {}),
        ...(match.searchMeta.smartmatchArm !== undefined
          ? {
              smartmatch: {
                arm: match.searchMeta.smartmatchArm,
                candidateCount: match.searchMeta.smartmatchCandidateCount,
              },
            }
          : {}),
        ...(match.searchMeta.categoryVocabMiss
          ? { categoryVocabMiss: match.searchMeta.categoryVocabMiss }
          : {}),
        // Sprint 9 Stage 14 — routing + vision context for the monitoring UI.
        ...(match.searchMeta.shipToCountry ||
        match.searchMeta.categoryVertical ||
        match.searchMeta.negativeKeywordsFiltered !== undefined
          ? {
              routing: {
                shipToCountry: match.searchMeta.shipToCountry,
                targetCurrency: match.searchMeta.targetCurrency,
                categoryVertical: match.searchMeta.categoryVertical,
                categoryIds: match.searchMeta.categoryIds,
                negativeKeywordsFiltered: match.searchMeta.negativeKeywordsFiltered,
              },
            }
          : {}),
        ...(match.searchMeta.ocrTraces?.length ||
        match.searchMeta.materialTokens?.length ||
        match.searchMeta.technicalSpecs?.length
          ? {
              vision: {
                ocrTraces: match.searchMeta.ocrTraces,
                materialTokens: match.searchMeta.materialTokens,
                technicalSpecs: match.searchMeta.technicalSpecs,
              },
            }
          : {}),
      };
    } else if (supplierOut.kind === "no_match") {
      supplierSkipReason = supplierOut.reason;
      waterfall.mark("supplier", supplierOut.reason, "skipped");
      pipelineSteps.push(`No supplier match: ${supplierOut.reason}`);
    } else {
      // kind === "skipped" — reason already populated by SupplierMatchService
      supplierSkipReason = supplierOut.reason;
      if (isSupplierListing) {
        aliexpressUrl = normalizedUrl;
      }
      waterfall.mark("supplier", supplierOut.reason, "skipped");
      pipelineSteps.push(`Supplier search skipped — ${supplierOut.reason}`);
    }

    const persisted = await persistScannedProduct({
      originalUrl: normalizedUrl,
      scrapeData,
      aiPrediction,
      aliexpressUrl,
      aliexpressData,
      events: serviceEvents,
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
      supplierMatchConfidence,
      supplierMatchQuality,
      supplierMatchReasons,
      supplierImageMatchScore,
      supplierImageMatchSameFunction,
      supplierImageMatchReasoning,
      sourceType,
      dropshipPrediction: aiResult.prediction,
      lastScrapedAt: persisted.lastScrapedAt.toISOString(),
      scrapeProvider: scrapeOut.provider,
      storeProduct: {
        title: scrapeOut.attributes.title,
        priceUsd: storePrice,
        imageUrl: scrapeOut.attributes.mainImageUrl,
        storeName,
      },
      ...(includeDebug
        ? {
            debug: {
              scrape: buildDebugScrape(normalizedUrl, scrapeData),
              serviceEvents,
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
