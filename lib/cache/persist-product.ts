import { prisma } from "@/lib/prisma";
import { normalizeProductUrl } from "@/lib/cache/product-cache";
import type { AliExpressProductData } from "@/lib/types/analyze";
import type { CachedAiPrediction, CachedScrapeData } from "@/lib/types/cache";
import type { ScannedProduct } from "@prisma/client";
import { Prisma } from "@prisma/client";

function toAliExpressJson(data: AliExpressProductData): Prisma.InputJsonObject {
  return {
    title: data.title,
    priceUsd: data.priceUsd,
    ...(data.originalPriceUsd !== undefined
      ? { originalPriceUsd: data.originalPriceUsd }
      : {}),
    ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
    ...(data.orderCount !== undefined ? { orderCount: data.orderCount } : {}),
    ...(data.sellerRating !== undefined ? { sellerRating: data.sellerRating } : {}),
    ...(data.shippingDays !== undefined ? { shippingDays: data.shippingDays } : {}),
    ...(data.affiliateUrl !== undefined ? { affiliateUrl: data.affiliateUrl } : {}),
  };
}

function toScrapeJson(data: CachedScrapeData): Prisma.InputJsonObject {
  return {
    provider: data.provider,
    attributes: {
      title: data.attributes.title,
      description: data.attributes.description,
      mainImageUrl: data.attributes.mainImageUrl,
      sourceUrl: data.attributes.sourceUrl,
      provider: data.attributes.provider,
    },
    detectedStorePriceUsd: data.detectedStorePriceUsd,
    storeName: data.storeName,
    markdownLength: data.markdownLength,
    markdownPreview: data.markdownPreview,
  };
}

function toAiJson(data: CachedAiPrediction): Prisma.InputJsonObject {
  return {
    provider: data.provider,
    model: data.model,
    prediction: data.prediction as unknown as Prisma.InputJsonValue,
    rawResponse: data.rawResponse,
    error: data.error,
    analyzedAt: data.analyzedAt,
  };
}

export async function persistScannedProduct(params: {
  originalUrl: string;
  scrapeData: CachedScrapeData;
  aiPrediction: CachedAiPrediction;
  aliexpressUrl?: string | null;
  aliexpressData?: AliExpressProductData | null;
}): Promise<ScannedProduct> {
  const normalizedUrl = normalizeProductUrl(params.originalUrl);
  const now = new Date();

  return prisma.scannedProduct.upsert({
    where: { originalUrl: normalizedUrl },
    create: {
      originalUrl: normalizedUrl,
      scrapeData: toScrapeJson(params.scrapeData),
      aiPrediction: toAiJson(params.aiPrediction),
      aliexpressUrl: params.aliexpressUrl ?? null,
      aliexpressData: params.aliexpressData
        ? toAliExpressJson(params.aliexpressData)
        : Prisma.JsonNull,
      lastScrapedAt: now,
    },
    update: {
      scrapeData: toScrapeJson(params.scrapeData),
      aiPrediction: toAiJson(params.aiPrediction),
      ...(params.aliexpressUrl !== undefined ? { aliexpressUrl: params.aliexpressUrl } : {}),
      ...(params.aliexpressData !== undefined
        ? {
            aliexpressData: params.aliexpressData
              ? toAliExpressJson(params.aliexpressData)
              : Prisma.JsonNull,
          }
        : {}),
      lastScrapedAt: now,
    },
  });
}
