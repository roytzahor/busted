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
  provider: "aliexpress_api" | "firecrawl_scrape" | "ebay" | "amazon";
  candidateCount: number;
  winnerProductId: string;
  winnerTitle: string;
  winnerPriceUsd: number;
  affiliateProvider: "aliexpress_api" | "admitad" | "direct" | "ebay";
  affiliateLinkValidated: boolean;
  preprocess?: {
    attempted: boolean;
    cacheHit?: boolean;
    durationMs?: number;
    qualityScore?: number;
    lightPromptUsed?: boolean;
  };
  smartmatch?: {
    arm?: "base64" | "url" | "skipped";
    candidateCount?: number;
  };
  categoryVocabMiss?: string;
  // Sprint 9 Stage 14 — structured pipeline signals for /monitoring.
  routing?: {
    shipToCountry?: string;
    targetCurrency?: string;
    categoryVertical?: string;
    categoryIds?: string;
    negativeKeywordsFiltered?: number;
  };
  vision?: {
    ocrTraces?: string[];
    materialTokens?: string[];
    technicalSpecs?: string[];
  };
}

export interface PipelineWaterfallEntry {
  atMs: number;
  stage: "cache" | "scrape" | "ai" | "supplier" | "persist";
  message: string;
  status: "complete" | "skipped" | "error" | "pending";
}

/**
 * Per-service event emitted by the orchestrator. Mirror of ServiceEvent
 * from lib/services/types.ts — duplicated here so debug types stay
 * frontend-safe and don't drag in service internals.
 */
export interface AnalyzeDebugServiceEvent {
  service: string;
  stage: string;
  status: "ok" | "skip" | "error" | "degraded";
  latencyMs: number;
  cacheStatus: "HIT" | "MISS" | "BYPASS";
  message?: string;
  meta?: Record<string, unknown>;
  at: string;
}

export interface AnalyzeDebugInfo {
  scrape: AnalyzeDebugScrape;
  ai: AnalyzeDebugAi;
  supplier?: AnalyzeDebugSupplier;
  waterfall?: PipelineWaterfallEntry[];
  /** Per-service event timeline (Phase 1+ services). */
  serviceEvents?: AnalyzeDebugServiceEvent[];
  pipeline: {
    cacheStatus: "HIT" | "MISS";
    steps: string[];
  };
}
