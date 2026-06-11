import { prisma } from "@/lib/prisma";
import { normalizeProductUrl } from "@/lib/cache/product-cache";
import type { AliExpressProductData } from "@/lib/types/analyze";
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

export async function persistScannedProduct(params: {
  originalUrl: string;
  aliexpressUrl: string;
  aliexpressData: AliExpressProductData;
}): Promise<ScannedProduct> {
  const normalizedUrl = normalizeProductUrl(params.originalUrl);
  const now = new Date();
  const aliexpressJson = toAliExpressJson(params.aliexpressData);

  return prisma.scannedProduct.upsert({
    where: { originalUrl: normalizedUrl },
    create: {
      originalUrl: normalizedUrl,
      aliexpressUrl: params.aliexpressUrl,
      aliexpressData: aliexpressJson,
      lastScrapedAt: now,
    },
    update: {
      aliexpressUrl: params.aliexpressUrl,
      aliexpressData: aliexpressJson,
      lastScrapedAt: now,
    },
  });
}
