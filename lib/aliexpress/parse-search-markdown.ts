import { extractPriceFromMarkdown } from "@/lib/scraping/extract-price";
import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

const ITEM_ID_PATTERN = /(?:aliexpress\.(?:com|us)|\/item)\/(\d{10,})\.html/gi;

/** Pulls the numeric AliExpress item id out of a product URL, or null if it doesn't match. */
export function extractProductIdFromUrl(url: string): string | null {
  const match = new RegExp(ITEM_ID_PATTERN.source, "i").exec(url);
  return match?.[1] ?? null;
}

function extractTitleNearId(markdown: string, productId: string): string | null {
  const index = markdown.indexOf(productId);
  if (index < 0) return null;

  const before = markdown.slice(Math.max(0, index - 300), index);
  const linkMatch = before.match(/\[([^\]]{5,120})\]\([^)]*$/);
  if (linkMatch?.[1]) return linkMatch[1].trim();

  const lineMatch = before.match(/([A-Za-z0-9][^\n]{8,120})\s*$/);
  return lineMatch?.[1]?.trim() ?? null;
}

function parseContextWindow(context: string): {
  priceUsd: number;
  orderCount: number;
  sellerRating: number;
} {
  const priceMatch = context.match(/(?:US\s*)?\$\s*([\d,.]+)/i);
  const priceUsd = priceMatch
    ? Number.parseFloat(priceMatch[1].replace(/,/g, ""))
    : 0;

  const soldMatch = context.match(/([\d,.]+(?:\s*[kKmM])?)\s*(?:sold|orders?|purchased)/i);
  const orderCount = soldMatch ? parseOrderCount(soldMatch[1]) : 0;

  const ratingMatch = context.match(/([\d.]+)\s*(?:\/\s*5|stars?|rating)/i);
  const percentMatch = context.match(/([\d.]+)\s*%/);
  let sellerRating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : 0;
  if (sellerRating <= 0 && percentMatch) {
    sellerRating = Math.round((Number.parseFloat(percentMatch[1]) / 100) * 50) / 10;
  }

  return {
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
    orderCount,
    sellerRating,
  };
}

function parseOrderCount(raw: string): number {
  const normalized = raw.replace(/,/g, "").toLowerCase();
  const match = normalized.match(/([\d.]+)\s*(k|m)?/);
  if (!match) return 0;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return 0;

  if (match[2] === "k") return Math.round(base * 1000);
  if (match[2] === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
}

export function extractCandidatesFromMarkdown(
  markdown: string,
  keywords: string,
): AliExpressProductCandidate[] {
  const seenIds = new Set<string>();
  const candidates: AliExpressProductCandidate[] = [];

  let match: RegExpExecArray | null;
  ITEM_ID_PATTERN.lastIndex = 0;
  while ((match = ITEM_ID_PATTERN.exec(markdown)) !== null) {
    const productId = match[1];
    if (seenIds.has(productId)) continue;
    seenIds.add(productId);

    const index = match.index;
    const context = markdown.slice(Math.max(0, index - 250), index + 450);
    const parsed = parseContextWindow(context);
    const title = extractTitleNearId(markdown, productId) ?? keywords;

    candidates.push({
      productId,
      title,
      priceUsd: parsed.priceUsd,
      productUrl: `https://www.aliexpress.com/item/${productId}.html`,
      imageUrl: null,
      orderCount: parsed.orderCount,
      sellerRating: parsed.sellerRating > 0 ? parsed.sellerRating : 4.6,
      shippingDays: null,
      promotionLink: null,
    });
  }

  return candidates;
}

export async function enrichCandidatesWithDetailScrape(
  candidates: AliExpressProductCandidate[],
  limit = 3,
): Promise<AliExpressProductCandidate[]> {
  const needsEnrichment = candidates.filter((candidate) => candidate.priceUsd <= 0);
  const enrichedIds = new Set<string>();

  for (const candidate of needsEnrichment.slice(0, limit)) {
    try {
      const detail = await scrapeWithFirecrawl(candidate.productUrl);
      const priceUsd = extractPriceFromMarkdown(detail.markdown);
      if (!priceUsd) continue;

      enrichedIds.add(candidate.productId);
      candidate.priceUsd = priceUsd;

      const title =
        detail.metadata.title?.replace(/\s*-\s*AliExpress.*$/i, "").trim() ??
        candidate.title;
      if (title) candidate.title = title;

      if (detail.metadata.ogImage) {
        candidate.imageUrl = detail.metadata.ogImage;
      }
    } catch {
      // Try next candidate
    }
  }

  return candidates.filter(
    (candidate) => candidate.priceUsd > 0 || enrichedIds.has(candidate.productId),
  );
}
