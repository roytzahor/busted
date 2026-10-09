import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ProductComparisonResult, StoreProduct } from "@/lib/mock-data";
import type {
  AliExpressBrowseCandidate,
  ProductSourceType,
  AnalyzeResponse,
} from "@/lib/types/analyze";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import type { PresenceTier } from "@/lib/analyze/presence-tier";
import { computeSavings } from "@/lib/analyze/offer-view";

export interface DropshipAnalysisResult {
  originalUrl: string;
  /** Persisted ScannedProduct.id — drives /scan/[id] permalink. */
  scanId?: string;
  cache: "HIT" | "MISS";
  storeProduct: StoreProduct;
  dropshipPrediction: DropshipPrediction;
  sourceType: ProductSourceType;
  supplierStatus: "skipped" | "pending" | "complete";
  supplierSkipReason?: string;
  /**
   * Server-computed presence tier, passed through untouched. The UI must
   * never derive this from `dropshipPrediction.confidence` itself — that is
   * the one rule that keeps the web page and the extension badge from
   * disagreeing about how confident we are. Absent means silent.
   */
  presenceTier: PresenceTier;
}

export interface BrowseAnalysisResult {
  originalUrl: string;
  scanId?: string;
  cache: "HIT" | "MISS";
  storeProduct: StoreProduct;
  /** Always === "collection_page" by construction. */
  dropshipPrediction: DropshipPrediction;
  productCategory: string;
  styleTokens: string[];
  materialPriors: string[];
  /** The actual keyword string sent to AliExpress (for transparency). */
  query: string;
  candidates: AliExpressBrowseCandidate[];
  /** Set when the browse fetch returned zero candidates (e.g. API keys missing). */
  skipReason?: string;
}

export interface PartialResult {
  /** Sprint 12 Stage 31 — scrape worked, AI didn't. */
  storeProduct: StoreProduct;
  degradedReason: "ai_unavailable" | "supplier_search_failed";
  degradedDetail: string;
  originalUrl: string;
}

export interface AnalyzeClientResult {
  mode: "full" | "dropship_only" | "browse" | "partial";
  comparison: ProductComparisonResult | null;
  dropshipAnalysis: DropshipAnalysisResult | null;
  browse: BrowseAnalysisResult | null;
  partial: PartialResult | null;
  debug: AnalyzeDebugInfo | null;
}

function buildStoreProduct(response: AnalyzeResponse & { status: "success" }): StoreProduct {
  const store = response.storeProduct;
  return {
    title: store.title,
    ...(store.translatedTitle ? { translatedTitle: store.translatedTitle } : {}),
    priceUsd: store.priceUsd,
    imageUrl:
      store.imageUrl ??
      "https://placehold.co/480x480/dc2626/ffffff/png?text=Store",
    storeName: store.storeName,
  };
}

