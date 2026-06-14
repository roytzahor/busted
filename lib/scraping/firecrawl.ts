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
  [key: string]: unknown;
}

interface FirecrawlScrapeData {
  markdown?: string;
  metadata?: FirecrawlMetadata;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: FirecrawlScrapeData;
  error?: string;
  message?: string;
}

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function extractMarkdown(data: FirecrawlScrapeData | undefined): string | null {
  if (!data) return null;

  if (typeof data.markdown === "string" && data.markdown.trim().length > 0) {
    return data.markdown;
  }

  return null;
}

function extractMetadata(
  data: FirecrawlScrapeData | undefined,
  targetUrl: string,
): RawScrapeResult["metadata"] {
  const metadata = data?.metadata ?? {};

  const ogImage =
    typeof metadata.ogImage === "string"
      ? metadata.ogImage
      : typeof metadata["og:image"] === "string"
        ? metadata["og:image"]
        : undefined;

  return {
    title:
      (typeof metadata.ogTitle === "string" ? metadata.ogTitle : undefined) ??
      (typeof metadata.title === "string" ? metadata.title : undefined),
    description:
      (typeof metadata.ogDescription === "string"
        ? metadata.ogDescription
        : undefined) ??
      (typeof metadata.description === "string" ? metadata.description : undefined),
    ogImage,
    sourceUrl:
      (typeof metadata.sourceURL === "string" ? metadata.sourceURL : undefined) ??
      targetUrl,
  };
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
        waitFor: 2000,
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw new ScraperError(
        "FIRECRAWL_HTTP_ERROR",
        `Firecrawl request failed (${response.status}): ${rawBody.slice(0, 300)}`,
        response.status >= 500 ? 500 : 422,
      );
    }

    let payload: FirecrawlScrapeResponse;
    try {
      payload = JSON.parse(rawBody) as FirecrawlScrapeResponse;
    } catch {
      throw new ScraperError(
        "FIRECRAWL_PARSE_ERROR",
        "Firecrawl returned a non-JSON response.",
        422,
      );
    }

    const markdown = extractMarkdown(payload.data);

    if (payload.success === false || !markdown) {
      throw new ScraperError(
        "FIRECRAWL_EMPTY_RESPONSE",
        payload.error ?? payload.message ?? "Firecrawl returned no usable markdown content.",
        422,
      );
    }

    return {
      provider: "firecrawl",
      markdown: stripScrapedContent(markdown),
      metadata: extractMetadata(payload.data, targetUrl),
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
      error instanceof Error ? error.message : "An unexpected Firecrawl error occurred.",
      500,
    );
  } finally {
    clearTimeout(timeout);
  }
}
