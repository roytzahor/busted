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
  extractPriceFromMarkdown,
  extractStoreNameFromUrl,
} from "@/lib/scraping/extract-price";
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
  storeName: string;
  provider: ScrapeProvider;
}

export async function scrape(input: ScraperInput): Promise<Result<ScraperOutput>> {
  return runService("scraper", "scrape", async (emit) => {
    emit("scrape:start", `Scraping ${input.url}`);

    try {
      const result = await scrapeProductUrl(input.url);
      const detectedStorePriceUsd = extractPriceFromMarkdown(result.raw.markdown);
      const storeName = extractStoreNameFromUrl(input.url);

      emit("scrape:done", `${result.raw.provider} returned ${result.raw.markdown.length.toLocaleString()} chars`, {
        provider: result.raw.provider,
        markdownLength: result.raw.markdown.length,
        title: result.attributes.title,
        detectedStorePriceUsd,
        hasImage: result.attributes.mainImageUrl !== null,
      });

      return ok<ScraperOutput>({
        attributes: result.attributes,
        markdown: result.raw.markdown,
        html: result.raw.html,
        detectedStorePriceUsd,
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
