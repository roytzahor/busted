import {
  mapAnalyzeResponseToComparison,
  type AnalyzeClientResult,
} from "@/lib/analyze/map-response";
import { isSupplierMarketplaceUrl } from "@/lib/scraping/detect-source";
import type { AnalyzeResponse } from "@/lib/types/analyze";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

export interface AnalyzeProgress {
  step: string;
  progress: number;
}

const PROGRESS_STEPS = [
  "Checking 7-day cache…",
  "Scraping product page…",
  "Running AI dropship detection…",
  "Saving results to database…",
] as const;

export function validateProductUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Paste a product link to get started.";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Enter a valid product URL (must start with http:// or https://).";
    }
  } catch {
    return "Enter a valid product URL (must start with http:// or https://).";
  }

  return null;
}

export function getProductUrlHint(url: string): string | null {
  if (isSupplierMarketplaceUrl(url)) {
    return "This is a supplier marketplace link. Paste the retail store URL (Shopify, etc.) where you saw a markup to detect dropshipping.";
  }
  return null;
}

async function simulateProgress(
  onProgress?: (progress: AnalyzeProgress) => void,
): Promise<void> {
  for (let index = 0; index < PROGRESS_STEPS.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    onProgress?.({
      step: PROGRESS_STEPS[index],
      progress: Math.round(((index + 1) / PROGRESS_STEPS.length) * 100),
    });
  }
}

export async function analyzeProductUrl(
  url: string,
  options?: {
    debug?: boolean;
    forceRefresh?: boolean;
    onProgress?: (progress: AnalyzeProgress) => void;
  },
): Promise<AnalyzeClientResult> {
  const validationError = validateProductUrl(url);
  if (validationError) {
    throw new Error(validationError);
  }

  const progressPromise = simulateProgress(options?.onProgress);

  const fetchPromise = fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.trim(),
      debug: options?.debug ?? true,
      forceRefresh: options?.forceRefresh ?? false,
    }),
  });

  const [, response] = await Promise.all([progressPromise, fetchPromise]);

  const cacheHeader = response.headers.get("X-Cache");
  const payload = (await response.json()) as AnalyzeResponse & {
    debug?: AnalyzeDebugInfo;
  };

  if (!response.ok || payload.status === "error") {
    const message =
      payload.status === "error"
        ? payload.message
        : "Analysis request failed.";
    const error = new Error(message) as Error & { debug?: AnalyzeDebugInfo };
    if (payload.status === "error" && payload.debug) {
      error.debug = payload.debug;
    }
    throw error;
  }

  const mapped = mapAnalyzeResponseToComparison(payload);
  if (!mapped) {
    throw new Error("Unexpected analyze response shape.");
  }

  if (cacheHeader === "HIT" && mapped.comparison) {
    mapped.comparison.cache = "HIT";
  }
  if (cacheHeader === "HIT" && mapped.dropshipAnalysis) {
    mapped.dropshipAnalysis.cache = "HIT";
  }

  return mapped;
}

export type { AnalyzeClientResult };
