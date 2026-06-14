import { Prisma } from "@prisma/client";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export interface CachedScrapeData {
  provider: string;
  attributes: ScrapedProductAttributes;
  detectedStorePriceUsd: number | null;
  storeName: string;
  markdownLength: number;
  markdownPreview: string;
}

export interface CachedAiPrediction {
  provider: string;
  model: string;
  prediction: DropshipPrediction | null;
  rawResponse: string;
  error: string | null;
  analyzedAt: string;
}

export function parseCachedScrapeData(
  value: Prisma.JsonValue | null,
): CachedScrapeData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attributes = record.attributes;

  if (
    typeof record.provider !== "string" ||
    typeof attributes !== "object" ||
    attributes === null ||
    Array.isArray(attributes)
  ) {
    return null;
  }

  const attrs = attributes as Record<string, unknown>;
  if (typeof attrs.title !== "string" || typeof attrs.description !== "string") {
    return null;
  }

  return {
    provider: record.provider,
    attributes: {
      title: attrs.title,
      description: attrs.description,
      mainImageUrl:
        typeof attrs.mainImageUrl === "string" ? attrs.mainImageUrl : null,
      sourceUrl: typeof attrs.sourceUrl === "string" ? attrs.sourceUrl : "",
      provider:
        attrs.provider === "firecrawl" || attrs.provider === "playwright"
          ? attrs.provider
          : "firecrawl",
    },
    detectedStorePriceUsd:
      typeof record.detectedStorePriceUsd === "number"
        ? record.detectedStorePriceUsd
        : null,
    storeName: typeof record.storeName === "string" ? record.storeName : "Store",
    markdownLength:
      typeof record.markdownLength === "number" ? record.markdownLength : 0,
    markdownPreview:
      typeof record.markdownPreview === "string" ? record.markdownPreview : "",
  };
}

export function parseCachedAiPrediction(
  value: Prisma.JsonValue | null,
): CachedAiPrediction | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.provider !== "string" || typeof record.model !== "string") {
    return null;
  }

  const predictionRaw = record.prediction;
  let prediction: DropshipPrediction | null = null;

  if (predictionRaw && typeof predictionRaw === "object" && !Array.isArray(predictionRaw)) {
    const p = predictionRaw as Record<string, unknown>;
    if (typeof p.isLikelyDropship === "boolean" && typeof p.confidence === "number") {
      prediction = {
        isLikelyDropship: p.isLikelyDropship,
        confidence: p.confidence,
        productCategory:
          typeof p.productCategory === "string" ? p.productCategory : "Unknown",
        reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
        redFlags: Array.isArray(p.redFlags)
          ? p.redFlags.filter((flag): flag is string => typeof flag === "string")
          : [],
        estimatedStorePriceUsd:
          typeof p.estimatedStorePriceUsd === "number"
            ? p.estimatedStorePriceUsd
            : null,
        estimatedSupplierPriceUsd:
          typeof p.estimatedSupplierPriceUsd === "number"
            ? p.estimatedSupplierPriceUsd
            : null,
        estimatedMarkupPercent:
          typeof p.estimatedMarkupPercent === "number"
            ? p.estimatedMarkupPercent
            : null,
      };
    }
  }

  return {
    provider: record.provider,
    model: record.model,
    prediction,
    rawResponse: typeof record.rawResponse === "string" ? record.rawResponse : "",
    error: typeof record.error === "string" ? record.error : null,
    analyzedAt:
      typeof record.analyzedAt === "string"
        ? record.analyzedAt
        : new Date().toISOString(),
  };
}
