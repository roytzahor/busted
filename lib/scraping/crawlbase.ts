import { stripScrapedContent } from "@/lib/scraping/strip-content";
import { ScraperError, type RawScrapeResult, type ScrapeMetadata } from "@/lib/scraping/types";

const CRAWLBASE_API_URL = "https://api.crawlbase.com/";
const DEFAULT_TIMEOUT_MS = 30_000;

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function extractHtmlMeta(html: string, targetUrl: string): ScrapeMetadata {
  const getTag = (re: RegExp) => html.match(re)?.[1]?.trim();
  const getMeta = (name: string) =>
    getTag(new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)`, "i")) ??
    getTag(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}`, "i")) ??
    getTag(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)`, "i")) ??
    getTag(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}`, "i"));

  return {
    title: getMeta("og:title") ?? getTag(/<title[^>]*>([^<]+)<\/title>/i),
    description: getMeta("og:description") ?? getMeta("description"),
    ogImage: getMeta("og:image"),
    sourceUrl: getTag(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) ?? targetUrl,
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeWithCrawlbase(targetUrl: string): Promise<RawScrapeResult> {
  const token = process.env.CRAWLBASE_TOKEN;
  if (!token) {
    throw new ScraperError(
      "CRAWLBASE_NOT_CONFIGURED",
      "Crawlbase API token is not configured. Set CRAWLBASE_TOKEN in your environment.",
      500,
    );
  }

  const endpoint = new URL(CRAWLBASE_API_URL);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("javascript_render", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(endpoint.toString(), { signal: controller.signal });

    if (!response.ok) {
      throw new ScraperError(
        "CRAWLBASE_HTTP_ERROR",
        `Crawlbase returned HTTP ${response.status} for ${targetUrl}`,
        response.status >= 500 ? 500 : 422,
      );
    }

    const html = await response.text();

    if (!html || html.trim().length < 200) {
      throw new ScraperError(
        "CRAWLBASE_EMPTY_RESPONSE",
        "Crawlbase returned an empty or near-empty HTML body.",
        422,
      );
    }

    const markdown = stripScrapedContent(htmlToText(html));
    const metadata = extractHtmlMeta(html, targetUrl);

    return {
      provider: "crawlbase",
      markdown,
      metadata,
      html,
    };
  } catch (error) {
    if (error instanceof ScraperError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScraperError(
        "CRAWLBASE_TIMEOUT",
        "Crawlbase scrape timed out before completing.",
        422,
      );
    }

    throw new ScraperError(
      "CRAWLBASE_UNKNOWN_ERROR",
      error instanceof Error ? error.message : "An unexpected Crawlbase error occurred.",
      500,
    );
  } finally {
    clearTimeout(timeout);
  }
}
