import { convertToAffiliateLink } from "@/lib/affiliate/convert-link";
import { validateAffiliateLink } from "@/lib/affiliate/validate-link";
import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
} from "@/lib/aliexpress/api-client";
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
import {
  AliExpressSearchError,
  type SupplierMatchResult,
} from "@/lib/aliexpress/types";
import type { AliExpressProductData } from "@/lib/types/analyze";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export async function findAliExpressSupplier(params: {
  attributes: ScrapedProductAttributes;
  storePriceUsd: number | null;
}): Promise<SupplierMatchResult> {
  const keywords = extractSearchKeywords(params.attributes.title);

  if (!keywords.trim()) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_EMPTY_KEYWORDS",
      "Unable to derive search keywords from the scraped product title.",
      422,
    );
  }

  const provider: "aliexpress_api" | "firecrawl_scrape" = isAliExpressApiConfigured()
    ? "aliexpress_api"
    : "firecrawl_scrape";

  const candidates =
    provider === "aliexpress_api"
      ? await searchAliExpressProducts(keywords)
      : await searchAliExpressViaScrape(keywords);

  if (candidates.length === 0) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_RESULTS",
      `No qualifying AliExpress suppliers found for "${keywords}".`,
      422,
    );
  }

  const winner = candidates[0];

  const { affiliateUrl, provider: affiliateProvider } = await convertToAffiliateLink({
    productUrl: winner.productUrl,
    existingPromotionLink: winner.promotionLink,
  });

  const affiliateLinkValidated = await validateAffiliateLink(affiliateUrl);

  if (!affiliateLinkValidated) {
    console.warn(
      `[aliexpress] Affiliate link validation failed for product ${winner.productId}; falling back to product URL.`,
    );
  }

  const resolvedAffiliateUrl = affiliateLinkValidated ? affiliateUrl : winner.productUrl;

  const aliexpressData: AliExpressProductData = {
    title: winner.title,
    priceUsd: winner.priceUsd,
    originalPriceUsd: params.storePriceUsd ?? undefined,
    imageUrl: winner.imageUrl ?? params.attributes.mainImageUrl ?? undefined,
    orderCount: winner.orderCount,
    sellerRating: winner.sellerRating,
    shippingDays: winner.shippingDays ?? undefined,
    affiliateUrl: resolvedAffiliateUrl,
  };

  return {
    aliexpressUrl: winner.productUrl,
    aliexpressData,
    searchMeta: {
      keywords,
      provider,
      candidateCount: candidates.length,
      winnerProductId: winner.productId,
      affiliateLinkValidated,
      affiliateProvider,
    },
  };
}
