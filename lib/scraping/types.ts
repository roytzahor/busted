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
}

export interface ScrapedProductAttributes {
  title: string;
  description: string;
  mainImageUrl: string | null;
  sourceUrl: string;
  provider: ScrapeProvider;
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
