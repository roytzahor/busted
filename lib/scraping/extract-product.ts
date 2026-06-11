import type { RawScrapeResult, ScrapedProductAttributes } from "@/lib/scraping/types";

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
  const title =
    scrape.metadata.title?.trim() ||
    extractFirstHeading(scrape.markdown) ||
    "Unknown Product";

  const description =
    scrape.metadata.description?.trim() ||
    extractFirstParagraph(scrape.markdown) ||
    title;

  const mainImageUrl =
    scrape.metadata.ogImage?.trim() ||
    extractFirstImageUrl(scrape.markdown) ||
    null;

  return {
    title,
    description,
    mainImageUrl,
    sourceUrl: scrape.metadata.sourceUrl,
    provider: scrape.provider,
  };
}
