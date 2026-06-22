import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ProductComparisonResult, StoreProduct } from "@/lib/mock-data";
import type { ProductSourceType, AnalyzeResponse } from "@/lib/types/analyze";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

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
}

export interface PartialResult {
  /** Sprint 12 Stage 31 — scrape worked, AI didn't. */
  storeProduct: StoreProduct;
  degradedReason: "ai_unavailable" | "supplier_search_failed";
  degradedDetail: string;
  originalUrl: string;
}

export interface AnalyzeClientResult {
  mode: "full" | "dropship_only" | "partial";
  comparison: ProductComparisonResult | null;
  dropshipAnalysis: DropshipAnalysisResult | null;
  partial: PartialResult | null;
  debug: AnalyzeDebugInfo | null;
}

function buildStoreProduct(response: AnalyzeResponse & { status: "success" }): StoreProduct {
  const store = response.storeProduct;
  return {
    title: store.title,
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

  if (response.aliexpressData && response.supplierStatus === "complete") {
    const supplier = response.aliexpressData;
    const storePriceUsd =
      storeProduct.priceUsd ?? supplier.originalPriceUsd ?? supplier.priceUsd * 4;
    const supplierPriceUsd = supplier.priceUsd;
    const savingsUsd = Math.max(0, storePriceUsd - supplierPriceUsd);
    const savingsPercent =
      storePriceUsd > 0 ? Math.round((savingsUsd / storePriceUsd) * 100) : 0;

    return {
      mode: "full",
      comparison: {
        originalUrl: response.originalUrl,
        scanId: response.scanId,
        cache: response.cache,
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
          orderCount: supplier.orderCount ?? 1000,
          sellerRating: supplier.sellerRating ?? 4.8,
          shippingDays: supplier.shippingDays ?? 14,
          affiliateUrl: supplier.affiliateUrl ?? response.aliexpressUrl ?? "#",
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
      },
      dropshipAnalysis: null,
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
    },
    partial: null,
    debug,
  };
}
