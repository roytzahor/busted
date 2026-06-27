import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export type MatchQuality = "high" | "medium" | "low" | "none";

export interface MatchConfidence {
  score: number;
  quality: MatchQuality;
  titleOverlap: number;
  priceRatio: number | null;
  priceVerdict: "plausible_markup" | "no_markup" | "absurd" | "unknown";
  reasons: string[];
  imageMatchScore?: number;
  imageMatchSameFunction?: boolean;
  imageMatchReasoning?: string;
  variantScore?: number;
  variantHardMismatch?: boolean;
  variantMatchReasons?: string[];
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "your", "our", "new", "best", "free",
  "sale", "shop", "buy", "get", "off", "premium", "quality", "original",
  "official", "set", "pcs", "pack", "kit", "unit", "size", "color", "type",
  "style", "edition", "ultra", "pro", "max", "mini", "high", "low",
]);

function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// A consumer dropship/AliExpress item priced above this is almost certainly a
// price-parse error (e.g. an "$18,163,911" olive-oil extractor) — never a real
// match. Hard upper bound, independent of the store price.
const MAX_PLAUSIBLE_SUPPLIER_PRICE_USD = 5000;

// How much pricier than the store a candidate may be before we treat it as the
// wrong product. AliExpress is meant to be the cheaper source; a candidate that
// costs 8×+ the store can't be it (and best-effort "similar" items that far off
// are noise too).
const MAX_SUPPLIER_OVER_STORE_RATIO = 8;

function classifyPriceRatio(
  storePrice: number | null,
  candidatePrice: number,
): { ratio: number | null; verdict: MatchConfidence["priceVerdict"] } {
  if (candidatePrice <= 0 || candidatePrice > MAX_PLAUSIBLE_SUPPLIER_PRICE_USD) {
    // Zero/negative or absurdly large price → parse error, reject outright.
    return {
      ratio: storePrice && storePrice > 0 ? storePrice / candidatePrice : null,
      verdict: "absurd",
    };
  }
  if (storePrice === null || storePrice <= 0) {
    return { ratio: null, verdict: "unknown" };
  }
  const ratio = storePrice / candidatePrice;
  if (candidatePrice > storePrice * MAX_SUPPLIER_OVER_STORE_RATIO) {
    // Supplier dramatically pricier than the store → can't be the cheaper
    // source; almost certainly the wrong product.
    return { ratio, verdict: "absurd" };
  }
  if (ratio < 1.0) {
    // Store is cheaper than candidate? That's not a markup scenario.
    return { ratio, verdict: "no_markup" };
  }
  if (ratio > 50) {
    // 50x markup is implausible — almost certainly wrong product
    return { ratio, verdict: "absurd" };
  }
  return { ratio, verdict: "plausible_markup" };
}

function scoreToQuality(score: number): MatchQuality {
  if (score >= 0.65) return "high";
  if (score >= 0.4) return "medium";
  if (score >= 0.2) return "low";
  return "none";
}

