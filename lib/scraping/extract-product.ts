import { extractVariantSignals } from "@/lib/scraping/extract-variant";
import { extractJsonLd, extractVariantFromOffers } from "@/lib/scraping/extract-jsonld";
import { ScraperError, type RawScrapeResult, type ScrapedProductAttributes } from "@/lib/scraping/types";

const INVALID_TITLE_PATTERNS = [
  /^404\b/i,
  /^not found$/i,
  /^page not found$/i,
  /^error\b/i,
];

function extractFirstHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,2}\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function extractFirstParagraph(markdown: string): string | null {
  const lines = markdown.split("\n").map((line) => line.trim());

  for (const line of lines) {
    if (!line || line.startsWith("#") || line.length < 20) {
      continue;
    }
    return line.slice(0, 500);
  }

  return null;
}

function extractFirstImageUrl(markdown: string): string | null {
  const match = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
  return match?.[1] ?? null;
}

export function extractProductAttributes(
  scrape: RawScrapeResult,
): ScrapedProductAttributes {
  // JSON-LD structured data — deterministic and machine-readable.
  // Present on Shopify, WooCommerce, and most modern storefronts.
  // Falls back to markdown extraction when absent or malformed.
  const jsonLd = scrape.html ? extractJsonLd(scrape.html) : null;

  const title =
    jsonLd?.name ||
    scrape.metadata.title?.trim() ||
    extractFirstHeading(scrape.markdown) ||
    "Unknown Product";

  const description =
    jsonLd?.description ||
    scrape.metadata.description?.trim() ||
    extractFirstParagraph(scrape.markdown) ||
    title;

  const mainImageUrl =
    jsonLd?.image ||
    scrape.metadata.ogImage?.trim() ||
    extractFirstImageUrl(scrape.markdown) ||
    null;

  // Variant extraction: JSON-LD offer list supplements URL/markdown signals.
  // extractVariantSignals handles the URL-param and markdown fallbacks.
  const markdownVariant = extractVariantSignals(
    scrape.markdown,
    scrape.metadata.sourceUrl,
    title,
  );

  // Merge JSON-LD offer variant data with markdown-derived signals.
  // JSON-LD wins when it provides a structured dimension (color/size)
  // that the markdown extractor missed — typically on stores that render
  // variant selection via JavaScript rather than URL params.
  const jsonLdVariant = jsonLd?.offers.length
    ? extractVariantFromOffers(
        jsonLd.offers,
        markdownVariant?.selectedSku,
      )
    : null;

  const variant =
    markdownVariant || jsonLdVariant
      ? {
          ...jsonLdVariant,  // JSON-LD base (lower priority — broad)
          ...markdownVariant, // URL/markdown signals win (higher specificity)
        }
      : undefined;

  return {
    title,
    description,
    mainImageUrl,
    sourceUrl: scrape.metadata.sourceUrl,
    provider: scrape.provider,
    ...(variant && Object.keys(variant).length > 0 ? { variant } : {}),
  };
}

export function assertValidProductAttributes(
  attributes: ScrapedProductAttributes,
): void {
  if (INVALID_TITLE_PATTERNS.some((pattern) => pattern.test(attributes.title.trim()))) {
    throw new ScraperError(
      "SCRAPE_INVALID_PAGE",
      "Scraper returned a non-product page (404 or error). Check the URL is a direct product link.",
      422,
    );
  }

  if (attributes.title === "Unknown Product" && attributes.description === "Unknown Product") {
    throw new ScraperError(
      "SCRAPE_INSUFFICIENT_DATA",
      "Could not extract product title or description from the scraped page.",
      422,
    );
  }
}
