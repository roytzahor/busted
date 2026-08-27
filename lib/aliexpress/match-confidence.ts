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

/**
 * Lightweight, conservative English plural->singular stemmer. Exists because
 * title-overlap Jaccard treats "Bracelets" and "bracelet" as two unrelated
 * tokens — measured on a real fixture (real-smartjewelry-charms): the correct
 * candidate is a genuine TOTWOO-branded match ("...Touch Bracelets for
 * Couples...") that missed MATCH_CONFIDENCE_MIN by 0.022, partly because
 * "bracelets"/"couples" (candidate) never matched "bracelet"/"couple"
 * (scraped, singular) in the token sets.
 *
 * Deliberately NOT a real stemmer (Porter etc.) — just a few suffix rules
 * that cover the overwhelming majority of real product-title plurals
 * (verified against every -s-ending token across the full fixture corpus:
 * bracelets, couples, earrings, necklaces, accessories, batteries, watches,
 * boxes, ...). See IE_PLURAL_EXCEPTIONS and the "zes" comment below for two
 * silent-trailing-"e" cases ("hoodies", "sizes") that need special handling
 * — "sizes" matters specifically because STOP_WORDS contains the literal
 * "size", so a wrong stem there silently escapes that filter.
 *
 * Known, accepted limitations — every one of these is a false NEGATIVE (a
 * missed or imperfect stem on an already-rare word), never a false
 * POSITIVE, which is consistent with this codebase's priority: false
 * positives are the damaging failure mode, not missed matches.
 *   - A handful of native "-as"/"-us" words that aren't plurals at all get
 *     over-stemmed (canvas->canva, atlas->atla) since English spelling can't
 *     distinguish them from genuine "-a"-noun plurals (cameras->camera,
 *     pizzas->pizza) without a dictionary.
 *   - "series"/"species"-class words stem to "sery"/"specy" — true stemmers
 *     special-case them; not worth the complexity here.
 *   - True double-consonant "-es" plurals not native to "-e" (buzz->buzzes,
 *     quiz->quizzes) lose their doubled consonant (buzze, quizze) as the
 *     trade-off for fixing size/prize/maze above — see the "zes" comment
 *     below for why both can't be right with a suffix-only rule.
 *   - IE_PLURAL_EXCEPTIONS is a hardcoded list, not exhaustive — a native
 *     "-ie" noun not on it still mis-stems the old way.
 */
// Common English nouns that natively end in "-ie" and just add "s" to
// pluralize (hoodie->hoodies), NOT the consonant+"y"->"ies" pattern
// (category->categories) the general -ies rule below assumes. Without this
// exception, "hoodies" (a very common word in a dropship apparel catalog)
// wrongly stems to "hoody" instead of "hoodie", and a candidate titled plain
// "Hoodie" — which never matches "s", so it's untouched — never intersects
// with it. Not exhaustive; add to this set on a confirmed real miss rather
// than guessing further entries.
const IE_PLURAL_EXCEPTIONS = new Set([
  "hoodies", "movies", "cookies", "selfies", "zombies", "beanies",
  "onesies", "veggies", "goodies", "rookies", "smoothies", "brownies",
  "genies", "calories",
]);

