/**
 * Cost model — Sprint 9 Stage 15.
 *
 * Pure function. No I/O. No imports from prisma/server runtime. Safe to use
 * in client components (the monitoring waterfall mounts it directly).
 *
 * The numbers below are best-effort estimates per call, refined from
 * provider docs and our own usage tier. Refresh quarterly against real bills.
 *
 *   crawlbase           $0.001    per JS-rendered fetch (the "JS rendering" tier)
 *   firecrawl-scrape    $0.0015   per page  (Firecrawl standard pricing)
 *   gemini-vision       $0.00012  per image+text round-trip (Gemini 3 Flash, ~1024px)
 *   gemini-flash-text   $0.00005  per text-only call (verdict / identifier)
 *   ae-keyword-search   $0        free within affiliate-API quota
 *   ae-smartmatch       $0        free within affiliate-API quota
 *   ae-product-detail   $0        free within affiliate-API quota
 *   admitad-link        $0        free
 *   neon-query          $0        included in hosting
 *
 * The mapping below is driven by service+stage names from ServiceEvent — when
 * a stage isn't recognised, the cost is 0 (i.e. we never invent fake spend).
 */

export interface CostEstimate {
  /** Estimated USD spent on this stage. */
  usd: number;
  /** Breakdown lines for tooltips ("Crawlbase JS render × 1 = $0.001"). */
  breakdown: string[];
}

interface StageCostLookup {
  /** Bucket label used by the waterfall component for grouping/colouring. */
  bucket: "scrape" | "vision" | "ai-text" | "ae-api" | "cache" | "other";
  /** USD per call. */
  unitUsd: number;
  /** Human-readable line description. */
  label: string;
}

/**
 * service + stage → (bucket, $ per call, label).
 *
 * Stages we don't recognise fall through to the OTHER bucket with $0 cost
 * (we'd rather report no cost than a wrong one).
 */
const STAGE_COSTS: Record<string, StageCostLookup> = {
  "scraper:scrape": {
    bucket: "scrape",
    unitUsd: 0.0015, // Firecrawl-priced (Crawlbase is cheaper but harder to detect at this layer)
    label: "Page fetch",
  },
  "product-identifier:identify": {
    bucket: "ai-text",
    unitUsd: 0.00012,
    label: "Gemini Vision identify",
  },
  "dropship-verdict:verify": {
    bucket: "ai-text",
    unitUsd: 0.00005,
    label: "Gemini text verdict",
  },
  "supplier-match:find": {
    bucket: "ae-api",
    unitUsd: 0, // AE Affiliate API is free within quota
    label: "AliExpress supplier search",
  },
  "affiliate:convert": {
    bucket: "ae-api",
    unitUsd: 0,
    label: "Affiliate link conversion",
  },
  "cache:lookup": {
    bucket: "cache",
    unitUsd: 0,
    label: "Cache lookup",
  },
};

export function bucketColour(bucket: StageCostLookup["bucket"]): string {
  switch (bucket) {
    case "scrape":
      return "bg-blue-400/70";
    case "vision":
      return "bg-amber-300/70";
    case "ai-text":
      return "bg-fuchsia-400/70";
    case "ae-api":
      return "bg-success/70";
    case "cache":
      return "bg-muted-foreground/40";
    default:
      return "bg-muted-foreground/30";
  }
}

export function bucketLabel(bucket: StageCostLookup["bucket"]): string {
  switch (bucket) {
    case "scrape":
      return "Scrape";
    case "vision":
      return "Vision";
    case "ai-text":
      return "AI Text";
    case "ae-api":
      return "AE API";
    case "cache":
      return "Cache";
    default:
      return "Other";
  }
}

export interface ServiceTimingRow {
  service: string;
  status: "ok" | "skip" | "error" | "degraded";
  totalMs: number;
  bucket: ReturnType<typeof bucketForService>;
  cost: CostEstimate;
}

export function bucketForService(service: string): StageCostLookup["bucket"] {
  for (const key of Object.keys(STAGE_COSTS)) {
    if (key.startsWith(`${service}:`)) {
      return STAGE_COSTS[key].bucket;
    }
  }
  return "other";
}

/**
 * Estimate cost for a single service+stage pair.
 *
 * Vision preprocess deserves special handling: when the cleaned image came
 * from the cache, no Gemini call was made and the cost is $0 — caller is
 * responsible for passing `wasCacheHit: true` in that case.
 */
export function estimateStageCost(
  service: string,
  stage: string,
  opts?: { wasCacheHit?: boolean; preprocessAttempted?: boolean },
): CostEstimate {
  const key = `${service}:${stage}`;
  const lookup = STAGE_COSTS[key];

  if (!lookup) {
    return { usd: 0, breakdown: [] };
  }

  if (opts?.wasCacheHit) {
    return {
      usd: 0,
      breakdown: [`${lookup.label} skipped (cache HIT)`],
    };
  }

  return {
    usd: lookup.unitUsd,
    breakdown: [`${lookup.label}: $${lookup.unitUsd.toFixed(5)}`],
  };
}

/**
 * Add Vision preprocess cost on top of the regular service cost when the
 * supplier-match stage actually invoked Gemini.
 */
export function visionPreprocessCost(opts: {
  attempted: boolean;
  cacheHit: boolean;
}): CostEstimate {
  if (!opts.attempted || opts.cacheHit) {
    return {
      usd: 0,
      breakdown: opts.cacheHit ? ["Vision preprocess (cache HIT): $0"] : [],
    };
  }
  return {
    usd: 0.00012,
    breakdown: ["Gemini Vision preprocess: $0.00012"],
  };
}