export function mapAnalyzeResponseToComparison(
  response: AnalyzeResponse,
): AnalyzeClientResult | null {
  // Sprint 12 Stage 31 — partial result (scrape OK, AI failed).
  if (response.status === "partial") {
    return {
      mode: "partial",
      comparison: null,
      dropshipAnalysis: null,
      browse: null,
      partial: {
        originalUrl: response.originalUrl,
        degradedReason: response.degradedReason,
        degradedDetail: response.degradedDetail,
        storeProduct: {
          title: response.storeProduct.title,
          priceUsd: response.storeProduct.priceUsd ?? 0,
          imageUrl:
            response.storeProduct.imageUrl ??
            "https://placehold.co/480x480/dc2626/ffffff/png?text=Store",
          storeName: response.storeProduct.storeName,
        },
      },
      debug: response.debug ?? null,
    };
  }

  if (response.status !== "success") {
    return null;
  }

  const debug = response.debug ?? null;
  const storeProduct = buildStoreProduct(response);

  // Browse mode — surfaced when AI verdict is `collection_page`. The
  // candidates array may be empty (browse search skipped on permalink
  // re-renders since we don't persist candidates; the empty state in the
  // UI nudges the user to re-scan for a fresh fetch).
  if (response.dropshipPrediction?.verdict === "collection_page") {
    const candidates = response.browseCandidates ?? [];
    return {
      mode: "browse",
      comparison: null,
      dropshipAnalysis: null,
      browse: {
        originalUrl: response.originalUrl,
        scanId: response.scanId,
        cache: response.cache,
        storeProduct,
        dropshipPrediction: response.dropshipPrediction,
        productCategory: response.dropshipPrediction.productCategory,
        styleTokens: response.dropshipPrediction.styleTokens,
        materialPriors: response.dropshipPrediction.materialPriors,
        query: response.browseQuery ?? "",
        candidates,
        ...(candidates.length === 0
          ? {
              skipReason:
                response.supplierSkipReason ??
                "Re-scan this page to fetch fresh browse candidates.",
            }
          : {}),
      },
      partial: null,
      debug,
    };
  }

  // Pass-through, never recomputed; absent reads as silent (see below).
  const presenceTier: PresenceTier = response.presenceTier ?? "silent";

  // A silent scan never becomes an offer (spec 0002, REQ-1/REQ-10). On a
  // `legit` store an AliExpress "match" is most likely a knockoff; on a
  // low-confidence one we have not earned the claim. The verdict-only view
  // already has the silent presentation, and with no comparison object the
  // share card, bulk paste and permalink OG have no savings to repeat.
  if (
    response.aliexpressData &&
    response.supplierStatus === "complete" &&
    presenceTier !== "silent"
  ) {
    const supplier = response.aliexpressData;
    // Unknown stays unknown: no AliExpress crossed-out price, no multiple of
    // the supplier price. StoreProduct's convention is 0 = unknown.
    const storePriceUsd = storeProduct.priceUsd > 0 ? storeProduct.priceUsd : 0;
    const supplierPriceUsd = supplier.priceUsd;
    const { savingsUsd, savingsPercent } = computeSavings(
      storePriceUsd,
      supplierPriceUsd,
      response.supplierBestEffortOnly,
    );
    const destination = supplier.affiliateUrl ?? response.aliexpressUrl ?? undefined;

    return {
      mode: "full",
      comparison: {
        originalUrl: response.originalUrl,
        scanId: response.scanId,
        cache: response.cache,
        presenceTier,
        storeProduct: {
          ...storeProduct,
          priceUsd: storePriceUsd,
        },
        supplierProduct: {
          title: supplier.title,
          priceUsd: supplierPriceUsd,
          imageUrl:
            supplier.imageUrl ??
            "https://placehold.co/480x480/059669/ffffff/png?text=AliExpress",
          // Reported or absent — never defaulted (spec 0002, REQ-2).
          ...(supplier.orderCount !== undefined ? { orderCount: supplier.orderCount } : {}),
          ...(supplier.sellerRating !== undefined ? { sellerRating: supplier.sellerRating } : {}),
          ...(supplier.shippingDays !== undefined ? { shippingDays: supplier.shippingDays } : {}),
          ...(destination ? { affiliateUrl: destination } : {}),
          ...(supplier.matchedVariant
            ? {
                variantLabel: supplier.matchedVariant.label,
                totalCostUsd: supplier.matchedVariant.totalCostUsd,
                shippingCostUsd: supplier.matchedVariant.shippingCostUsd ?? undefined,
                warehouseCountry: supplier.matchedVariant.warehouseCountry,
              }
            : {}),
          ...(supplier.variantWarning ? { variantWarning: true } : {}),
        },
        savingsUsd,
        savingsPercent,
        matchConfidence: response.supplierMatchConfidence,
        matchQuality: response.supplierMatchQuality,
        matchReasons: response.supplierMatchReasons,
        imageMatchScore: response.supplierImageMatchScore,
        imageMatchSameFunction: response.supplierImageMatchSameFunction,
        imageMatchReasoning: response.supplierImageMatchReasoning,
        bestEffortOnly: response.supplierBestEffortOnly,
        supplierNetwork: response.supplierNetwork ?? "aliexpress",
        ...(response.verified ? { verified: true } : {}),
        ...(response.verifiedSource ? { verifiedSource: response.verifiedSource } : {}),
      },
      dropshipAnalysis: null,
      browse: null,
      partial: null,
      debug,
    };
  }

  if (!response.dropshipPrediction) {
    return null;
  }

  return {
    mode: "dropship_only",
    comparison: null,
    dropshipAnalysis: {
      originalUrl: response.originalUrl,
      scanId: response.scanId,
      cache: response.cache,
      storeProduct,
      dropshipPrediction: response.dropshipPrediction,
      sourceType: response.sourceType,
      supplierStatus: response.supplierStatus === "complete" ? "complete" : "skipped",
      supplierSkipReason: response.supplierSkipReason,
      // Pass-through, never recomputed. An older response without the field
      // falls back to silent — the safe direction: we under-claim rather than
      // alarm on a scan whose tier we don't actually know.
      presenceTier,
    },
    browse: null,
    partial: null,
    debug,
  };
}
