/**
 * ScraperService — URL → scraped product data
 *
 * Thin wrapper around the existing scrapeProductUrl pipeline:
 * Firecrawl primary → Playwright fallback → attribute extraction →
 * price + store-name derivation.
 */

import { err, ok, type Result } from "@/lib/services/types";
import { runService } from "@/lib/services/run";
import {
  detectPriceInMarkdown,
  extractStoreNameFromUrl,
} from "@/lib/scraping/extract-price";
import type { CurrencyCode } from "@/lib/currency";
import { scrapeProductUrl } from "@/lib/scraping/router";
import { ScraperError, type ScrapedProductAttributes, type ScrapeProvider } from "@/lib/scraping/types";

export interface ScraperInput {
  url: string;
}

export interface ScraperOutput {
  attributes: ScrapedProductAttributes;
  markdown: string;
  /** Raw page HTML when the provider captured it — feeds the Tier-0
   *  fingerprint gate (app footprints live in script/meta tags that
   *  markdown strips). Absent for Playwright scrapes. */
  html?: string;
  detectedStorePriceUsd: number | null;
  /** Price as literally printed on the page, before FX. Absent when no price
   *  was found. Kept alongside the USD value so the UI can echo "238 ₪" back
   *  instead of a lossy USD round-trip, and so a wrong FX rate stays
   *  diagnosable after the fact. */
  detectedStorePriceNative?: number | null;
  detectedStorePriceCurrency?: CurrencyCode | null;
  storeName: string;
  provider: ScrapeProvider;
}

export async function scrape(input: ScraperInput): Promise<Result<ScraperOutput>> {
  return runService("scraper", "scrape", async (emit) => {
    emit("scrape:start", `Scraping ${input.url}`);

    try {
      const result = await scrapeProductUrl(input.url);
      const detectedPrice = detectPriceInMarkdown(result.raw.markdown);
      const detectedStorePriceUsd = detectedPrice?.amountUsd ?? null;
      const storeName = extractStoreNameFromUrl(input.url);

      emit("scrape:done", `${result.raw.provider} returned ${result.raw.markdown.length.toLocaleString()} chars`, {
        provider: result.raw.provider,
        markdownLength: result.raw.markdown.length,
        title: result.attributes.title,
        detectedStorePriceUsd,
        detectedStorePriceNative: detectedPrice?.amount ?? null,
        detectedStorePriceCurrency: detectedPrice?.currency ?? null,
        hasImage: result.attributes.mainImageUrl !== null,
      });

      return ok<ScraperOutput>({
        attributes: result.attributes,
        markdown: result.raw.markdown,
        html: result.raw.html,
        detectedStorePriceUsd,
        detectedStorePriceNative: detectedPrice?.amount ?? null,
        detectedStorePriceCurrency: detectedPrice?.currency ?? null,
        storeName,
        provider: result.raw.provider,
      });
    } catch (e) {
      if (e instanceof ScraperError) {
        return err<ScraperOutput>({
          code: e.code,
          message: e.message,
          recoverable: e.statusCode !== 500,
          cause: e,
        });
      }
      throw e;
    }
  });
}
