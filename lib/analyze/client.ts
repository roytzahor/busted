import {
  mapAnalyzeResponseToComparison,
  type AnalyzeClientResult,
} from "@/lib/analyze/map-response";
import { isSupplierMarketplaceUrl } from "@/lib/scraping/detect-source";
import type { AnalyzeResponse } from "@/lib/types/analyze";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";

// ── Stage 17 — live pipeline stage types ─────────────────────────────────────

export type SSEStageId =
  | "cache-lookup"
  | "scrape"
  | "identify"
  | "verdict"
  | "supplier-search"
  | "persist";

export type SSEStageStatus =
  | "active"
  | "done"
  | "skipped"
  | "error"
  | "hit"
  | "miss";

export interface LiveStageUpdate {
  stage: SSEStageId;
  status: SSEStageStatus;
  message?: string;
}

// Internal SSE event shapes sent by the server
type SSEStageEvent = {
  type: "stage";
  stage: SSEStageId;
  status: SSEStageStatus;
  message?: string;
};
type SSEFinalEvent = { type: "final"; payload: AnalyzeResponse & { debug?: AnalyzeDebugInfo } };
type SSEErrorEvent = { type: "error"; code: string; message: string };
type SSEEventData = SSEStageEvent | SSEFinalEvent | SSEErrorEvent;

// ── Progress (legacy + live) ──────────────────────────────────────────────────

export interface AnalyzeProgress {
  step: string;
  progress: number;
}

// Maps stage → 0-100 progress value (rough approximation for legacy progress bar)
const STAGE_PROGRESS: Record<SSEStageId, number> = {
  "cache-lookup": 10,
  scrape: 30,
  identify: 50,
  verdict: 65,
  "supplier-search": 82,
  persist: 96,
};

const STAGE_STEP_LABEL: Record<SSEStageId, string> = {
  "cache-lookup": "Checking 14-day cache…",
  scrape: "Fetching product page…",
  identify: "Identifying product…",
  verdict: "Running AI dropship check…",
  "supplier-search": "Searching AliExpress…",
  persist: "Saving result…",
};

// ── URL helpers ───────────────────────────────────────────────────────────────

export function validateProductUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Paste a product link to get started.";
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

/**
 * Returns a message-key the caller can pass to t(), or null when no hint
 * applies. Returning a key (not English copy) keeps this lib locale-free.
 */
export type UrlHintKey = "hero.hint.supplier";

export function getProductUrlHintKey(url: string): UrlHintKey | null {
  if (isSupplierMarketplaceUrl(url)) {
    return "hero.hint.supplier";
  }
  return null;
}

// ── Streaming fetch (SSE) ─────────────────────────────────────────────────────

async function streamingFetch(
  url: string,
  opts: { debug: boolean; forceRefresh: boolean },
  onProgress: ((p: AnalyzeProgress) => void) | undefined,
  onStage: ((u: LiveStageUpdate) => void) | undefined,
): Promise<AnalyzeResponse & { debug?: AnalyzeDebugInfo }> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ url: url.trim(), debug: opts.debug, forceRefresh: opts.forceRefresh }),
  });

  if (!response.body) throw new Error("Streaming not supported by this browser.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: (AnalyzeResponse & { debug?: AnalyzeDebugInfo }) | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE uses "\n\n" as event delimiter
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      let event: SSEEventData;
      try {
        event = JSON.parse(dataLine.slice(6)) as SSEEventData;
      } catch {
        continue;
      }

      if (event.type === "stage") {
        const update: LiveStageUpdate = {
          stage: event.stage,
          status: event.status,
          message: event.message,
        };
        onStage?.(update);
        onProgress?.({
          step: STAGE_STEP_LABEL[event.stage],
          progress: STAGE_PROGRESS[event.stage],
        });
      } else if (event.type === "final") {
        finalPayload = event.payload;
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }

  if (!finalPayload) throw new Error("No response received from server.");
  return finalPayload;
}

// ── Legacy simulated progress (fallback when SSE fails) ───────────────────────

const PROGRESS_STEPS = [
  "Checking cache…",
  "Scraping product page…",
  "Running AI dropship detection…",
  "Saving results to database…",
] as const;

async function simulateProgress(onProgress?: (p: AnalyzeProgress) => void): Promise<void> {
  for (let i = 0; i < PROGRESS_STEPS.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    onProgress?.({ step: PROGRESS_STEPS[i], progress: Math.round(((i + 1) / PROGRESS_STEPS.length) * 100) });
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeProductUrl(
  url: string,
  options?: {
    debug?: boolean;
    forceRefresh?: boolean;
    onProgress?: (progress: AnalyzeProgress) => void;
    /** Stage 17: called as each pipeline stage transitions. */
    onStage?: (update: LiveStageUpdate) => void;
  },
): Promise<AnalyzeClientResult> {
  const validationError = validateProductUrl(url);
  if (validationError) throw new Error(validationError);

  const debug = options?.debug ?? true;
  const forceRefresh = options?.forceRefresh ?? false;

  let payload: AnalyzeResponse & { debug?: AnalyzeDebugInfo };
  let cacheHeader: string | null = null;

  // Use SSE streaming when the browser supports ReadableStream (universally true now)
  if (typeof ReadableStream !== "undefined") {
    try {
      payload = await streamingFetch(
        url,
        { debug, forceRefresh },
        options?.onProgress,
        options?.onStage,
      );
      // X-Cache is embedded in the final payload for SSE (server sets cache field)
    } catch (err) {
      // SSE failed mid-stream → propagate
      const error = err instanceof Error ? err : new Error("Analysis failed.");
      throw error;
    }
  } else {
    // Fallback: legacy fetch + simulated progress
    const [, response] = await Promise.all([
      simulateProgress(options?.onProgress),
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), debug, forceRefresh }),
      }),
    ]);
    cacheHeader = response.headers.get("X-Cache");
    payload = (await response.json()) as AnalyzeResponse & { debug?: AnalyzeDebugInfo };
  }

  if (payload.status === "error") {
    const error = new Error(payload.message) as Error & { debug?: AnalyzeDebugInfo };
    if (payload.debug) error.debug = payload.debug;
    throw error;
  }

  const mapped = mapAnalyzeResponseToComparison(payload);
  if (!mapped) throw new Error("Unexpected analyze response shape.");

  const isHit = payload.cache === "HIT" || cacheHeader === "HIT";
  if (isHit && mapped.comparison) mapped.comparison.cache = "HIT";
  if (isHit && mapped.dropshipAnalysis) mapped.dropshipAnalysis.cache = "HIT";

  return mapped;
}

export type { AnalyzeClientResult };
