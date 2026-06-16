import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ProductComparisonResult, StoreProduct } from "@/lib/mock-data";
import type { ProductSourceType, AnalyzeResponse } from "@/lib/types/analyze";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

export interface DropshipAnalysisResult {
  originalUrl: string;
  cache: "HIT" | "MISS";
  storeProduct: StoreProduct;
  dropshipPrediction: DropshipPrediction;
  sourceType: ProductSourceType;
  supplierStatus: "skipped" | "pending" | "complete";
  supplierSkipReason?: string;
}

export interface AnalyzeClientResult {
  mode: "full" | "dropship_only";
  comparison: ProductComparisonResult | null;
  dropshipAnalysis: DropshipAnalysisResult | null;
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
        },
        savingsUsd,
        savingsPercent,
        matchConfidence: response.supplierMatchConfidence,
        matchQuality: response.supplierMatchQuality,
        matchReasons: response.supplierMatchReasons,
        imageMatchScore: response.supplierImageMatchScore,
        imageMatchSameFunction: response.supplierImageMatchSameFunction,
        imageMatchReasoning: response.supplierImageMatchReasoning,
      },
      dropshipAnalysis: null,
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
      cache: response.cache,
      storeProduct,
      dropshipPrediction: response.dropshipPrediction,
      sourceType: response.sourceType,
      supplierStatus: response.supplierStatus === "complete" ? "complete" : "skipped",
      supplierSkipReason: response.supplierSkipReason,
    },
    debug,
  };
}
