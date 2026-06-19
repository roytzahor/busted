import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";
import { extractProductAttributes, assertValidProductAttributes } from "@/lib/scraping/extract-product";
import { scrapeWithPlaywright } from "@/lib/scraping/playwright-fallback";
import { isNonLatinTitle, translateTitle } from "@/lib/ai/translate-title";
import {
  ScraperError,
  type RawScrapeResult,
  type ScrapedProductAttributes,
} from "@/lib/scraping/types";

export interface ScrapeRouteResult {
  attributes: ScrapedProductAttributes;
  raw: RawScrapeResult;
}

/**
 * Detect non-Latin titles and attach an English translation for downstream
 * keyword extraction. Best-effort — never throws.
 */
async function maybeTranslate(
  attributes: ScrapedProductAttributes,
): Promise<ScrapedProductAttributes> {
  if (!isNonLatinTitle(attributes.title)) return attributes;
  const translation = await translateTitle(attributes.title);
  if (!translation || translation === attributes.title) return attributes;
  console.info(
    `[scrape-router] translated title: "${attributes.title}" → "${translation}"`,
  );
  return { ...attributes, translatedTitle: translation };
}

export async function scrapeProductUrl(
  targetUrl: string,
): Promise<ScrapeRouteResult> {
  let primaryError: ScraperError | null = null;

  try {
    const raw = await scrapeWithFirecrawl(targetUrl);
    const attributes = await maybeTranslate(extractProductAttributes(raw));
    assertValidProductAttributes(attributes);
    return { raw, attributes };
  } catch (error) {
    primaryError =
      error instanceof ScraperError
        ? error
        : new ScraperError(
            "FIRECRAWL_ROUTER_ERROR",
            "Primary scraper failed unexpectedly.",
            500,
          );
  }

  try {
    const raw = await scrapeWithPlaywright(targetUrl);
    const attributes = await maybeTranslate(extractProductAttributes(raw));
    assertValidProductAttributes(attributes);
    return { raw, attributes };
  } catch (fallbackError) {
    const fallback =
      fallbackError instanceof ScraperError
        ? fallbackError
        : new ScraperError(
            "PLAYWRIGHT_ROUTER_ERROR",
            "Headless fallback failed unexpectedly.",
            500,
          );

    const combinedMessage = [
      `Primary scraper failed: ${primaryError?.message ?? "unknown error"}`,
      `Fallback scraper failed: ${fallback.message}`,
    ].join(" | ");

    throw new ScraperError(
      "SCRAPE_PIPELINE_FAILED",
      combinedMessage,
      fallback.statusCode === 500 || primaryError?.statusCode === 500 ? 500 : 422,
    );
  }
}
