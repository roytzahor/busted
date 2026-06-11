import { prisma } from "@/lib/prisma";
import type { ScannedProduct } from "@prisma/client";

export const CACHE_TTL_DAYS = 7;

export function normalizeProductUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";
  parsed.search = "";
  return parsed.href.replace(/\/+$/, "");
}

export function isCacheValid(lastScrapedAt: Date, now: Date = new Date()): boolean {
  const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - lastScrapedAt.getTime() < ttlMs;
}

export async function findValidCachedProduct(
  originalUrl: string,
): Promise<ScannedProduct | null> {
  const normalizedUrl = normalizeProductUrl(originalUrl);

  const cached = await prisma.scannedProduct.findUnique({
    where: { originalUrl: normalizedUrl },
  });

  if (!cached || !isCacheValid(cached.lastScrapedAt)) {
    return null;
  }

  return cached;
}
