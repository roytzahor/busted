import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ScrapeMetadata, ScrapedProductAttributes } from "@/lib/scraping/types";

export interface AnalyzeDebugScrape {
  provider: string;
  normalizedUrl: string;
  metadata: ScrapeMetadata;
  attributes: ScrapedProductAttributes;
  detectedStorePriceUsd: number | null;
  storeName: string;
  markdownPreview: string;
  markdownLength: number;
}

export interface AnalyzeDebugAi {
  provider: string;
  model: string;
  prediction: DropshipPrediction | null;
  rawResponse: string;
  error: string | null;
}

export interface AnalyzeDebugSupplier {
  keywords: string;
  provider: "aliexpress_api" | "firecrawl_scrape";
  candidateCount: number;
  winnerProductId: string;
  winnerTitle: string;
  winnerPriceUsd: number;
  affiliateProvider: "aliexpress_api" | "admitad" | "direct";
  affiliateLinkValidated: boolean;
}

export interface PipelineWaterfallEntry {
  atMs: number;
  stage: "cache" | "scrape" | "ai" | "supplier" | "persist";
  message: string;
  status: "complete" | "skipped" | "error" | "pending";
}

export interface AnalyzeDebugInfo {
  scrape: AnalyzeDebugScrape;
  ai: AnalyzeDebugAi;
  supplier?: AnalyzeDebugSupplier;
  waterfall?: PipelineWaterfallEntry[];
  pipeline: {
    cacheStatus: "HIT" | "MISS";
    steps: string[];
  };
}
