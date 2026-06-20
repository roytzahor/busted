import { searchAliExpressProducts, isAliExpressApiConfigured } from "@/lib/aliexpress/api-client";
import type { KeywordSearchOptions } from "@/lib/aliexpress/api-client";

const sharedOpts: KeywordSearchOptions = {
  shipToCountry: "US", targetCurrency: "USD",
  categoryIds: "200000301,200002032,200002033",
  sortStrategy: "LAST_VOLUME_DESC",
  minSalePrice: 5, maxSalePrice: 66.67,
};

async function tryWithFallback(keyword: string): Promise<number> {
  const tiers = [
    sharedOpts,
    { shipToCountry: "US", targetCurrency: "USD", categoryIds: sharedOpts.categoryIds, sortStrategy: sharedOpts.sortStrategy },
    { shipToCountry: "US", targetCurrency: "USD", sortStrategy: sharedOpts.sortStrategy },
    { shipToCountry: "US", targetCurrency: "USD" },
  ];
  for (const opts of tiers) {
    try {
      const r = await searchAliExpressProducts(keyword, opts);
      if (r.length > 0) return r.length;
    } catch { /* try next */ }
  }
  return 0;
}

async function main() {
  console.log("API configured:", isAliExpressApiConfigured());

  const keywords = [
    "wool slippers men",
    "wool loungers shoes",
    "men wool lounger slip shoes",
    "merino wool slip-on",
  ];

  for (const kw of keywords) {
    const n = await tryWithFallback(kw);
    console.log(`"${kw}": ${n} results`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
