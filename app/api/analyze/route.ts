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
import { computePresenceTier } from "@/lib/analyze/presence-tier";
import { findAliExpressSupplier } from "@/lib/aliexpress/find-supplier";
import {
  searchBrowseCandidates,
  BROWSE_CANDIDATE_LIMIT,
} from "@/lib/aliexpress/browse-search";
import { isSupplierSearchEnabled } from "@/lib/aliexpress/supplier-enabled";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import { findValidCachedProduct, normalizeProductUrl } from "@/lib/cache/product-cache";
import {
  findVerifiedMatch,
  getVerifiedMatchTtlDays,
  recordVerifiedMatch,
} from "@/lib/cache/verified-map";
import { prisma } from "@/lib/prisma";
import { recordMatchOutcome } from "@/lib/learning/record-outcome";
import { deriveOutcomeVertical } from "@/lib/aliexpress/category-map";
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
  type AliExpressBrowseCandidate,
  type AnalyzeResponse,
  type ProductSourceType,
  parseAliExpressData,
} from "@/lib/types/analyze";

const MARKDOWN_PREVIEW_CHARS = 1_500;

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Stage 17 — SSE event types ────────────────────────────────────────────────

type SSEStage = "cache-lookup" | "scrape" | "identify" | "verdict" | "supplier-search" | "persist";
type SSEStageStatus = "active" | "done" | "skipped" | "error" | "hit" | "miss";

type SSEEvent =
  | { type: "stage"; stage: SSEStage; status: SSEStageStatus; message?: string }
  | { type: "final"; payload: AnalyzeResponse }
  | { type: "error"; code: string; message: string };

type PipelineEmitFn = (event: SSEEvent) => void;
const NOOP_EMIT: PipelineEmitFn = () => { /* no-op for JSON path */ };

// ── Pipeline result ───────────────────────────────────────────────────────────

