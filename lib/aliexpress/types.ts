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
    /**
     * Which smartmatch dispatch arm produced candidates:
     *   "base64"  — Gemini-cleaned bytes arm succeeded
     *   "url"     — raw image-URL arm succeeded
     *   "skipped" — smartmatch was not attempted (no API, no image, or pool already large)
     */
    smartmatchArm?: "base64" | "url" | "skipped";
    /** Number of candidates returned by the smartmatch arm (0 when skipped or no results). */
    smartmatchCandidateCount?: number;
  };
}
