import { scrapeWithCrawlbase } from "@/lib/scraping/crawlbase";
import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";
import { extractProductAttributes, assertValidProductAttributes } from "@/lib/scraping/extract-product";
import { scrapeWithPlaywright } from "@/lib/scraping/playwright-fallback";
import { isNonLatinTitle, translateTitle } from "@/lib/ai/translate-title";
import { domainFromUrl, getDomainRecipe } from "@/lib/learning/priors";
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

type ProviderName = "crawlbase" | "firecrawl" | "playwright";

interface ScrapeArm {
  name: ProviderName;
  run: (url: string) => Promise<RawScrapeResult>;
}

const ALL_ARMS: ScrapeArm[] = [
  { name: "crawlbase", run: scrapeWithCrawlbase },
  { name: "firecrawl", run: scrapeWithFirecrawl },
  { name: "playwright", run: scrapeWithPlaywright },
];

/**
 * Build the scrape arm order, consulting the learned per-domain recipe.
 *
 *   - If a `preferredProvider` is known for this domain, hoist it to position 0.
 *   - If a `skipProvider` is known (historical failure rate ≥ 50% with ≥3 samples),
 *     drop it entirely — saves a wasted network round-trip on warm misses.
 *
 * Falls back to the default order (crawlbase → firecrawl → playwright) when
 * no recipe exists. Recipe lookup uses the 5-min in-memory snapshot in
 * lib/learning/priors.ts, so this adds at most one cached map read per scan.
 */
async function resolveArmOrder(targetUrl: string): Promise<ScrapeArm[]> {
  const domain = domainFromUrl(targetUrl);
  if (!domain) return ALL_ARMS;

  const recipe = await getDomainRecipe(domain);
  if (!recipe) return ALL_ARMS;

  const skip = recipe.skipProvider;
  const preferred = recipe.preferredProvider;

  const filtered = skip ? ALL_ARMS.filter((a) => a.name !== skip) : [...ALL_ARMS];
  if (!preferred) return filtered;

  // Hoist preferred to position 0; keep relative order of the rest.
  filtered.sort((a, b) => {
    if (a.name === preferred && b.name !== preferred) return -1;
    if (b.name === preferred && a.name !== preferred) return 1;
    return 0;
  });
  return filtered;
}

export async function scrapeProductUrl(
  targetUrl: string,
): Promise<ScrapeRouteResult> {
  const arms = await resolveArmOrder(targetUrl);
  const failures: Array<{ name: ProviderName; error: ScraperError }> = [];

  for (let i = 0; i < arms.length; i += 1) {
    const arm = arms[i];
    try {
      const raw = await arm.run(targetUrl);
      const attributes = await maybeTranslate(extractProductAttributes(raw));
      assertValidProductAttributes(attributes);
      return { raw, attributes };
    } catch (error) {
      const wrapped =
        error instanceof ScraperError
          ? error
          : new ScraperError(
              `${arm.name.toUpperCase()}_ROUTER_ERROR`,
              `${arm.name} scraper failed unexpectedly.`,
              500,
            );
      failures.push({ name: arm.name, error: wrapped });
      if (i < arms.length - 1) {
        console.warn(
          `[scrape-router] ${arm.name} arm failed, trying ${arms[i + 1].name}:`,
          wrapped.message,
        );
      }
    }
  }

  // All arms failed.
  const combined = failures
    .map((f) => `${f.name}: ${f.error.message}`)
    .join(" | ");
  const status500 = failures.some((f) => f.error.statusCode === 500);

  throw new ScraperError(
    "SCRAPE_PIPELINE_FAILED",
    combined || "All scrape arms failed without an error message.",
    status500 ? 500 : 422,
  );
}
