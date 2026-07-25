import { Prisma } from "@prisma/client";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currency";
import type {
  DropshipPrediction,
  DropshipVerdict,
} from "@/lib/ai/dropship-verifier";
import type {
  ScrapedProductAttributes,
  ScrapedProductVariant,
} from "@/lib/scraping/types";

function parseCachedVariant(value: unknown): ScrapedProductVariant | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const out: ScrapedProductVariant = {
    ...(typeof v.color === "string" ? { color: v.color } : {}),
    ...(typeof v.size === "string" ? { size: v.size } : {}),
    ...(typeof v.capacity === "string" ? { capacity: v.capacity } : {}),
    ...(typeof v.material === "string" ? { material: v.material } : {}),
    ...(typeof v.selectedSku === "string" ? { selectedSku: v.selectedSku } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseVerdict(value: unknown, isLikelyDropship: boolean): DropshipVerdict {
  if (
    value === "dropship" ||
    value === "legit" ||
    value === "insufficient_evidence" ||
    value === "not_a_product" ||
    value === "collection_page"
  ) {
    return value;
  }
  // Legacy cached predictions: derive from boolean
  return isLikelyDropship ? "dropship" : "legit";
}

export interface CachedScrapeData {
  provider: string;
  attributes: ScrapedProductAttributes;
  detectedStorePriceUsd: number | null;
  /** Native price + currency as printed on the page. Optional: rows cached
   *  before currency-aware extraction have only the USD value. */
  detectedStorePriceNative?: number | null;
  detectedStorePriceCurrency?: CurrencyCode | null;
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

  const cachedVariant = parseCachedVariant(attrs.variant);

  return {
    provider: record.provider,
    attributes: {
      title: attrs.title,
      description: attrs.description,
      mainImageUrl:
        typeof attrs.mainImageUrl === "string" ? attrs.mainImageUrl : null,
      sourceUrl: typeof attrs.sourceUrl === "string" ? attrs.sourceUrl : "",
      provider:
        attrs.provider === "crawlbase" || attrs.provider === "firecrawl" || attrs.provider === "playwright"
          ? attrs.provider
          : "firecrawl",
      ...(cachedVariant ? { variant: cachedVariant } : {}),
      ...(typeof attrs.translatedTitle === "string"
        ? { translatedTitle: attrs.translatedTitle }
        : {}),
    },
    detectedStorePriceUsd:
      typeof record.detectedStorePriceUsd === "number"
        ? record.detectedStorePriceUsd
        : null,
    ...(typeof record.detectedStorePriceNative === "number"
      ? { detectedStorePriceNative: record.detectedStorePriceNative }
      : {}),
    ...(isCurrencyCode(record.detectedStorePriceCurrency)
      ? { detectedStorePriceCurrency: record.detectedStorePriceCurrency }
      : {}),
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
      const verdict = parseVerdict(p.verdict, p.isLikelyDropship);
      prediction = {
        verdict,
        isLikelyDropship: verdict === "dropship",
        confidence: p.confidence,
        productCategory:
          typeof p.productCategory === "string" ? p.productCategory : "Unknown",
        reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
        reasoningSignals: Array.isArray(p.reasoningSignals)
          ? p.reasoningSignals.filter((s): s is string => typeof s === "string")
          : [],
        missingSignals: Array.isArray(p.missingSignals)
          ? p.missingSignals.filter((s): s is string => typeof s === "string")
          : [],
        aliexpressKeywords: Array.isArray(p.aliexpressKeywords)
          ? p.aliexpressKeywords.filter((s): s is string => typeof s === "string")
          : [],
        styleTokens: Array.isArray(p.styleTokens)
          ? p.styleTokens.filter((s): s is string => typeof s === "string")
          : [],
        materialPriors: Array.isArray(p.materialPriors)
          ? p.materialPriors.filter((s): s is string => typeof s === "string")
          : [],
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