export function computeMatchConfidence(
  scrapedAttrs: ScrapedProductAttributes,
  storePriceUsd: number | null,
  candidate: AliExpressProductCandidate,
  /**
   * Extra descriptive terms (AI productCategory + functional keywords) folded
   * into the scraped token set. Brand-name-only titles like "Bleesse" share no
   * tokens with a generic AliExpress listing; adding "menstrual heating pad
   * period massager" lets the overlap actually fire. Optional + backward-safe.
   */
  extraMatchTerms?: string,
): MatchConfidence {
  const reasons: string[] = [];

  // Use translated title when available so non-Latin (Hebrew/Arabic/CJK) scrapes
  // produce meaningful Jaccard overlap against English AliExpress candidate titles.
  const effectiveTitle = scrapedAttrs.translatedTitle ?? scrapedAttrs.title;
  const matchText = extraMatchTerms?.trim()
    ? `${effectiveTitle} ${extraMatchTerms}`
    : effectiveTitle;
  const scrapedTokens = normalizeTokens(matchText);
  const candidateTokens = normalizeTokens(candidate.title);
  const titleOverlap = jaccard(scrapedTokens, candidateTokens);

  if (titleOverlap >= 0.4) {
    reasons.push(`Strong title overlap (${(titleOverlap * 100).toFixed(0)}%)`);
  } else if (titleOverlap >= 0.2) {
    reasons.push(`Moderate title overlap (${(titleOverlap * 100).toFixed(0)}%)`);
  } else {
    reasons.push(`Weak title overlap (${(titleOverlap * 100).toFixed(0)}%)`);
  }

  const { ratio, verdict } = classifyPriceRatio(storePriceUsd, candidate.priceUsd);

  let priceScore = 0;
  if (verdict === "plausible_markup" && ratio !== null) {
    // sweet spot for dropship markup is 3-15x; score higher for that range
    if (ratio >= 3 && ratio <= 15) {
      priceScore = 1;
      reasons.push(`Plausible markup ratio (${ratio.toFixed(1)}×)`);
    } else if (ratio >= 1.5 && ratio < 3) {
      priceScore = 0.6;
      reasons.push(`Small markup ratio (${ratio.toFixed(1)}×)`);
    } else if (ratio > 15 && ratio <= 50) {
      priceScore = 0.5;
      reasons.push(`Very high markup ratio (${ratio.toFixed(1)}×) — could be wrong product`);
    } else {
      priceScore = 0.4;
    }
  } else if (verdict === "no_markup") {
    priceScore = 0.2;
    reasons.push("Store price is not higher than supplier — unlikely match");
  } else if (verdict === "absurd") {
    priceScore = 0;
    reasons.push(`Absurd price ratio (${ratio?.toFixed(1)}×) — rejecting`);
  } else {
    // unknown — no store price; cannot judge from price
    priceScore = 0.5;
  }

  // Trust boost from order count + rating (high-volume listings are usually real products)
  let trustScore = 0;
  if (candidate.orderCount >= 500) trustScore += 0.5;
  else if (candidate.orderCount >= 100) trustScore += 0.3;
  if (candidate.sellerRating >= 4.5) trustScore += 0.5;
  else if (candidate.sellerRating >= 4.0) trustScore += 0.25;
  trustScore = Math.min(1, trustScore);

  // Final weighted score
  // Title overlap is the strongest signal — getting the right *product*
  // matters more than markup ratio (which can still be valid at unusual values).
  let finalScore =
    titleOverlap * 0.55 + priceScore * 0.3 + trustScore * 0.15;
  finalScore = Math.max(0, Math.min(1, finalScore));

  if (verdict === "absurd") {
    // Hard clamp: a parse-error / wrong-product price must not be rescued by
    // title overlap. Push below BEST_EFFORT_FLOOR so the candidate is suppressed
    // rather than surfaced as a "closest match".
    finalScore = Math.min(finalScore, 0.1);
  }

  return {
    score: finalScore,
    quality: scoreToQuality(finalScore),
    titleOverlap,
    priceRatio: ratio,
    priceVerdict: verdict,
    reasons,
  };
}

export const MATCH_CONFIDENCE_MIN = 0.4;

/**
 * Below this score we don't even surface a best-effort "closest match" — the
 * candidate is noise (wrong product / absurd price). find-supplier soft-skips
 * instead, so the route shows no supplier rather than a misleading one.
 */
export const BEST_EFFORT_FLOOR = 0.2;
export const IMAGE_MATCH_MIN = 0.5;

/**
 * When source has variant info but no SKU on the candidate satisfies it
 * (e.g. wrong size/capacity), clamp the score to this ceiling. Same idea
 * as the `sameFunction=false` clamp in foldImageMatchIntoConfidence.
 */
export const VARIANT_HARD_MISMATCH_CEILING = 0.45;

export interface VariantFolding {
  score: number;
  hardMismatch: boolean;
  reasons: string[];
}

/**
 * Fold a variant match score into an existing confidence. Called after
 * (or instead of) the image fold depending on what signals were available.
 *
 * Weight scheme — variant adds a new dimension so we redistribute:
 *   - Image present:  title 25% · image 50% · variant 25%
 *   - No image:       title 50% · price 25% · trust 0% · variant 25%
 *
 * Trust drops to zero in the no-image-with-variant case because variant
 * matching already proves the listing covers the right SKU; seller volume
 * matters less than getting the right product.
 */
