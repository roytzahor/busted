import { stripScrapedContent } from "@/lib/scraping/strip-content";
import { ScraperError, type RawScrapeResult } from "@/lib/scraping/types";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";
const DEFAULT_TIMEOUT_MS = 30_000;

interface FirecrawlMetadata {
  title?: string;
  description?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  sourceURL?: string;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: FirecrawlMetadata;
  };
  error?: string;
}

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export async function scrapeWithFirecrawl(targetUrl: string): Promise<RawScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    throw new ScraperError(
      "FIRECRAWL_NOT_CONFIGURED",
      "Firecrawl API key is not configured. Set FIRECRAWL_API_KEY in your environment.",
      500,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ScraperError(
        "FIRECRAWL_HTTP_ERROR",
        `Firecrawl request failed (${response.status}): ${errorBody.slice(0, 200)}`,
        response.status >= 500 ? 500 : 422,
      );
    }

    const payload = (await response.json()) as FirecrawlScrapeResponse;

    if (!payload.success || !payload.data?.markdown) {
      throw new ScraperError(
        "FIRECRAWL_EMPTY_RESPONSE",
        payload.error ?? "Firecrawl returned no usable markdown content.",
        422,
      );
    }

    const metadata = payload.data.metadata ?? {};

    return {
      provider: "firecrawl",
      markdown: stripScrapedContent(payload.data.markdown),
      metadata: {
        title: metadata.ogTitle ?? metadata.title,
        description: metadata.ogDescription ?? metadata.description,
        ogImage: metadata.ogImage,
        sourceUrl: metadata.sourceURL ?? targetUrl,
      },
    };
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScraperError(
        "FIRECRAWL_TIMEOUT",
        "Firecrawl scrape timed out before completing.",
        422,
      );
    }

    throw new ScraperError(
      "FIRECRAWL_UNKNOWN_ERROR",
      "An unexpected error occurred while scraping with Firecrawl.",
      500,
    );
  } finally {
    clearTimeout(timeout);
  }
}
