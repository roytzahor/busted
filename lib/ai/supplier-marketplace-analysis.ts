import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import { getSupplierMarketplaceLabel } from "@/lib/scraping/detect-source";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export function buildSupplierMarketplacePrediction(
  sourceUrl: string,
  attributes: ScrapedProductAttributes,
  storePriceUsd: number | null,
): DropshipPrediction {
  const marketplace = getSupplierMarketplaceLabel(sourceUrl);

  return {
    verdict: "legit",
    isLikelyDropship: false,
    confidence: 0.98,
    productCategory: attributes.title.slice(0, 120) || "Marketplace listing",
    reasoning: `This link is already on ${marketplace} — a wholesale supplier marketplace, not a marked-up retail store. Busted checks retail shops (Shopify, Instagram stores, etc.) for dropship markup. Paste the store URL where you saw this product listed at a higher price to compare.`,
    reasoningSignals: [`URL is on ${marketplace} (supplier marketplace)`],
    missingSignals: [],
    redFlags: [],
    aliexpressKeywords: [],
    estimatedStorePriceUsd: storePriceUsd,
    estimatedSupplierPriceUsd: storePriceUsd,
    estimatedMarkupPercent: 0,
  };
}