export function foldVariantIntoConfidence(
  base: MatchConfidence,
  variant: VariantFolding,
): MatchConfidence {
  const titleScore = base.titleOverlap;
  let priceScore = 0;
  if (base.priceVerdict === "plausible_markup" && base.priceRatio !== null) {
    if (base.priceRatio >= 3 && base.priceRatio <= 15) priceScore = 1;
    else if (base.priceRatio >= 1.5 && base.priceRatio < 3) priceScore = 0.6;
    else if (base.priceRatio > 15 && base.priceRatio <= 50) priceScore = 0.5;
    else priceScore = 0.4;
  } else if (base.priceVerdict === "no_markup") priceScore = 0.2;
  else if (base.priceVerdict === "absurd") priceScore = 0;
  else priceScore = 0.5;

  const hasImage = typeof base.imageMatchScore === "number";

  let folded: number;
  if (hasImage) {
    // Pull image weight down from 55% → 50%, give variant 25%, title 25%.
    folded =
      (base.imageMatchScore ?? 0) * 0.5 +
      titleScore * 0.25 +
      variant.score * 0.25;
  } else {
    folded = titleScore * 0.5 + priceScore * 0.25 + variant.score * 0.25;
  }

  if (variant.hardMismatch) {
    folded = Math.min(folded, VARIANT_HARD_MISMATCH_CEILING);
  }

  const reasons = [...base.reasons];
  if (variant.reasons.length > 0) {
    reasons.push(`Variant: ${variant.reasons.join(", ")}`);
  }
  if (variant.hardMismatch) {
    reasons.push("No matching SKU on candidate — score clamped");
  }

  return {
    ...base,
    score: Math.max(0, Math.min(1, folded)),
    quality:
      folded >= 0.65 ? "high" : folded >= 0.4 ? "medium" : folded >= 0.2 ? "low" : "none",
    reasons,
    variantScore: variant.score,
    variantHardMismatch: variant.hardMismatch,
    variantMatchReasons: variant.reasons,
  };
}

export interface ImageMatchFolding {
  score: number;
  sameFunction: boolean;
  reasoning: string;
}

/**
 * When image AI returns a verdict, fold it into the base text-only confidence.
 * Image weighting dominates because it can see what the title can't.
 *
 * Weights with image present: image 55% · title 25% · price 12% · trust 8%
 * Weights without image:       title 55% · price 30% · trust 15%   (unchanged)
 *
 * If image AI says `sameFunction=false`, we hard-clamp the score regardless
 * of how well the title overlaps. That's the "bottle cap pop vs launcher" case.
 */
export function foldImageMatchIntoConfidence(
  base: MatchConfidence,
  image: ImageMatchFolding,
): MatchConfidence {
  const titleScore = base.titleOverlap;
  let priceScore = 0;
  if (base.priceVerdict === "plausible_markup" && base.priceRatio !== null) {
    if (base.priceRatio >= 3 && base.priceRatio <= 15) priceScore = 1;
    else if (base.priceRatio >= 1.5 && base.priceRatio < 3) priceScore = 0.6;
    else if (base.priceRatio > 15 && base.priceRatio <= 50) priceScore = 0.5;
    else priceScore = 0.4;
  } else if (base.priceVerdict === "no_markup") priceScore = 0.2;
  else if (base.priceVerdict === "absurd") priceScore = 0;
  else priceScore = 0.5;

  // Re-derive trust from base.score working backwards is fragile; use a flat
  // mid-value because image dominates anyway.
  const trustScore = 0.5;

  let folded =
    image.score * 0.55 + titleScore * 0.25 + priceScore * 0.12 + trustScore * 0.08;

  if (!image.sameFunction) {
    folded = Math.min(folded, 0.35);
  }

  const reasons = [...base.reasons];
  reasons.push(`Image AI: ${image.reasoning} (score ${(image.score * 100).toFixed(0)}%)`);
  if (!image.sameFunction) {
    reasons.push("Image AI flagged different function — score clamped");
  }

  return {
    ...base,
    score: Math.max(0, Math.min(1, folded)),
    quality:
      folded >= 0.65 ? "high" : folded >= 0.4 ? "medium" : folded >= 0.2 ? "low" : "none",
    reasons,
    imageMatchScore: image.score,
    imageMatchSameFunction: image.sameFunction,
    imageMatchReasoning: image.reasoning,
  };
}
