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
