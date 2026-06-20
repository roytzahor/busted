/**
 * Live probe — hits the AliExpress affiliate API + affiliate link converter
 * without going through the AI/scraping stages. Lets us verify the supplier
 * + affiliate paths in isolation when Gemini quota is exhausted.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/probe-aliexpress.ts "wool slippers"
 */

import {
  searchAliExpressProducts,
  isAliExpressApiConfigured,
} from "@/lib/aliexpress/api-client";

async function main() {
  const keyword = process.argv[2] ?? "wool slippers";

  console.log(`\n── AliExpress live probe ────────────────────────────────`);
  console.log(`Keyword: "${keyword}"`);
  console.log(`API configured: ${isAliExpressApiConfigured()}`);
  if (!isAliExpressApiConfigured()) {
    console.error("Missing ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET in .env");
    process.exit(1);
  }

  const t0 = Date.now();
  const candidates = await searchAliExpressProducts(keyword);
  console.log(`Returned ${candidates.length} candidate(s) in ${Date.now() - t0}ms`);

  if (candidates.length === 0) {
    console.warn("No candidates returned — empty result set");
    return;
  }

  for (const c of candidates.slice(0, 3)) {
    console.log(`\n• ${c.title.slice(0, 80)}`);
    console.log(`  productId:      ${c.productId}`);
    console.log(`  priceUsd:       $${c.priceUsd}`);
    console.log(`  orderCount:     ${c.orderCount ?? "n/a"}`);
    console.log(`  sellerRating:   ${c.sellerRating ?? "n/a"}`);
    console.log(`  shippingDays:   ${c.shippingDays ?? "n/a"}`);
    console.log(`  productUrl:     ${c.productUrl}`);
    console.log(`  promotionLink:  ${c.promotionLink ?? "—"}`);
  }

  console.log(`\n── done ───────────────────────────────────────────────\n`);
}

main().catch((e) => {
  console.error("\nProbe FAILED:", e);
  process.exit(1);
});
