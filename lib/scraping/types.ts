export type ScrapeProvider = "firecrawl" | "playwright";

export interface ScrapeMetadata {
  title?: string;
  description?: string;
  ogImage?: string;
  sourceUrl: string;
}

export interface RawScrapeResult {
  provider: ScrapeProvider;
  markdown: string;
  metadata: ScrapeMetadata;
  /**
   * Raw HTML of the page — present when Firecrawl returns it (formats includes "html").
   * Used by the JSON-LD extractor to pull structured Product schema data
   * (name, description, image, price, offers) deterministically without regex.
   * Absent for Playwright scrapes (which return markdown only).
   */
  html?: string;
}

export interface ScrapedProductVariant {
  color?: string;
  size?: string;
  capacity?: string;
  material?: string;
  selectedSku?: string;
}

export interface ScrapedProductAttributes {
  title: string;
  description: string;
  mainImageUrl: string | null;
  sourceUrl: string;
  provider: ScrapeProvider;
  variant?: ScrapedProductVariant;
  /**
   * English translation of `title` when the original is non-Latin script
   * (Hebrew, Arabic, CJK, Korean). Used for AliExpress keyword extraction
   * only — the original title is preserved for AI verdict prompts.
   * Absent when the title is already Latin-script or translation failed.
   */
  translatedTitle?: string;
}

export class ScraperError extends Error {
  readonly code: string;
  readonly statusCode: 422 | 500;

  constructor(code: string, message: string, statusCode: 422 | 500 = 422) {
    super(message);
    this.name = "ScraperError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
