import { Prisma } from "@prisma/client";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { PresenceTier } from "@/lib/analyze/presence-tier";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

/**
 * Browse-mode candidate — a lightweight AliExpress product entry rendered
 * in the collection-page grid. Carries the minimum fields needed for the
 * card UI; no image-AI or variant matching is run for these.
 */
export interface AliExpressBrowseCandidate {
  productId: string;
  title: string;
  priceUsd: number;
  imageUrl: string | null;
  affiliateUrl: string;
  orderCount: number;
  sellerRating: number;
}

/** Shape of AliExpress product data stored in ScannedProduct.aliexpressData */
export interface AliExpressProductData {
  title: string;
  priceUsd: number;
  originalPriceUsd?: number;
  imageUrl?: string;
  orderCount?: number;
  sellerRating?: number;
  shippingDays?: number;
  affiliateUrl?: string;
  /** Variant info when a SKU match was found on the AliExpress listing. */
  matchedVariant?: {
    skuId: string;
    label: string; // e.g. "Black · 256 GB"
    priceUsd: number;
    warehouseCountry: string | null;
    shippingCostUsd: number | null;
    totalCostUsd: number;
  };
  /** True when the AliExpress listing has variants but none matched the source. */
  variantWarning?: boolean;
}

export type AnalyzeCacheStatus = "HIT" | "MISS";
export type SupplierStatus = "complete" | "skipped" | "pending";
export type ProductSourceType = "retail_store" | "supplier_marketplace";

export interface AnalyzeRequestBody {
  url: string;
  debug?: boolean;
  forceRefresh?: boolean;
}

export type SupplierMatchQuality = "high" | "medium" | "low" | "none";

interface AnalyzeSuccessBase {
  status: "success";
  originalUrl: string;
  /** Persisted ScannedProduct.id — present once the persist stage has run.
   *  Drives /scan/[id] permalinks, share targets, and click tracking. */
  scanId?: string;
  aliexpressUrl: string | null;
  aliexpressData: AliExpressProductData | null;
  supplierStatus: SupplierStatus;
  supplierSkipReason?: string;
  supplierMatchConfidence?: number;
  supplierMatchQuality?: SupplierMatchQuality;
  supplierMatchReasons?: string[];
  supplierImageMatchScore?: number;
  supplierImageMatchSameFunction?: boolean;
  supplierImageMatchReasoning?: string;
  /** True when the link is the closest candidate found, not a confident exact match. */
  supplierBestEffortOnly?: boolean;
  /**
   * True when this result was served from the permanent VerifiedProductMap
   * (the "Gold Path") — the scrape + AI + supplier-search pipeline was
   * bypassed entirely. See lib/cache/verified-map.ts.
   */
  verified?: boolean;
  /** How the verified mapping was established. Present only when `verified`. */
  verifiedSource?: "user_feedback" | "auto_high_confidence";
  /** ISO timestamp the mapping was last confirmed. Present only when `verified`. */
  verifiedAt?: string;
  /** Which supplier network produced the match. Absent = aliexpress. */
  supplierNetwork?: "aliexpress" | "ebay" | "amazon" | "temu_aggregator";
  sourceType: ProductSourceType;
  dropshipPrediction: DropshipPrediction | null;
  /**
   * Extension badge contract — server-computed from the verdict so the UI
   * can never be more confident than the engine. Absent on partial/error
   * responses, which clients must treat as "silent".
   */
  presenceTier?: PresenceTier;
  /**
   * Browse-mode candidates — present only when the AI verdict is
   * `collection_page`. Populated by a single keyword search against the
   * AliExpress Affiliate API; no per-candidate image AI is run.
   */
  browseCandidates?: AliExpressBrowseCandidate[];
  /** Enriched query that was sent to AliExpress (debug + UI banner copy). */
  browseQuery?: string;
  lastScrapedAt: string;
  storeProduct: {
    title: string;
    /** English translation when the original title was non-Latin. */
    translatedTitle?: string;
    priceUsd: number;
    imageUrl: string | null;
    storeName: string;
  };
  debug?: AnalyzeDebugInfo;
}

export interface AnalyzeCacheHitResponse extends AnalyzeSuccessBase {
  cache: "HIT";
}

export interface AnalyzeScrapeSuccessResponse extends AnalyzeSuccessBase {
  cache: "MISS";
  scrapeProvider: string;
}

export interface AnalyzeErrorResponse {
  status: "error";
  cache: "MISS";
  originalUrl: string;
  message: string;
  code: string;
  aliexpressData: null;
  debug?: AnalyzeDebugInfo;
}

/**
 * Sprint 12 Stage 31 — Partial result.
 *
 * Returned when the scrape stage succeeded but a downstream non-essential
 * stage (currently: AI verdict) failed. The user still sees the scraped
 * product card, the result is NOT persisted to cache (so a retry can try
 * again), and the client renders a "verdict unavailable, retry?" banner.
 */
export type DegradedReason = "ai_unavailable" | "supplier_search_failed";

export interface AnalyzePartialResponse {
  status: "partial";
  cache: "MISS";
  originalUrl: string;
  /** What stage failed, in plain language. */
  degradedReason: DegradedReason;
  /** Human-readable detail surfaced under the banner. */
  degradedDetail: string;
  /** Scraped store product is always present. */
  storeProduct: {
    title: string;
    priceUsd: number | null;
    imageUrl: string | null;
    storeName: string;
  };
  sourceType: ProductSourceType;
  lastScrapedAt: string;
  scrapeProvider: string;
  aliexpressData: null;
  debug?: AnalyzeDebugInfo;
}

export type AnalyzeResponse =
  | AnalyzeCacheHitResponse
  | AnalyzeScrapeSuccessResponse
  | AnalyzePartialResponse
  | AnalyzeErrorResponse;

export function parseAliExpressData(
  value: Prisma.JsonValue | null,
): AliExpressProductData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.title !== "string" || typeof record.priceUsd !== "number") {
    return null;
  }

  const matchedVariantRaw = record.matchedVariant;
  let matchedVariant: AliExpressProductData["matchedVariant"];
  if (
    matchedVariantRaw &&
    typeof matchedVariantRaw === "object" &&
    !Array.isArray(matchedVariantRaw)
  ) {
    const mv = matchedVariantRaw as Record<string, unknown>;
    if (
      typeof mv.skuId === "string" &&
      typeof mv.label === "string" &&
      typeof mv.priceUsd === "number" &&
      typeof mv.totalCostUsd === "number"
    ) {
      matchedVariant = {
        skuId: mv.skuId,
        label: mv.label,
        priceUsd: mv.priceUsd,
        warehouseCountry:
          typeof mv.warehouseCountry === "string" ? mv.warehouseCountry : null,
        shippingCostUsd:
          typeof mv.shippingCostUsd === "number" ? mv.shippingCostUsd : null,
        totalCostUsd: mv.totalCostUsd,
      };
    }
  }

  return {
    title: record.title,
    priceUsd: record.priceUsd,
    originalPriceUsd:
      typeof record.originalPriceUsd === "number"
        ? record.originalPriceUsd
        : undefined,
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : undefined,
    orderCount:
      typeof record.orderCount === "number" ? record.orderCount : undefined,
    sellerRating:
      typeof record.sellerRating === "number" ? record.sellerRating : undefined,
    shippingDays:
      typeof record.shippingDays === "number" ? record.shippingDays : undefined,
    affiliateUrl:
      typeof record.affiliateUrl === "string" ? record.affiliateUrl : undefined,
    ...(matchedVariant ? { matchedVariant } : {}),
    ...(record.variantWarning === true ? { variantWarning: true } : {}),
  };
}
