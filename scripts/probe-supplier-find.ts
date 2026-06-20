/**
 * Live end-to-end probe of the supplier-finding pipeline.
 *
 * Skips scrape + AI entirely — feeds in hand-crafted scraped attributes
 * (as if our Allbirds-style scrape had already happened) plus a known
 * good keyword set. Exercises:
 *   - AE keyword + smartmatch search arms
 *   - Match-confidence scoring
 *   - (Optional) variant fetch + matching
 *   - Affiliate-link surfacing (`promotionLink` field)
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/probe-supplier-find.ts
 */

import { findAliExpressSupplier } from "@/lib/aliexpress/find-supplier";

async function main() {
  console.log("\n── Supplier-find live probe ────────────────────────────");

  const result = await findAliExpressSupplier({
    attributes: {
      title: "Aromatherapy Shower Steamers – Lavender Eucalyptus Set of 6",
      description:
        "Fizzing shower tablets with essential oils. Place on shower floor; steam activates the scent. Set of 6, various scents.",
      mainImageUrl:
        "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600",
      sourceUrl: "https://www.examplestore.com/products/shower-steamers",
      provider: "crawlbase",
    },
    storePriceUsd: 28,
    productCategory: "shower steamer",
    aiKeywords: ["shower steamer aromatherapy tablets", "eucalyptus shower bomb tablets"],
  });

  console.log(`\nMatch confidence: ${(result.matchConfidence * 100).toFixed(0)}% (${result.matchQuality})`);
  console.log(`Candidate count:  ${result.searchMeta.candidateCount}`);
  console.log(`Winner productId: ${result.searchMeta.winnerProductId}`);
  console.log(`Reasons:`);
  for (const r of result.matchReasons.slice(0, 5)) console.log(`  · ${r}`);

  console.log(`\n── AliExpress winner ───────────────────────────────────`);
  console.log(`Title:        ${result.aliexpressData.title.slice(0, 80)}`);
  console.log(`Price USD:    $${result.aliexpressData.priceUsd}`);
  console.log(`Image:        ${(result.aliexpressData.imageUrl ?? "").slice(0, 80)}`);
  console.log(`Orders:       ${result.aliexpressData.orderCount}`);
  console.log(`Rating:       ${result.aliexpressData.sellerRating}`);
  console.log(`\nProduct URL:`);
  console.log(`  ${result.aliexpressUrl ?? "—"}`);
  console.log(`\nAffiliate URL (this is what the Buy CTA opens):`);
  console.log(`  ${result.aliexpressData.affiliateUrl ?? "—"}`);

  console.log(`\n── done ───────────────────────────────────────────────\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nProbe FAILED:", e);
    process.exit(1);
  });
