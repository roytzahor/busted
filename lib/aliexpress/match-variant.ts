import type { ScrapedProductVariant } from "@/lib/scraping/types";
import type {
  AliExpressProductDetail,
  AliExpressSku,
} from "@/lib/aliexpress/sku";

export interface VariantMatchResult {
  matchedSku: AliExpressSku | null;
  variantPriceUsd: number | null;
  /**
   * `priceUsd + shippingCostUsd` when shipping cost is known; otherwise
   * just `priceUsd`. The matcher ranks by this value among local candidates.
   */
  totalCostUsd: number | null;
  warehouseCountry: string | null;
  shippingDays: number | null;
  /**
   * 0..1. Reflects how confidently the source variant maps to a candidate SKU.
   * 0 = no variant info available (or no SKU table). 1 = exact match on all
   * source-specified dimensions.
   */
  variantConfidence: number;
  matchReasons: string[];
  /**
   * True when the source variant specified a constraint that no candidate
   * SKU satisfies (e.g. source wants "256 GB", candidate only offers 64/128).
   * Triggers the soft-clamp in match-confidence.ts.
   */
  hardMismatch: boolean;
}

const EMPTY_RESULT: VariantMatchResult = {
  matchedSku: null,
  variantPriceUsd: null,
  totalCostUsd: null,
  warehouseCountry: null,
  shippingDays: null,
  variantConfidence: 0,
  matchReasons: [],
  hardMismatch: false,
};

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string): Set<string> {
  return new Set(
    normalizeForCompare(value)
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function softMatchScore(source: string, candidate: string): number {
  const a = normalizeForCompare(source);
  const b = normalizeForCompare(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  return jaccard(tokensOf(a), tokensOf(b));
}

/**
 * Capacity / size with units (e.g. "256GB", "10ml", "M") need exact
 * normalisation. Returns null when the strings can't be reduced to a
 * comparable form.
 */
function normalizeUnitValue(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/\s+/g, "").trim();
  // Try to pull "<number><unit>" or single-letter sizes
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/);
  if (numMatch) {
    const num = Number.parseFloat(numMatch[1]);
    const unit = numMatch[2] ?? "";
    return `${num}${unit}`;
  }
  if (/^[a-z]{1,4}$/.test(cleaned)) return cleaned;
  return null;
}

function scoreCapacityOrSize(
  source: string,
  candidate: string,
): { score: number; exact: boolean } {
  const a = normalizeUnitValue(source);
  const b = normalizeUnitValue(candidate);
  if (a && b) {
    if (a === b) return { score: 1, exact: true };
    // Different units or different values → mismatch
    return { score: 0, exact: false };
  }
  // Fallback to soft text match
  const score = softMatchScore(source, candidate);
  return { score, exact: score >= 0.9 };
}

interface DimensionScore {
  name: string;
  score: number;
  exact: boolean;
}

function scoreSkuAgainstSource(
  source: ScrapedProductVariant,
  sku: AliExpressSku,
): { totalScore: number; dimensionCount: number; dimensions: DimensionScore[] } {
  const dimensions: DimensionScore[] = [];

  if (source.color && sku.attrs.color) {
    const score = softMatchScore(source.color, sku.attrs.color);
    dimensions.push({ name: "color", score, exact: score >= 0.9 });
  }
  if (source.size && sku.attrs.size) {
    const { score, exact } = scoreCapacityOrSize(source.size, sku.attrs.size);
    dimensions.push({ name: "size", score, exact });
  }
  if (source.capacity && sku.attrs.capacity) {
    const { score, exact } = scoreCapacityOrSize(
      source.capacity,
      sku.attrs.capacity,
    );
    dimensions.push({ name: "capacity", score, exact });
  }
  if (source.material && sku.attrs.material) {
    const score = softMatchScore(source.material, sku.attrs.material);
    dimensions.push({ name: "material", score, exact: score >= 0.9 });
  }

  if (dimensions.length === 0) {
    return { totalScore: 0, dimensionCount: 0, dimensions };
  }

  const totalScore =
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
  return { totalScore, dimensionCount: dimensions.length, dimensions };
}

function listSpecifiedDimensions(source: ScrapedProductVariant): string[] {
  const dims: string[] = [];
  if (source.color) dims.push("color");
  if (source.size) dims.push("size");
  if (source.capacity) dims.push("capacity");
  if (source.material) dims.push("material");
  return dims;
}

/**
 * Given a source variant (from the store) and a candidate's SKU table,
 * pick the SKU that best matches and return its price + warehouse.
 *
 * Behaviour matrix:
 *   - No source variant signals      → confidence 0, no SKU selected (no signal to score)
 *   - No SKU table on candidate      → confidence 0, no SKU selected
 *   - Source matches a SKU exactly   → confidence 1, hardMismatch false
 *   - Source partially matches       → confidence in (0, 1), hardMismatch false
 *   - Source can't match any SKU on a hard dimension (size/capacity)
 *                                    → best partial match returned with hardMismatch=true
 *                                      so the caller can soft-clamp the final score
 */
export function matchVariantToSku(
  source: ScrapedProductVariant | undefined,
  detail: AliExpressProductDetail | null,
): VariantMatchResult {
  if (!source || !detail || detail.skus.length === 0) {
    return EMPTY_RESULT;
  }

  const specified = listSpecifiedDimensions(source);
  if (specified.length === 0) {
    return EMPTY_RESULT;
  }

  let best: {
    sku: AliExpressSku;
    score: number;
    dimensions: DimensionScore[];
  } | null = null;

  for (const sku of detail.skus) {
    const { totalScore, dimensionCount, dimensions } = scoreSkuAgainstSource(
      source,
      sku,
    );
    // Skip SKUs that share no scorable dimension with the source — we don't
    // want a 0-dim SKU to "win" by default.
    if (dimensionCount === 0) continue;
    if (!best || totalScore > best.score) {
      best = { sku, score: totalScore, dimensions };
    }
  }

  if (!best) {
    // Source has variant info but no SKU exposed any matching dimension.
    // Treat as hard mismatch — the listing has variants but none align with
    // what the store sold.
    return { ...EMPTY_RESULT, hardMismatch: true };
  }

  // Hard mismatch: a size or capacity dimension scored 0 (different values).
  const hardMismatch = best.dimensions.some(
    (d) => (d.name === "size" || d.name === "capacity") && d.score === 0,
  );

  const reasons: string[] = [];
  for (const d of best.dimensions) {
    const label = d.exact ? "exact" : `${(d.score * 100).toFixed(0)}%`;
    reasons.push(`${d.name}: ${label}`);
  }
  if (hardMismatch) {
    reasons.push("Hard mismatch on size/capacity — no SKU fits");
  }

  // Coverage penalty: if the source specified 3 dimensions but only 1 was
  // scorable on the candidate, lower confidence proportionally. Stops a
  // perfect-color match from claiming the SKU when size/capacity were
  // never even compared.
  const coverage = best.dimensions.length / specified.length;
  const variantConfidence = best.score * Math.max(0.5, coverage);

  const totalCostUsd =
    best.sku.shippingCostUsd !== null
      ? best.sku.priceUsd + best.sku.shippingCostUsd
      : best.sku.priceUsd;

  return {
    matchedSku: best.sku,
    variantPriceUsd: best.sku.priceUsd,
    totalCostUsd,
    warehouseCountry: best.sku.warehouseCountry,
    shippingDays: best.sku.shippingDays,
    variantConfidence,
    matchReasons: reasons,
    hardMismatch,
  };
}
