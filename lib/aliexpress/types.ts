export interface AliExpressProductCandidate {
  productId: string;
  title: string;
  priceUsd: number;
  productUrl: string;
  imageUrl: string | null;
  orderCount: number;
  sellerRating: number;
  shippingDays: number | null;
  promotionLink: string | null;
}

export class AliExpressSearchError extends Error {
  readonly code: string;
  readonly statusCode: 422 | 500;

  constructor(code: string, message: string, statusCode: 422 | 500 = 422) {
    super(message);
    this.name = "AliExpressSearchError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type SupplierMatchQuality = "high" | "medium" | "low" | "none";

export interface SupplierMatchResult {
  aliexpressUrl: string;
  aliexpressData: import("@/lib/types/analyze").AliExpressProductData;
  matchConfidence: number;
  matchQuality: SupplierMatchQuality;
  matchReasons: string[];
  imageMatchScore?: number;
  imageMatchSameFunction?: boolean;
  imageMatchReasoning?: string;
  variantMatchScore?: number;
  variantHardMismatch?: boolean;
  variantMatchReasons?: string[];
  searchMeta: {
    keywords: string;
    provider: "aliexpress_api" | "firecrawl_scrape";
    candidateCount: number;
    winnerProductId: string;
    affiliateLinkValidated: boolean;
    affiliateProvider: "aliexpress_api" | "admitad" | "direct";
    variantMatched?: boolean;
    variantSkuId?: string;
    /** Set when no category vocab entry matched — value is the unresolved category string. */
    categoryVocabMiss?: string;
    // Stage 7 — SmartMatch + preprocess outcome tracking.
    /** True when Gemini Vision preprocessing was attempted for the product image. */
    preprocessAttempted?: boolean;
    /** True when the preprocessed image was served from the DB cache (no Gemini call). */
    preprocessCacheHit?: boolean;
    /** Wall-clock ms spent in the preprocess call (0 when not attempted or cache hit). */
    preprocessDurationMs?: number;
    /** 0–10 quality score from the cleanup scorer. Absent on cache hits. */
    preprocessQualityScore?: number;
    /** True when the full preprocess scored poorly and the lighter retry prompt was used. */
    preprocessLightPromptUsed?: boolean;
    /**
     * Which smartmatch dispatch arm produced candidates:
     *   "base64"  — Gemini-cleaned bytes arm succeeded
     *   "url"     — raw image-URL arm succeeded
     *   "skipped" — smartmatch was not attempted (no API, no image, or pool already large)
     */
    smartmatchArm?: "base64" | "url" | "skipped";
    /** Number of candidates returned by the smartmatch arm (0 when skipped or no results). */
    smartmatchCandidateCount?: number;
    // Sprint 9 Stage 14 — locale + category + vision context surfaced for /monitoring.
    /** Resolved buyer locale ship-to country (e.g. "IL", "US"). */
    shipToCountry?: string;
    /** Resolved buyer locale target currency (e.g. "ILS", "USD"). */
    targetCurrency?: string;
    /** Category vocab vertical name when a match was found (e.g. "shower steamer"). */
    categoryVertical?: string;
    /** AE first-level category IDs filtered against (comma-joined). */
    categoryIds?: string;
    /** Number of candidates removed by negative-keyword filter (0 when no negatives applied). */
    negativeKeywordsFiltered?: number;
    /** OCR traces extracted from the source product image (model numbers, serials, brand text). */
    ocrTraces?: string[];
    /** Material tokens extracted from the source image (e.g. "TPU", "ABS", "S925"). */
    materialTokens?: string[];
    /** Technical-spec phrases extracted from the source image (e.g. "12000mAh", "USB-C"). */
    technicalSpecs?: string[];
  };
}