function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (IE_PLURAL_EXCEPTIONS.has(token)) return token.slice(0, -1);
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  // "zes" deliberately excluded from this group: it's correct for a true
  // consonant+"es" plural (buzz->buzzes) but WRONG for a word that already
  // ends in silent "e" before "z" and just adds "s" (size->sizes,
  // prize->prizes, maze->mazes) — English spelling can't tell these apart
  // without a dictionary. Falling through to the general single-"s"-strip
  // rule below gets size/prize/maze right (the common e-commerce case:
  // "available in multiple sizes") at the cost of buzz/quiz-style words
  // losing their double consonant (buzzes->buzze) — a false NEGATIVE
  // (harmless missed stem on an already-rare-in-product-titles word), never
  // a false positive, and specifically important because STOP_WORDS
  // contains the literal "size": a wrong 2-char strip previously produced
  // "siz", which is NOT a stopword and silently escaped that filter.
  if (/(?:ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2);
  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .map(singularize)
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

/**
 * Shared identity floor for every scorer that can produce a MatchConfidence.
 *
 * Both fold functions below rebuild their score from base.titleOverlap and a
 * freshly-recomputed priceScore rather than reusing base.score — necessarily,
 * since folding a NEW signal (image/variant) into the weights means the old
 * weighted sum isn't valid input. That rebuild silently DISCARDS any clamp
 * applied only inside computeMatchConfidence: a candidate clamped to 0.1 for
 * zero title overlap can still reach a folded score of 0.5 (variant fold:
 * 0*0.5 + 1*0.25(price) + 1*0.25(matched SKU)) or 0.435 (image fold: even the
 * MINIMUM admissible image.score of IMAGE_MATCH_MIN=0.5 with sameFunction=true
 * gives 0.55*0.5 + 0*0.25 + 1*0.12 + 0.5*0.08 = 0.435) — both clear
 * MATCH_CONFIDENCE_MIN (0.4) on a title with NOTHING in common with the
 * source, reproducing the exact bug this floor exists to prevent, just
 * routed through a different pair of signals. There is no candidate whose
 * title shares zero tokens with the source that any amount of price, trust,
 * variant, or image evidence should be allowed to rescue past this floor —
 * apply this at every place a MatchConfidence.score is computed, not only
 * the first one.
 *
 * Also carries the `absurd`-price floor for the same reason: neither fold
 * function checks priceVerdict today, so a parse-error/wrong-magnitude price
 * had the identical bypass even before the zero-overlap case existed.
 */
const IDENTITY_CLAMP_CEILING = 0.1;

function applyIdentityClamps(
  score: number,
  base: Pick<MatchConfidence, "titleOverlap" | "priceVerdict">,
): number {
  if (base.priceVerdict === "absurd" || base.titleOverlap === 0) {
    return Math.min(score, IDENTITY_CLAMP_CEILING);
  }
  return score;
}

/**
 * The single choke point every score-producing path in this file must go
 * through. Before this existed, applyIdentityClamps() was called from three
 * separate sites and scoreToQuality()'s score->quality mapping was
 * duplicated inline (not called) in both fold functions — two independently
 * re-synced invariants, which is exactly how the fold functions ended up
 * omitting the identity clamp entirely for a while. A hypothetical fourth
 * scorer added to this file gets both invariants for free just by calling
 * this, instead of needing to remember two separate rules.
 *
 * Also fixes a latent (currently harmless, since every clamp ceiling here is
 * already within [0,1]) inconsistency: the fold functions previously derived
 * `quality` from the score BEFORE the final [0,1] clamp while `score` used
 * the clamped value, so they could theoretically disagree. quality is now
 * always derived from the exact score returned.
 */
function finalizeMatchConfidence(
  rawScore: number,
  base: Pick<MatchConfidence, "titleOverlap" | "priceVerdict">,
): { score: number; quality: MatchQuality } {
  const score = Math.max(0, Math.min(1, applyIdentityClamps(rawScore, base)));
  return { score, quality: scoreToQuality(score) };
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
  const rawScore = titleOverlap * 0.55 + priceScore * 0.3 + trustScore * 0.15;
  const { score, quality } = finalizeMatchConfidence(rawScore, { titleOverlap, priceVerdict: verdict });

  return {
    score,
    quality,
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
  const { score, quality } = finalizeMatchConfidence(folded, base);

  const reasons = [...base.reasons];
  if (variant.reasons.length > 0) {
    reasons.push(`Variant: ${variant.reasons.join(", ")}`);
  }
  if (variant.hardMismatch) {
    reasons.push("No matching SKU on candidate — score clamped");
  }

  return {
    ...base,
    score,
    quality,
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
  const { score, quality } = finalizeMatchConfidence(folded, base);

  const reasons = [...base.reasons];
  reasons.push(`Image AI: ${image.reasoning} (score ${(image.score * 100).toFixed(0)}%)`);
  if (!image.sameFunction) {
    reasons.push("Image AI flagged different function — score clamped");
  }

  return {
    ...base,
    score,
    quality,
    reasons,
    imageMatchScore: image.score,
    imageMatchSameFunction: image.sameFunction,
    imageMatchReasoning: image.reasoning,
  };
}
