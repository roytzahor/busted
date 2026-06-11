import type { AliExpressProductData } from "@/lib/types/analyze";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

/**
 * Simulates a successful AliExpress structural match from scraped attributes.
 * Replaced by real visual/text search + LLM verification in a future phase.
 */
export function simulateAliExpressMatch(
  attributes: ScrapedProductAttributes,
): { aliexpressUrl: string; aliexpressData: AliExpressProductData } {
  const slug = attributes.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  const aliexpressUrl = `https://www.aliexpress.com/item/${slug || "product"}.html`;

  const aliexpressData: AliExpressProductData = {
    title: attributes.title,
    priceUsd: 9.99,
    originalPriceUsd: 14.99,
    imageUrl: attributes.mainImageUrl ?? undefined,
    orderCount: 1000,
    sellerRating: 4.8,
    shippingDays: 12,
    affiliateUrl: aliexpressUrl,
  };

  return { aliexpressUrl, aliexpressData };
}