interface PipelineResult {
  response: AnalyzeResponse;
  cacheHeader: "HIT" | "MISS";
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Minimum confidence for an *automatic* catch-and-commit into the verified map.
 *
 * Deliberately high (default 0.85). Auto-commit installs a 6-month hot-path
 * bypass with zero AI re-checks, so a wrong-but-confident match would be served
 * for the whole TTL window — the most damaging failure mode. We therefore only
 * auto-commit a match that is high-confidence, NOT best-effort, positively
 * image-verified (sameFunction === true — a skipped or failed image check does
 * NOT qualify; text score ≥ 0.85 skips image AI, so without this requirement a
 * text-only match would clear the identical 0.85 bar unverified), and from the
 * AliExpress network (the verified map stores AliExpress mappings only).
 * Explicit user 👍 has no such gate.
 */
const VERIFIED_AUTOCOMMIT_DEFAULT_MIN = 0.85;

function getVerifiedAutoCommitMin(): number {
  const raw = process.env.VERIFIED_AUTOCOMMIT_MIN;
  if (!raw) return VERIFIED_AUTOCOMMIT_DEFAULT_MIN;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : VERIFIED_AUTOCOMMIT_DEFAULT_MIN;
}

/**
 * Catch & Commit — fire-and-forget. Persists a hard-won, high-confidence match
 * to the VerifiedProductMap so the next scan of this URL hits the Gold Path.
 * No-op unless the match clears the safety bar (see getVerifiedAutoCommitMin).
 */
function maybeAutoCommitVerified(p: {
  originalUrl: string;
  scanId?: string | null;
  aliexpressUrl: string | null;
  aliexpressData: import("@/lib/types/analyze").AliExpressProductData | null;
  matchConfidence?: number;
  matchQuality?: "high" | "medium" | "low" | "none";
  imageSameFunction?: boolean;
  bestEffortOnly?: boolean;
  winnerProductId?: string;
  supplierNetwork?: "aliexpress" | "ebay" | "amazon" | "temu_aggregator";
}): void {
  if (!p.aliexpressUrl || !p.aliexpressData) return;
  if (p.bestEffortOnly) return;
  if ((p.supplierNetwork ?? "aliexpress") !== "aliexpress") return;
  if (p.imageSameFunction !== true) return; // must be positively image-verified
  if (typeof p.matchConfidence !== "number" || p.matchConfidence < getVerifiedAutoCommitMin()) {
    return;
  }
  void recordVerifiedMatch({
    originalUrl: p.originalUrl,
    aliexpressUrl: p.aliexpressUrl,
    aliexpressData: p.aliexpressData,
    source: "auto_high_confidence",
    scanId: p.scanId ?? null,
    aliexpressProductId: p.winnerProductId ?? null,
    matchConfidence: p.matchConfidence ?? null,
    matchQuality: p.matchQuality ?? null,
  });
}

/**
 * True when the last match served for this URL was marked "wrong" by the user
 * AFTER its scan was scraped — the signal that the upcoming supplier search is
 * an escalation retry worth spending Tier-2 compute on, as opposed to a
 * routine re-scan or first search. Defensive: false on any DB error, so the
 * pipeline never depends on the feedback table being reachable.
 */
async function wasMatchMarkedWrong(normalizedUrl: string): Promise<boolean> {
  try {
    const scan = await prisma.scannedProduct.findUnique({
      where: { originalUrl: normalizedUrl },
      select: { id: true, lastScrapedAt: true },
    });
    if (!scan) return false;
    const feedback = await prisma.matchFeedback.findUnique({
      where: { scanId: scan.id },
      select: { verdict: true, updatedAt: true },
    });
    return feedback?.verdict === "wrong" && feedback.updatedAt > scan.lastScrapedAt;
  } catch {
    return false;
  }
}

function shouldIncludeDebug(requested: boolean | undefined): boolean {
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

interface BrowseSearchOutcome {
  candidates: AliExpressBrowseCandidate[];
  query: string;
  skipReason?: string;
}

/**
 * Browse-mode candidate fetch. Cache HIT and MISS paths both call this when
 * the AI verdict is `collection_page`. We intentionally re-run the search on
 * every request (no candidate persistence) — browse inventory rotation is a
 * feature here, and the call is a single keyword query.
 */
async function runBrowseSearch(
  prediction: NonNullable<CachedAiPrediction["prediction"]>,
  emit: PipelineEmitFn,
  waterfall: PipelineWaterfall,
): Promise<BrowseSearchOutcome> {
  if (!isSupplierSearchEnabled()) {
    const reason = "AliExpress Affiliate API keys are not configured";
    emit({ type: "stage", stage: "supplier-search", status: "skipped", message: reason });
    waterfall.mark("supplier", `Browse-mode skipped — ${reason}.`, "skipped");
    return { candidates: [], query: "", skipReason: reason };
  }

  emit({
    type: "stage",
    stage: "supplier-search",
    status: "active",
    message: `Browse mode — searching AliExpress for "${prediction.productCategory}"…`,
  });

  try {
    const result = await searchBrowseCandidates({
      productCategory: prediction.productCategory,
      styleTokens: prediction.styleTokens,
      materialPriors: prediction.materialPriors,
    });
    emit({
      type: "stage",
      stage: "supplier-search",
      status: "done",
      message: `${result.candidates.length} browse candidates · query: "${result.query}"`,
    });
    waterfall.mark(
      "supplier",
      `Browse mode: ${result.candidates.length} candidates returned for "${result.query}" (capped at ${BROWSE_CANDIDATE_LIMIT}).`,
      "complete",
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Browse search failed.";
    emit({ type: "stage", stage: "supplier-search", status: "error", message: msg });
    waterfall.mark("supplier", `Browse search failed: ${msg}`, "error");
    return { candidates: [], query: "", skipReason: msg };
  }
}

// ── Core pipeline (shared by JSON and SSE paths) ──────────────────────────────

async function runAnalysisPipeline(
  normalizedUrl: string,
  opts: { includeDebug: boolean; forceRefresh: boolean },
  emit: PipelineEmitFn,
): Promise<PipelineResult> {
  let partialDebug: AnalyzeDebugInfo | undefined;
  const waterfall = new PipelineWaterfall();

  // ── 0. Verified hot path (Gold Path) ──────────────────────────────────────
  // A confirmed retail→supplier mapping bypasses the ENTIRE pipeline: no
  // scrape, no AI, no supplier search. Instant HIT, 0ms AI latency, $0 cost.
  // forceRefresh (used by the "re-scan" / escalate flow) intentionally skips it.
  if (!opts.forceRefresh) {
    const verified = await findVerifiedMatch(normalizedUrl);
    if (verified) {
      // Restore store-side display data from the (possibly TTL-stale) scan row.
      // We read it directly — the verified TTL outlives the 14-day scrape TTL,
      // and a verified mapping means the store data is good enough to render.
      const display = await prisma.scannedProduct
        .findUnique({ where: { originalUrl: normalizedUrl } })
        .catch(() => null);
      const scrape = display ? parseCachedScrapeData(display.scrapeData) : null;
      const ai = display ? parseCachedAiPrediction(display.aiPrediction) : null;

      if (display && scrape && ai) {
        emit({ type: "stage", stage: "cache-lookup", status: "hit", message: "Verified match — pipeline bypassed" });
        emit({ type: "stage", stage: "scrape", status: "skipped", message: "Verified — no scrape needed" });
        emit({ type: "stage", stage: "supplier-search", status: "skipped", message: "Verified — supplier already confirmed" });
        waterfall.mark("cache", `Verified hot path HIT — confirmed mapping (TTL ${getVerifiedMatchTtlDays()}d). Skipped scrape + AI + supplier search.`, "complete");
        waterfall.mark("supplier", "Supplier restored from verified mapping.", "complete");
        waterfall.mark("persist", "Served from verified map — no live work.", "skipped");

        const storePrice = resolveStorePrice(ai.prediction, scrape);
        const verifiedResponse: AnalyzeResponse = {
          status: "success",
          cache: "HIT",
          originalUrl: display.originalUrl,
          scanId: display.id,
          verified: true,
          verifiedSource: verified.row.source === "user_feedback" ? "user_feedback" : "auto_high_confidence",
          verifiedAt: verified.row.verifiedAt.toISOString(),
          aliexpressUrl: verified.row.aliexpressUrl,
          aliexpressData: verified.aliexpressData,
          supplierStatus: "complete",
          supplierMatchConfidence: verified.row.matchConfidence ?? undefined,
          supplierMatchQuality:
            (verified.row.matchQuality as "high" | "medium" | "low" | "none" | null) ?? undefined,
          sourceType: detectProductSource(display.originalUrl),
          dropshipPrediction: ai.prediction,
          presenceTier: computePresenceTier(ai.prediction),
          lastScrapedAt: display.lastScrapedAt.toISOString(),
          storeProduct: {
            title: scrape.attributes.title,
            ...(scrape.attributes.translatedTitle
              ? { translatedTitle: scrape.attributes.translatedTitle }
              : {}),
            priceUsd: storePrice,
            imageUrl: scrape.attributes.mainImageUrl,
            storeName: scrape.storeName,
          },
          ...(opts.includeDebug
            ? { debug: buildDebugFromCache(normalizedUrl, scrape, ai, waterfall) }
            : {}),
        };

        // Learning loop — verified hits must stay visible to the cron
        // aggregator, or gold-path coverage growth silently starves the
        // per-domain priors (fire-and-forget).
        recordMatchOutcome({
          scanId: display.id,
          originalUrl: display.originalUrl,
          category: ai.prediction?.productCategory ?? null,
          vertical: deriveOutcomeVertical(ai.prediction?.productCategory ?? null),
          scrapeProvider: scrape.provider ?? null,
          verdict: ai.prediction?.verdict ?? null,
          matchConfidence: verified.row.matchConfidence,
          matchQuality: verified.row.matchQuality,
          bestEffortOnly: false,
          winningKeywords: ai.prediction?.aliexpressKeywords ?? [],
        });

        return { response: verifiedResponse, cacheHeader: "HIT" };
      }
      // No display data to render — fall through to the normal pipeline (rare).
    }
  }

  // ── 1. Cache lookup ──────────────────────────────────────────────────────────
  emit({ type: "stage", stage: "cache-lookup", status: "active", message: "Checking 14-day cache…" });
  waterfall.mark("cache", "Cache lookup initiated…");

  if (!opts.forceRefresh) {
    const cached = await findValidCachedProduct(normalizedUrl);

    if (cached) {
      const scrape = parseCachedScrapeData(cached.scrapeData);
      const ai = parseCachedAiPrediction(cached.aiPrediction);
      const aliexpressData = parseAliExpressData(cached.aliexpressData);

      if (scrape && ai) {
        waterfall.mark("cache", "Cache HIT — scrape + AI restored (< 14 days)", "complete");
        emit({ type: "stage", stage: "cache-lookup", status: "hit", message: "Served from 14-day cache" });

        const sourceType = detectProductSource(cached.originalUrl);
        const isSupplierListing = sourceType === "supplier_marketplace";
        const aiVerdict = ai.prediction?.verdict;
        const isCollectionPage = aiVerdict === "collection_page";
        const verdictBlocksSupplier =
          aiVerdict === "not_a_product" ||
          aiVerdict === "insufficient_evidence" ||
          isCollectionPage;

        let resolvedAliexpressData = aliexpressData;
        let resolvedAliexpressUrl: string | null = cached.aliexpressUrl;
        let resolvedSupplierStatus: "complete" | "skipped" = aliexpressData ? "complete" : "skipped";
        let resolvedSupplierSkipReason: string | undefined;
        let resolvedMatchConfidence: number | undefined;
        let resolvedMatchQuality: "high" | "medium" | "low" | "none" | undefined;
        let resolvedMatchReasons: string[] | undefined;
        let resolvedImageMatchScore: number | undefined;
        let resolvedImageMatchSameFunction: boolean | undefined;
        let resolvedImageMatchReasoning: string | undefined;
        let resolvedBrowseCandidates: AliExpressBrowseCandidate[] | undefined;
        let resolvedBrowseQuery: string | undefined;

        // Browse mode — collection_page verdict re-runs the lightweight
        // keyword search on every request (we never persist candidates).
        if (isCollectionPage && ai.prediction) {
          const browse = await runBrowseSearch(ai.prediction, emit, waterfall);
          resolvedBrowseCandidates = browse.candidates;
          resolvedBrowseQuery = browse.query || undefined;
          resolvedSupplierSkipReason =
            browse.skipReason ?? `Browse mode (${browse.candidates.length} candidates)`;
          waterfall.mark("persist", "Served from database — no live scrape", "skipped");
        } else if (!aliexpressData && isSupplierSearchEnabled() && !isSupplierListing && !verdictBlocksSupplier) {
          emit({ type: "stage", stage: "supplier-search", status: "active", message: "No cached supplier — running live search…" });
          waterfall.mark("supplier", "Cache had no supplier data — running live search…");
          try {
            const match = await findAliExpressSupplier({
              attributes: scrape.attributes,
              storePriceUsd: scrape.detectedStorePriceUsd,
              productCategory: ai.prediction?.productCategory,
              aiKeywords: ai.prediction?.aliexpressKeywords,
              // A "wrong" verdict clears the cached supplier data, so the
              // retry lands here — escalate it so the redo is materially
              // better than the search the user just rejected.
              escalate: await wasMatchMarkedWrong(normalizedUrl),
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
            emit({ type: "stage", stage: "supplier-search", status: "done", message: `${match.searchMeta.candidateCount} candidates · ${(match.matchConfidence * 100).toFixed(0)}% confidence` });
            waterfall.mark(
              "supplier",
              `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates, ${(match.matchConfidence * 100).toFixed(0)}% confidence). Patching cache record.`,
              "complete",
            );
            await patchCachedAliExpressData({
              originalUrl: normalizedUrl,
              aliexpressUrl: match.aliexpressUrl,
              aliexpressData: match.aliexpressData,
            });
            waterfall.mark("persist", "AliExpress data patched into cache record.", "complete");
            // Catch & Commit — a confident live match backfilled onto a cached scan.
            maybeAutoCommitVerified({
              originalUrl: normalizedUrl,
              scanId: cached.id,
              aliexpressUrl: match.aliexpressUrl,
              aliexpressData: match.aliexpressData,
              matchConfidence: match.matchConfidence,
              matchQuality: match.matchQuality,
              imageSameFunction: match.imageMatchSameFunction,
              bestEffortOnly: match.bestEffortOnly,
              winnerProductId: match.searchMeta.winnerProductId,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Supplier search failed.";
            resolvedSupplierSkipReason = msg;
            emit({ type: "stage", stage: "supplier-search", status: "error", message: msg });
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
          scanId: cached.id,
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
          presenceTier: computePresenceTier(ai.prediction),
          ...(resolvedBrowseCandidates !== undefined
            ? { browseCandidates: resolvedBrowseCandidates }
            : {}),
          ...(resolvedBrowseQuery !== undefined ? { browseQuery: resolvedBrowseQuery } : {}),
          lastScrapedAt: cached.lastScrapedAt.toISOString(),
          storeProduct: {
            title: scrape.attributes.title,
            ...(scrape.attributes.translatedTitle
              ? { translatedTitle: scrape.attributes.translatedTitle }
              : {}),
            priceUsd: storePrice,
            imageUrl: scrape.attributes.mainImageUrl,
            storeName: scrape.storeName,
          },
          ...(opts.includeDebug
            ? { debug: buildDebugFromCache(normalizedUrl, scrape, ai, waterfall) }
            : {}),
        };

        // Learning loop — record outcome for the cron aggregator (fire-and-forget).
        recordMatchOutcome({
          scanId: cached.id,
          originalUrl: cached.originalUrl,
          category: ai.prediction?.productCategory ?? null,
          vertical: deriveOutcomeVertical(ai.prediction?.productCategory ?? null),
          scrapeProvider: scrape.provider ?? null,
          verdict: ai.prediction?.verdict ?? null,
          matchConfidence: resolvedMatchConfidence ?? null,
          matchQuality: resolvedMatchQuality ?? null,
          bestEffortOnly: false, // cache hits keep the original matchQuality
          winningKeywords: ai.prediction?.aliexpressKeywords ?? [],
          imageMatchScore: resolvedImageMatchScore ?? null,
          sameFunction: resolvedImageMatchSameFunction ?? null,
        });

        return { response: hitResponse, cacheHeader: "HIT" };
      }
    }
  }

  emit({ type: "stage", stage: "cache-lookup", status: "miss" });
  waterfall.mark("cache", "Cache MISS — starting live scrape", "complete");
  const pipelineSteps = ["Cache lookup", "Cache miss — starting scrape"];
  const serviceEvents: ServiceEvent[] = [];

  // ── 2. Scraper ───────────────────────────────────────────────────────────────
  emit({ type: "stage", stage: "scrape", status: "active", message: "Fetching product page…" });

  const scrapeRes = await scraperService({ url: normalizedUrl });
  serviceEvents.push(...scrapeRes.events);

  if (!scrapeRes.ok) {
    emit({ type: "stage", stage: "scrape", status: "error", message: scrapeRes.error.message });
    const err = new ScraperError(
      scrapeRes.error.code,
      scrapeRes.error.message,
      scrapeRes.error.recoverable ? 422 : 500,
    );
    (err as ScraperError & { partialDebug?: AnalyzeDebugInfo }).partialDebug = partialDebug;
    throw err;
  }

  const scrapeOut = scrapeRes.value;
  const storePriceUsd = scrapeOut.detectedStorePriceUsd;
  const storeName = scrapeOut.storeName;
  emit({
    type: "stage",
    stage: "scrape",
    status: "done",
    message: `${scrapeOut.provider}: ${(scrapeOut.markdown.length / 1000).toFixed(0)} KB`,
  });
  pipelineSteps.push(`Scraped via ${scrapeOut.provider}`);
  waterfall.mark(
    "scrape",
    `${scrapeOut.provider} returned content (${scrapeOut.markdown.length.toLocaleString()} chars). Title & price extracted.`,
  );

  const scrapeData: CachedScrapeData = {
    provider: scrapeOut.provider,
    attributes: scrapeOut.attributes,
    detectedStorePriceUsd: storePriceUsd,
    storeName,
    markdownLength: scrapeOut.markdown.length,
    markdownPreview: scrapeOut.markdown.slice(0, MARKDOWN_PREVIEW_CHARS),
  };

  if (opts.includeDebug) {
    partialDebug = {
      scrape: buildDebugScrape(normalizedUrl, scrapeData),
      ai: { provider: "pending", model: "pending", prediction: null, rawResponse: "", error: null },
      waterfall: waterfall.entries,
      pipeline: { cacheStatus: "MISS", steps: pipelineSteps },
    };
  }

  // ── 3. Product identifier ────────────────────────────────────────────────────
  const sourceType: ProductSourceType = detectProductSource(normalizedUrl);
  let identity: ProductIdentity | null = null;

  if (sourceType !== "supplier_marketplace") {
    emit({ type: "stage", stage: "identify", status: "active", message: "Vision AI: identifying product…" });

    const identifierRes = await identifierService({
      attributes: scrapeOut.attributes,
      markdown: scrapeOut.markdown,
    });
    serviceEvents.push(...identifierRes.events);

    if (identifierRes.ok) {
      identity = identifierRes.value.identity;
      if (identity) {
        emit({
          type: "stage",
          stage: "identify",
          status: "done",
          message: `"${identity.canonicalName}" (${Math.round(identity.confidence * 100)}% confidence)`,
        });
        waterfall.mark(
          "ai",
          `Identified: "${identity.canonicalName}" (${identity.source}, conf ${Math.round(identity.confidence * 100)}%)`,
        );
        pipelineSteps.push(`Identifier: ${identity.canonicalName}`);
      } else {
        emit({ type: "stage", stage: "identify", status: "skipped", message: "No identity resolved" });
      }
    } else {
      emit({ type: "stage", stage: "identify", status: "skipped", message: identifierRes.error.message });
      pipelineSteps.push(`Identifier unavailable: ${identifierRes.error.message}`);
    }
  } else {
    emit({ type: "stage", stage: "identify", status: "skipped", message: "Supplier marketplace URL" });
  }

  // ── 4. Dropship verdict ──────────────────────────────────────────────────────
  emit({ type: "stage", stage: "verdict", status: "active", message: "AI: checking for dropship markup…" });
  pipelineSteps.push("Running AI dropship verification");

  const verdictRes = await verdictService({
    url: normalizedUrl,
    attributes: scrapeOut.attributes,
    markdown: scrapeOut.markdown,
    html: scrapeOut.html,
    storePriceUsd,
    identity,
  });
  serviceEvents.push(...verdictRes.events);

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

  if (isSupplierListing) {
    emit({ type: "stage", stage: "verdict", status: "skipped", message: `${getSupplierMarketplaceLabel(normalizedUrl)} detected` });
    waterfall.mark("ai", `${getSupplierMarketplaceLabel(normalizedUrl)} detected — not a retail dropship target. Skipped AI markup analysis.`, "skipped");
  } else if (aiResult.prediction) {
    emit({
      type: "stage",
      stage: "verdict",
      status: "done",
      message: `${Math.round(aiResult.prediction.confidence * 100)}% confidence${aiResult.prediction.isLikelyDropship ? " · likely dropship" : " · not dropship"}`,
    });
    waterfall.mark("ai", `Gemini returned structured JSON. Confidence: ${Math.round(aiResult.prediction.confidence * 100)}%. Category: ${aiResult.prediction.productCategory}.`, "complete");
  } else {
    emit({ type: "stage", stage: "verdict", status: "error", message: aiResult.error ?? "AI verdict unavailable" });
    waterfall.mark("ai", `AI verification failed: ${aiResult.error ?? "unknown error"}`, "error");
  }

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
  // ── Stage 31: graceful AI degradation ─────────────────────────────────────
  // If we scraped successfully but the AI verdict failed (and this isn't a
  // supplier-marketplace URL where the skip is by design), return a partial
  // response. Skip supplier search (no keywords → empty result anyway) and
  // skip persist (don't poison the cache with an incomplete row).
  if (!isSupplierListing && aiResult.prediction === null && aiResult.error) {
    const partialResponse: AnalyzeResponse = {
      status: "partial",
      cache: "MISS",
      originalUrl: normalizedUrl,
      degradedReason: "ai_unavailable",
      degradedDetail: aiResult.error,
      sourceType,
      lastScrapedAt: new Date().toISOString(),
      scrapeProvider: scrapeOut.provider,
      storeProduct: {
        title: scrapeOut.attributes.title,
        ...(scrapeOut.attributes.translatedTitle
          ? { translatedTitle: scrapeOut.attributes.translatedTitle }
          : {}),
        priceUsd: storePriceUsd ?? null,
        imageUrl: scrapeOut.attributes.mainImageUrl,
        storeName,
      },
      aliexpressData: null,
      ...(opts.includeDebug
        ? {
            debug: {
              scrape: buildDebugScrape(normalizedUrl, scrapeData),
              serviceEvents,
              ai: {
                provider: aiResult.provider,
                model: aiResult.model,
                prediction: null,
                rawResponse: aiResult.rawResponse,
                error: aiResult.error,
              },
              waterfall: waterfall.entries,
              pipeline: { cacheStatus: "MISS", steps: pipelineSteps },
            },
          }
        : {}),
    };
    emit({ type: "stage", stage: "supplier-search", status: "skipped", message: "Skipped — AI verdict unavailable" });
    emit({ type: "stage", stage: "persist", status: "skipped", message: "Partial result — not cached" });

    // Learning loop — record partial outcome so the cron can learn which
    // domains/providers tend to produce AI failures.
    recordMatchOutcome({
      originalUrl: normalizedUrl,
      scrapeProvider: scrapeOut.provider ?? null,
      verdict: "ai_unavailable",
      bestEffortOnly: false,
    });

    return { response: partialResponse, cacheHeader: "MISS" };
  }

  let supplierStatus: "complete" | "skipped" = "skipped";
  let supplierSkipReason: string | undefined =
    "AliExpress Affiliate API keys are not configured in .env";
  let supplierMatchConfidence: number | undefined;
  let supplierMatchQuality: "high" | "medium" | "low" | "none" | undefined;
  let supplierMatchReasons: string[] | undefined;
  let supplierImageMatchScore: number | undefined;
  let supplierImageMatchSameFunction: boolean | undefined;
  let supplierImageMatchReasoning: string | undefined;
  let supplierBestEffortOnly: boolean | undefined;
  let supplierNetwork:
    | "aliexpress"
    | "ebay"
    | "amazon"
    | "temu_aggregator"
    | undefined;
  let supplierDebug: AnalyzeDebugInfo["supplier"] | undefined;
  let browseCandidates: AliExpressBrowseCandidate[] | undefined;
  let browseQuery: string | undefined;

  // ── 5a. Browse-mode branch ───────────────────────────────────────────────────
  // When the AI verdict is `collection_page` we skip the full supplier-match
  // pipeline (no identity, no image AI, no rerank) and instead run ONE keyword
  // search built from category + styleTokens + materialPriors. Lightweight by
  // design: typical ~1 API call, returns up to BROWSE_CANDIDATE_LIMIT.
  if (aiResult.prediction?.verdict === "collection_page") {
    pipelineSteps.push(
      `Browse mode — collection page detected (${aiResult.prediction.productCategory})`,
    );
    const browse = await runBrowseSearch(aiResult.prediction, emit, waterfall);
    browseCandidates = browse.candidates;
    browseQuery = browse.query || undefined;
    supplierStatus = "skipped";
    supplierSkipReason =
      browse.skipReason ?? `Browse mode — ${browse.candidates.length} candidates surfaced`;
    pipelineSteps.push(
      browse.skipReason
        ? `Browse search skipped: ${browse.skipReason}`
        : `Browse search: ${browse.candidates.length} candidates for "${browse.query}"`,
    );
  } else {
    // ── 5b. Standard supplier match ────────────────────────────────────────────
    emit({
      type: "stage",
      stage: "supplier-search",
      status: "active",
      message: identity ? `Searching: "${identity.canonicalName}"…` : "Searching AliExpress…",
    });
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
    // Escalation trigger: only a re-scan that follows an explicit "wrong"
    // verdict from the user widens the Tier-2 vision-preprocess gate. A
    // routine forceRefresh (generic Re-scan button) must NOT escalate — it
    // would spend the expensive preprocess on every curious re-click.
    escalate: opts.forceRefresh ? await wasMatchMarkedWrong(normalizedUrl) : false,
  });
  serviceEvents.push(...supplierRes.events);

  if (!supplierRes.ok) {
    emit({ type: "stage", stage: "supplier-search", status: "error", message: supplierRes.error.message });
    const err = new AliExpressSearchError(
      supplierRes.error.code,
      supplierRes.error.message,
      supplierRes.error.recoverable ? 422 : 500,
    );
    (err as AliExpressSearchError & { partialDebug?: AnalyzeDebugInfo }).partialDebug = partialDebug;
    throw err;
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
    supplierBestEffortOnly = match.bestEffortOnly;
    supplierNetwork = match.searchMeta.sourceNetwork ?? "aliexpress";

    const imgNote =
      typeof match.imageMatchScore === "number"
        ? ` · img-AI ${(match.imageMatchScore * 100).toFixed(0)}%${match.imageMatchSameFunction === false ? " (different function!)" : ""}`
        : "";
    emit({
      type: "stage",
      stage: "supplier-search",
      status: "done",
      message: `${match.searchMeta.candidateCount} candidates · ${(match.matchConfidence * 100).toFixed(0)}% confidence${imgNote}`,
    });
    waterfall.mark(
      "supplier",
      `Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates). Match ${(match.matchConfidence * 100).toFixed(0)}% (${match.matchQuality})${imgNote}. Affiliate ${match.searchMeta.affiliateLinkValidated ? "validated" : "fallback"}.`,
    );
    pipelineSteps.push(`Supplier match: ${match.searchMeta.winnerProductId} (${match.searchMeta.candidateCount} candidates)`);

    supplierDebug = {
      keywords: match.searchMeta.keywords,
      provider: match.searchMeta.provider,
      candidateCount: match.searchMeta.candidateCount,
      winnerProductId: match.searchMeta.winnerProductId,
      winnerTitle: match.aliexpressData.title,
      winnerPriceUsd: match.aliexpressData.priceUsd,
      affiliateProvider: match.searchMeta.affiliateProvider,
      affiliateLinkValidated: match.searchMeta.affiliateLinkValidated,
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
        ? { smartmatch: { arm: match.searchMeta.smartmatchArm, candidateCount: match.searchMeta.smartmatchCandidateCount } }
        : {}),
      ...(match.searchMeta.categoryVocabMiss
        ? { categoryVocabMiss: match.searchMeta.categoryVocabMiss }
        : {}),
      ...(match.searchMeta.shipToCountry || match.searchMeta.categoryVertical || match.searchMeta.negativeKeywordsFiltered !== undefined
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
      ...(match.searchMeta.ocrTraces?.length || match.searchMeta.materialTokens?.length || match.searchMeta.technicalSpecs?.length
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
    emit({ type: "stage", stage: "supplier-search", status: "skipped", message: supplierOut.reason });
    waterfall.mark("supplier", supplierOut.reason, "skipped");
    pipelineSteps.push(`No supplier match: ${supplierOut.reason}`);
  } else {
    supplierSkipReason = supplierOut.reason;
    if (isSupplierListing) aliexpressUrl = normalizedUrl;
    emit({ type: "stage", stage: "supplier-search", status: "skipped", message: supplierOut.reason });
    waterfall.mark("supplier", supplierOut.reason, "skipped");
    pipelineSteps.push(`Supplier search skipped — ${supplierOut.reason}`);
  }
  } // ── end 5b: standard supplier match ───────────────────────────────────────

  // ── 6. Persist ───────────────────────────────────────────────────────────────
  emit({ type: "stage", stage: "persist", status: "active" });

  const persisted = await persistScannedProduct({
    originalUrl: normalizedUrl,
    scrapeData,
    aiPrediction,
    aliexpressUrl,
    aliexpressData,
    events: serviceEvents,
  });

  emit({ type: "stage", stage: "persist", status: "done" });
  waterfall.mark("persist", "Scrape + AI prediction written to database.", "complete");
  pipelineSteps.push("Persisted scrape + AI to database");

  const storePrice =
    aiResult.prediction?.estimatedStorePriceUsd ?? storePriceUsd ?? 0;

  const successResponse: AnalyzeResponse = {
    status: "success",
    cache: "MISS",
    originalUrl: persisted.originalUrl,
    scanId: persisted.id,
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
    supplierBestEffortOnly,
    supplierNetwork,
    sourceType,
    dropshipPrediction: aiResult.prediction,
    presenceTier: computePresenceTier(aiResult.prediction),
    ...(browseCandidates !== undefined ? { browseCandidates } : {}),
    ...(browseQuery !== undefined ? { browseQuery } : {}),
    lastScrapedAt: persisted.lastScrapedAt.toISOString(),
    scrapeProvider: scrapeOut.provider,
    storeProduct: {
      title: scrapeOut.attributes.title,
      ...(scrapeOut.attributes.translatedTitle
        ? { translatedTitle: scrapeOut.attributes.translatedTitle }
        : {}),
      priceUsd: storePrice,
      imageUrl: scrapeOut.attributes.mainImageUrl,
      storeName,
    },
    ...(opts.includeDebug
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

  // Learning loop — record outcome for the cron aggregator (fire-and-forget).
  recordMatchOutcome({
    scanId: persisted.id,
    originalUrl: normalizedUrl,
    category: aiResult.prediction?.productCategory ?? null,
    vertical: deriveOutcomeVertical(aiResult.prediction?.productCategory ?? null),
    scrapeProvider: scrapeOut.provider ?? null,
    verdict: aiResult.prediction?.verdict ?? null,
    matchConfidence: supplierMatchConfidence ?? null,
    matchQuality: supplierMatchQuality ?? null,
    bestEffortOnly: supplierBestEffortOnly ?? false,
    winningKeywords:
      supplierDebug?.keywords?.split(" / ").filter((s) => s.trim().length > 0) ?? [],
    imageMatchScore: supplierImageMatchScore ?? null,
    sameFunction: supplierImageMatchSameFunction ?? null,
  });

  // Catch & Commit — if this (possibly escalated) match cleared the safety bar,
  // pin it to the verified map so the next scan of this URL hits the Gold Path.
  maybeAutoCommitVerified({
    originalUrl: normalizedUrl,
    scanId: persisted.id,
    aliexpressUrl,
    aliexpressData,
    matchConfidence: supplierMatchConfidence,
    matchQuality: supplierMatchQuality,
    imageSameFunction: supplierImageMatchSameFunction,
    bestEffortOnly: supplierBestEffortOnly,
    winnerProductId: supplierDebug?.winnerProductId,
    supplierNetwork,
  });

  return { response: successResponse, cacheHeader: "MISS" };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    route: "/api/analyze",
    methods: ["GET", "POST"],
    message: "POST a JSON body with { url: string } to analyze a product.",
  });
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
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

    const opts = { includeDebug, forceRefresh: body.forceRefresh ?? false };
    const isSSE = request.headers.get("Accept")?.includes("text/event-stream") ?? false;

    // ── SSE streaming path ─────────────────────────────────────────────────────
    if (isSSE) {
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      const emit: PipelineEmitFn = (event) => {
        void writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      void (async () => {
        try {
          const { response } = await runAnalysisPipeline(normalizedUrl, opts, emit);
          emit({ type: "final", payload: response });
        } catch (err) {
          logPipelineError("SSE pipeline failure", err);
          emit({
            type: "error",
            code: resolveErrorCode(err),
            message: getSafeErrorMessage(err, "Analysis failed. Please try again."),
          });
        } finally {
          void writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // disable nginx buffering on Vercel
        },
      });
    }

    // ── JSON path (unchanged behaviour) ───────────────────────────────────────
    const { response, cacheHeader } = await runAnalysisPipeline(normalizedUrl, opts, NOOP_EMIT);
    return NextResponse.json(response, {
      status: 200,
      headers: { "X-Cache": cacheHeader },
    });

  } catch (error) {
    logPipelineError("pipeline failure", error);
    const debug = (error as { partialDebug?: AnalyzeDebugInfo }).partialDebug;

    if (error instanceof ScraperError) {
      return errorResponse(normalizedUrl, error.message, error.code, error.statusCode, debug);
    }
    if (error instanceof AliExpressSearchError) {
      return errorResponse(normalizedUrl, error.message, error.code, error.statusCode, debug);
    }
    return errorResponse(
      normalizedUrl,
      getSafeErrorMessage(error, "Unable to process analyze request."),
      resolveErrorCode(error),
      resolveHttpStatus(error),
      debug,
    );
  }
}
