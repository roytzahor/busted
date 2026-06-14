import { Prisma } from "@prisma/client";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

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
}

export type AnalyzeCacheStatus = "HIT" | "MISS";
export type SupplierStatus = "complete" | "skipped" | "pending";
export type ProductSourceType = "retail_store" | "supplier_marketplace";

export interface AnalyzeRequestBody {
  url: string;
  debug?: boolean;
  forceRefresh?: boolean;
}

interface AnalyzeSuccessBase {
  status: "success";
  originalUrl: string;
  aliexpressUrl: string | null;
  aliexpressData: AliExpressProductData | null;
  supplierStatus: SupplierStatus;
  supplierSkipReason?: string;
  sourceType: ProductSourceType;
  dropshipPrediction: DropshipPrediction | null;
  lastScrapedAt: string;
  storeProduct: {
    title: string;
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

export type AnalyzeResponse =
  | AnalyzeCacheHitResponse
  | AnalyzeScrapeSuccessResponse
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
  };
}
