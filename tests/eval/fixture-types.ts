import type { CurrencyCode } from "@/lib/currency";
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
  /**
   * Any ranked candidate counts as a match, bypassing MATCH_CONFIDENCE_MIN —
   * for products with no true AliExpress equivalent (e.g. sourced from
   * Alibaba) where a weak match is still the correct "found" outcome.
   */
  acceptLowConfidence?: boolean;
  /**
   * Excludes this fixture's supplier-match result from the eval's pass/fail
   * gate. Use only when the fixture's captured data is known-stale or
   * missing (blocked on a live re-capture), never to hide a real regression.
   * Still evaluated and reported — just not counted toward exit code.
   */
  blockedOnFixtureData?: boolean;
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
  /** Native price + currency as printed. Optional: fixtures captured before
   *  currency-aware extraction carry only the USD value. */
  detectedStorePriceNative?: number | null;
  detectedStorePriceCurrency?: CurrencyCode | null;
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
