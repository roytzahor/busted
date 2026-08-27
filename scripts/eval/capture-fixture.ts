/**
 * Capture a live fixture from a real URL.
 *
 * Usage:
 *   npm run eval:capture -- <fixture-id> <url> [category]
 *
 * Example:
 *   npm run eval:capture -- shopify-watch-01 https://example.com/products/watch dropship_obvious
 *
 * Writes scrape.json + ai-response.json + aliexpress.json into
 * tests/fixtures/products/<fixture-id>/. truth.json is stubbed for you to edit.
 */

import { scrapeProductUrl } from "@/lib/scraping/router";
import {
  detectPriceInMarkdown,
  extractStoreNameFromUrl,
} from "@/lib/scraping/extract-price";
import { verifyDropshipLikelihood } from "@/lib/ai/dropship-verifier";
import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
} from "@/lib/aliexpress/api-client";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
import { searchWithAiKeywordsFirst } from "@/lib/eval/capture-keywords";
import { saveFixture } from "@/lib/eval/fixture-store";
import type {
  FixtureAiResponse,
  FixtureAliExpress,
  FixtureCategory,
  FixtureScrape,
  FixtureTruth,
} from "@/tests/eval/fixture-types";

const ALL_CATEGORIES: FixtureCategory[] = [
  "dropship_obvious",
  "dropship_subtle",
  "legit_brand",
  "not_a_product",
  "aliexpress_itself",
];

function parseArgs(): { id: string; url: string; category: FixtureCategory } {
  const [id, url, category = "dropship_obvious"] = process.argv.slice(2);
  if (!id || !url) {
    console.error("Usage: npm run eval:capture -- <fixture-id> <url> [category]");
    process.exit(1);
  }
  if (!ALL_CATEGORIES.includes(category as FixtureCategory)) {
    console.error(`Invalid category. Use one of: ${ALL_CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  return { id, url, category: category as FixtureCategory };
}

async function main(): Promise<void> {
  const { id, url, category } = parseArgs();

  console.log(`\n[capture] fixture=${id} url=${url}`);
  console.log(`[capture] category=${category}`);

  console.log("[capture] step 1/3: scraping…");
  let scrapeFixture: FixtureScrape;
  try {
    const scrapeResult = await scrapeProductUrl(url);
    const detectedPrice = detectPriceInMarkdown(scrapeResult.raw.markdown);
    const storePriceUsd = detectedPrice?.amountUsd ?? null;
    const storeName = extractStoreNameFromUrl(url);
    scrapeFixture = {
      raw: scrapeResult.raw,
      attributes: scrapeResult.attributes,
      detectedStorePriceUsd: storePriceUsd,
      detectedStorePriceNative: detectedPrice?.amount ?? null,
      detectedStorePriceCurrency: detectedPrice?.currency ?? null,
      storeName,
    };
    console.log(`[capture]   ✓ scraped via ${scrapeResult.raw.provider}`);
    console.log(`[capture]   ✓ title: ${scrapeResult.attributes.title.slice(0, 80)}`);
    console.log(
      `[capture]   ✓ detected price: ${
        detectedPrice
          ? `${detectedPrice.amount} ${detectedPrice.currency} → $${detectedPrice.amountUsd.toFixed(2)}`
          : "?"
      }`,
    );
  } catch (err) {
    console.error(`[capture]   ✗ scrape failed: ${(err as Error).message}`);
    process.exit(2);
  }

  console.log("[capture] step 2/3: running AI verifier…");
  let aiFixture: FixtureAiResponse | undefined;
  try {
    const aiResult = await verifyDropshipLikelihood({
      attributes: scrapeFixture.attributes,
      markdownExcerpt: scrapeFixture.raw.markdown,
      storePriceUsd: scrapeFixture.detectedStorePriceUsd,
    });
    aiFixture = {
      prediction: aiResult.prediction,
      rawResponse: aiResult.rawResponse,
      model: aiResult.model,
      provider: aiResult.provider,
      error: aiResult.error,
    };
    if (aiResult.prediction) {
      console.log(
        `[capture]   ✓ AI verdict: dropship=${aiResult.prediction.isLikelyDropship} confidence=${Math.round(aiResult.prediction.confidence * 100)}%`,
      );
    } else {
      console.log(`[capture]   ! AI prediction unavailable: ${aiResult.error}`);
    }
  } catch (err) {
    console.error(`[capture]   ✗ AI failed: ${(err as Error).message}`);
  }

  console.log("[capture] step 3/3: searching AliExpress…");
  let aliFixture: FixtureAliExpress | undefined;
  try {
    const effectiveTitle =
      scrapeFixture.attributes.translatedTitle ?? scrapeFixture.attributes.title;
    const provider: "aliexpress_api" | "firecrawl_scrape" = isAliExpressApiConfigured()
      ? "aliexpress_api"
      : "firecrawl_scrape";
    const searchFn = provider === "aliexpress_api" ? searchAliExpressProducts : searchAliExpressViaScrape;
    const { keywords, candidates, warnings } = await searchWithAiKeywordsFirst(
      effectiveTitle,
      aiFixture?.prediction?.aliexpressKeywords,
      searchFn,
    );
    aliFixture = { keywords, provider, candidates };
    console.log(`[capture]   ✓ ${candidates.length} candidates via ${provider}`);
    for (const w of warnings) console.log(`[capture]   ! arm failed: ${w}`);
  } catch (err) {
    console.log(`[capture]   ! AliExpress search failed: ${(err as Error).message}`);
  }

  const truth: FixtureTruth = {
    url,
    category,
    expectedVerdict:
      category === "dropship_obvious" || category === "dropship_subtle"
        ? "dropship"
        : category === "legit_brand"
          ? "legit"
          : category === "not_a_product"
            ? "not_a_product"
            : "legit",
    expectedSupplier: {
      shouldFindMatch:
        category === "dropship_obvious" || category === "dropship_subtle",
      notes: "TODO: review captured aliexpress.json and confirm correct candidate. Set expectedPriceUsdBand.",
    },
    notes: "AUTO-STUBBED — review and edit before running eval. Set confidenceMin/Max and verify expectedSupplier.",
    capturedAt: new Date().toISOString(),
  };

  saveFixture(id, {
    truth,
    scrape: scrapeFixture,
    aiResponse: aiFixture,
    aliexpress: aliFixture,
  });

  console.log(`\n[capture] ✓ saved tests/fixtures/products/${id}/`);
  console.log(`[capture] → edit ${id}/truth.json to confirm labels before running eval`);
}

main().catch((err) => {
  console.error("[capture] fatal:", err);
  process.exit(99);
});
