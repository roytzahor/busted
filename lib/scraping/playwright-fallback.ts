import { stripScrapedContent } from "@/lib/scraping/strip-content";
import { ScraperError, type RawScrapeResult } from "@/lib/scraping/types";

const DEFAULT_TIMEOUT_MS = 45_000;

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Headless browser fallback for dynamic / lazy-loaded product pages.
 * Selector optimization is deferred — this wrapper establishes the routing contract.
 */
export async function scrapeWithPlaywright(targetUrl: string): Promise<RawScrapeResult> {
  const enabled = process.env.PLAYWRIGHT_FALLBACK_ENABLED === "true";

  if (!enabled) {
    throw new ScraperError(
      "PLAYWRIGHT_NOT_CONFIGURED",
      "Playwright headless fallback is not enabled. Set PLAYWRIGHT_FALLBACK_ENABLED=true to activate.",
      422,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    // Phase 3: wire Playwright browser context with human-like interaction params.
    // For now, attempt a lightweight fetch as a structural placeholder.
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ScraperError(
        "PLAYWRIGHT_FETCH_FAILED",
        `Headless fallback could not load the page (${response.status}).`,
        422,
      );
    }

    const html = await response.text();
    const title = extractTitleFromHtml(html);
    const description = extractMetaContent(html, "description");
    const ogImage = extractMetaContent(html, "og:image");

    const stripped = stripScrapedContent(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " "),
    );

    if (!title && stripped.length < 50) {
      throw new ScraperError(
        "PLAYWRIGHT_INSUFFICIENT_CONTENT",
        "Headless fallback retrieved insufficient product content. Full Playwright selectors required.",
        422,
      );
    }

    return {
      provider: "playwright",
      markdown: stripped,
      metadata: {
        title: title ?? undefined,
        description: description ?? undefined,
        ogImage: ogImage ?? undefined,
        sourceUrl: targetUrl,
      },
    };
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScraperError(
        "PLAYWRIGHT_TIMEOUT",
        "Headless browser fallback timed out before completing.",
        422,
      );
    }

    throw new ScraperError(
      "PLAYWRIGHT_UNKNOWN_ERROR",
      "An unexpected error occurred during the headless browser fallback.",
      500,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractMetaContent(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}
