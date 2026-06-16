import type { RawScrapeResult, ScrapedProductAttributes } from "@/lib/scraping/types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";

export type FixtureCategory =
  | "dropship_obvious"
  | "dropship_subtle"
  | "legit_brand"
  | "not_a_product"
  | "aliexpress_itself";

export type ExpectedVerdict =
  | "dropship"
  | "legit"
  | "insufficient_evidence"
  | "not_a_product";

export interface ExpectedSupplier {
  shouldFindMatch: boolean;
  expectedPriceUsdBand?: [number, number];
  notes?: string;
}

export interface FixtureTruth {
  url: string;
  category: FixtureCategory;
  expectedVerdict: ExpectedVerdict;
  confidenceMin?: number;
  confidenceMax?: number;
  expectedSupplier: ExpectedSupplier;
  expectedSavingsPercentBand?: [number, number];
  notes?: string;
  capturedAt?: string;
}

export interface FixtureScrape {
  raw: RawScrapeResult;
  attributes: ScrapedProductAttributes;
  detectedStorePriceUsd: number | null;
  storeName: string | null;
}

export interface FixtureAiResponse {
  prediction: DropshipPrediction | null;
  rawResponse: string;
  model: string;
  provider: string;
  error: string | null;
}

export interface FixtureAliExpress {
  keywords: string;
  candidates: AliExpressProductCandidate[];
  provider: "aliexpress_api" | "firecrawl_scrape";
}

export interface FixtureRecord {
  id: string;
  truth: FixtureTruth;
  scrape: FixtureScrape;
  aiResponse?: FixtureAiResponse;
  aliexpress?: FixtureAliExpress;
}
