/**
 * AliExpress supplier adapter — the one provider with a live, configured
 * official API today. Thin wrapper over the existing affiliate-API search so
 * the multi-supplier router can treat AliExpress like any other network.
 *
 * Affiliate-link construction here is intentionally minimal (we hand back the
 * product/promotion URL); the heavy affiliate conversion + validation already
 * lives downstream in find-supplier.ts and isn't duplicated.
 */

import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
  type KeywordSearchOptions,
} from "@/lib/aliexpress/api-client";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import {
  type ISupplierProvider,
  type SupplierCandidate,
  type SupplierSearchOptions,
} from "@/lib/supplier/types";

/** Map AliExpress native trust signals (order volume + rating) into 0..1. */
function toTrustScore(c: AliExpressProductCandidate): number {
  const orderTrust = Math.min(1, c.orderCount / 1000); // 1000+ orders → full
  const ratingTrust = Math.max(0, Math.min(1, (c.sellerRating - 3.5) / 1.5)); // 3.5→0, 5.0→1
  return +(orderTrust * 0.6 + ratingTrust * 0.4).toFixed(3);
}

function toSupplierCandidate(c: AliExpressProductCandidate): SupplierCandidate {
  return {
    id: c.productId,
    title: c.title,
    priceUsd: c.priceUsd,
    imageUrl: c.imageUrl ?? "",
    affiliateLink: c.promotionLink ?? c.productUrl,
    storeName: "AliExpress",
    sourceProvider: "aliexpress",
    trustScore: toTrustScore(c),
  };
}

export const aliexpressProvider: ISupplierProvider = {
  name: "AliExpress",
  provider: "aliexpress",

  isConfigured(): boolean {
    return isAliExpressApiConfigured();
  },

  async searchByText(
    keywords: string[],
    opts: SupplierSearchOptions = {},
  ): Promise<SupplierCandidate[]> {
    const query = keywords.filter((k) => k.trim().length > 0).join(" ").trim();
    if (!query) return [];

    const apiOpts: KeywordSearchOptions = {
      shipToCountry: opts.shipToCountry,
      targetCurrency: opts.targetCurrency,
      minSalePrice: opts.minPriceUsd,
      maxSalePrice: opts.maxPriceUsd,
    };

    const results = await searchAliExpressProducts(query, apiOpts);
    const mapped = results.map(toSupplierCandidate);
    return opts.limit ? mapped.slice(0, opts.limit) : mapped;
  },
};
