import { convertToAffiliateLink } from "@/lib/affiliate/convert-link";
import { validateAffiliateLink } from "@/lib/affiliate/validate-link";
import {
  compareProductImagesWithAI,
  isImageMatchEnabled,
} from "@/lib/ai/image-match";
import type { ProductIdentity } from "@/lib/services/types";
import {
  isAliExpressApiConfigured,
  searchAliExpressBySmartMatch,
  searchAliExpressProducts,
  type KeywordSearchOptions,
  type SmartMatchOutcome,
} from "@/lib/aliexpress/api-client";
import {
  RERANK_KEEP_THRESHOLD,
  rerankCandidatesByImage,
} from "@/lib/ai/image-rerank";
import {
  buildCategoryKeywords,
  extractSearchKeywords,
  isThinTitle,
} from "@/lib/aliexpress/keywords";
import {
  IMAGE_MATCH_MIN,
  MATCH_CONFIDENCE_MIN,
  computeMatchConfidence,
  foldImageMatchIntoConfidence,
  foldVariantIntoConfidence,
} from "@/lib/aliexpress/match-confidence";
import { matchVariantToSku, type VariantMatchResult } from "@/lib/aliexpress/match-variant";
import { fetchAliExpressProductDetail } from "@/lib/aliexpress/sku";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
import {
  filterByNegativeKeywords,
  resolveCategoryVocab,
} from "@/lib/aliexpress/category-map";
import { resolveLocaleFromSourceUrl } from "@/lib/aliexpress/locale";
import {
  PreprocessError,
  preprocessForSmartMatch,
} from "@/lib/ai/preprocess-image";
import {
  AliExpressSearchError,
  type SupplierMatchResult,
} from "@/lib/aliexpress/types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import type { AliExpressProductData } from "@/lib/types/analyze";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

const TEXT_SCORE_SKIP_IMAGE_THRESHOLD = 0.85;

// When first-pass text scores are all below this, trigger a category keyword retry.
const RETRY_WITH_CATEGORY_THRESHOLD = 0.35;

// Minimum candidates before we bother with a category-keyword retry.
const RETRY_MIN_CANDIDATES_THRESHOLD = 5;

async function searchCandidates(
  keywords: string,
  provider: "aliexpress_api" | "firecrawl_scrape",
  opts: KeywordSearchOptions = {},
): Promise<AliExpressProductCandidate[]> {
  try {
    return provider === "aliexpress_api"
      ? await searchAliExpressProducts(keywords, opts)
      : await searchAliExpressViaScrape(keywords);
  } catch {
    return [];
  }
}

function mergeAndDeduplicateCandidates(
  primary: AliExpressProductCandidate[],
  secondary: AliExpressProductCandidate[],
): AliExpressProductCandidate[] {
  const seen = new Set(primary.map((c) => c.productId));
  const merged = [...primary];
  for (const c of secondary) {
    if (!seen.has(c.productId)) {
      seen.add(c.productId);
      merged.push(c);
    }
  }
  return merged;
}

async function runImageMatch(
  attributes: ScrapedProductAttributes,
  scored: Array<{ candidate: AliExpressProductCandidate; confidence: ReturnType<typeof computeMatchConfidence> }>,
): Promise<{ bestId: string | null; rejected: boolean; rejectionReason: string | null }> {
  const topForImage = scored.slice(0, Math.min(3, scored.length));
  const imageResult = await compareProductImagesWithAI({
    sourceTitle: attributes.title,
    sourceImageUrl: attributes.mainImageUrl,
    candidates: topForImage.map(({ candidate }) => ({
      id: candidate.productId,
      title: candidate.title,
      imageUrl: candidate.imageUrl,
    })),
  });

  if (!imageResult || imageResult.error) {
    return { bestId: null, rejected: false, rejectionReason: null };
  }

  if (imageResult.bestCandidateId === null || imageResult.bestScore < IMAGE_MATCH_MIN) {
    return {
      bestId: null,
      rejected: true,
      rejectionReason: imageResult.rejectionReason ?? "No candidate visually matched.",
    };
  }

  // Fold image scores into text scores
  const scoreById = new Map(imageResult.scores.map((s) => [s.candidateId, s] as const));
  for (const entry of topForImage) {
    const imgScore = scoreById.get(entry.candidate.productId);
    if (imgScore) {
      entry.confidence = foldImageMatchIntoConfidence(entry.confidence, {
        score: imgScore.score,
        sameFunction: imgScore.sameFunction,
        reasoning: imgScore.reasoning,
      });
    }
  }

  return { bestId: imageResult.bestCandidateId, rejected: false, rejectionReason: null };
}

export async function findAliExpressSupplier(params: {
  attributes: ScrapedProductAttributes;
  storePriceUsd: number | null;
  productCategory?: string;
  aiKeywords?: string[];
  /**
   * Phase 4: vision-grounded canonical identity. When present, its
   * stratified keywords (primary + visualTerms) take priority over
   * title-derived and verdict-derived keywords. When null, falls back
   * to today's behavior (title + aiKeywords).
   */
  identity?: ProductIdentity | null;
}): Promise<SupplierMatchResult> {
  const titleKeywords = extractSearchKeywords(params.attributes.title);
  const thin = isThinTitle(params.attributes.title);

  // Phase 4 keyword precedence:
  //   1. identity.searchKeywords.primary (vision-grounded canonical)
  //   2. identity.searchKeywords.visualTerms (vision-grounded visual)
  //   3. params.aiKeywords (text-only from verdict step — legacy)
  //   4. title-derived (extractSearchKeywords)
  //   5. category fallback
  // Identity keywords come first because they're produced by Gemini Vision
  // looking at the actual product image — they fix the "CapBlast" class of
  // failures where text-only keyword generation returns the wrong product.
  const identityPrimary = params.identity?.searchKeywords.primary
    ?.filter((k) => k.trim().length > 3) ?? [];
  const identityVisual = params.identity?.searchKeywords.visualTerms
    ?.filter((k) => k.trim().length > 3) ?? [];
  const legacyAi = params.aiKeywords?.filter((k) => k.trim().length > 3) ?? [];

  // Merge identity + legacy AI keywords, deduplicating by lowercase.
  // Identity always wins ordering — its first item is the most specific.
  const seenKw = new Set<string>();
  const aiKeywords: string[] = [];
  for (const kw of [...identityPrimary, ...identityVisual, ...legacyAi]) {
    const norm = kw.toLowerCase();
    if (!seenKw.has(norm)) {
      seenKw.add(norm);
      aiKeywords.push(kw);
    }
  }

  // Derive category keywords as a further fallback. Prefer identity's
  // category if available, then fall back to verdict's productCategory.
  const categorySource =
    params.identity?.category ?? params.productCategory ?? null;
  const categoryKeywords =
    categorySource && (thin || aiKeywords.length === 0)
      ? buildCategoryKeywords(params.attributes.title, categorySource)
      : null;

  if (!titleKeywords.trim() && aiKeywords.length === 0 && !categoryKeywords) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_EMPTY_KEYWORDS",
      "Unable to derive search keywords from the scraped product title.",
      422,
    );
  }

  const provider: "aliexpress_api" | "firecrawl_scrape" = isAliExpressApiConfigured()
    ? "aliexpress_api"
    : "firecrawl_scrape";

  // Resolve locale + category vocab before any search so keyword arms use the
  // same geo + category context as the smartmatch arm. Locale is derived from
  // the source-store TLD (co.il → IL/ILS) so all AliExpress price quotes
  // reflect the buyer's actual market, not env-default-US.
  const locale = resolveLocaleFromSourceUrl(params.attributes.sourceUrl);
  const categoryVocab = resolveCategoryVocab(
    params.identity?.category ?? params.productCategory ?? null,
  );

  // Shared options for every keyword search call — locale + category filter +
  // price band. Price band is derived from the source retail price and the
  // vertical's configured floor/ceiling ratios (prevents re-sellers appearing
  // as "the supplier"). Falls back gracefully when storePriceUsd is null.
  const keywordOpts: KeywordSearchOptions = {
    shipToCountry: locale.shipToCountry,
    targetCurrency: locale.targetCurrency,
    categoryIds: categoryVocab?.categoryIds.join(","),
    sortStrategy: categoryVocab?.defaultSort,
    minSalePrice:
      categoryVocab && params.storePriceUsd != null
        ? +(params.storePriceUsd * categoryVocab.priceFloorRatio).toFixed(2)
        : undefined,
    maxSalePrice:
      categoryVocab && params.storePriceUsd != null
        ? +(params.storePriceUsd * categoryVocab.priceCeilRatio).toFixed(2)
        : undefined,
  };

  // Search strategy — run in priority order and merge pools:
  // 1. AI functional keywords (most descriptive of what the product does)
  // 2. Title-derived keywords (good when title is descriptive)
  // 3. Category keywords (last-resort fallback for thin titles)
  let candidates: AliExpressProductCandidate[] = [];
  const keywordsUsed: string[] = [];

  // AI keywords — search the first two independently and merge
  for (const kw of aiKeywords.slice(0, 2)) {
    const results = await searchCandidates(kw, provider, keywordOpts);
    if (results.length > 0) {
      candidates = mergeAndDeduplicateCandidates(candidates, results);
      keywordsUsed.push(kw);
    }
  }

  // Title keywords — always add unless title is a near-empty brand slug
  if (titleKeywords.trim()) {
    const titleResults = await searchCandidates(titleKeywords, provider, keywordOpts);
    candidates = mergeAndDeduplicateCandidates(candidates, titleResults);
    if (titleResults.length > 0) keywordsUsed.push(titleKeywords);
  }

  // Category keywords — add when title was thin or pool is still small
  if (categoryKeywords && (thin || candidates.length < RETRY_MIN_CANDIDATES_THRESHOLD)) {
    const categoryResults = await searchCandidates(categoryKeywords, provider, keywordOpts);
    candidates = mergeAndDeduplicateCandidates(candidates, categoryResults);
    if (categoryResults.length > 0) keywordsUsed.push(categoryKeywords);
  }

  // Phase 5: smartmatch arm — image-based AliExpress search.
  // Best-effort: requires API tier access, returns null on any failure.
  // Worth trying because it catches visually-similar products that text
  // keywords miss entirely. Only attempted when API is configured AND we
  // have a hostable source image URL.
  //
  // Phase 7 upgrade: we run the source image through Gemini Vision
  // preprocess first (tight crop, white BG, brand-text inpaint) and ship
  // the cleaned bytes via `image_base64`. This removes the brand-wordmark
  // anchor that pollutes raw consumer photos and the white-BG normalisation
  // aligns our hash to the catalog distribution.
  //
  // Stage 7 tracking: capture preprocess + smartmatch outcome for A/B analysis.
  // These flow into searchMeta so they're visible in debug output and
  // persisted in the stage cache for offline analysis.

  // Tracking state — initialised to "skipped" and overwritten if we enter the block.
  let preprocessAttempted = false;
  let preprocessCacheHit = false;
  let preprocessDurationMs = 0;
  let smartmatchArm: SmartMatchOutcome["armUsed"] | "skipped" = "skipped";
  let smartmatchCandidateCount = 0;

  if (
    provider === "aliexpress_api" &&
    params.attributes.mainImageUrl &&
    candidates.length < 30
  ) {
    const mainImageUrl = params.attributes.mainImageUrl;
    const categoryForPrompt =
      categoryVocab?.vertical ??
      params.identity?.category ??
      params.productCategory ??
      "product";

    let cleanedBase64: string | undefined;
    let cleanedFormat: "jpg" | "png" | "webp" | undefined;

    preprocessAttempted = true;
    try {
      const cleaned = await preprocessForSmartMatch(mainImageUrl, categoryForPrompt);
      cleanedBase64 = cleaned.base64;
      cleanedFormat = cleaned.format;
      preprocessCacheHit = cleaned.cacheHit;
      preprocessDurationMs = cleaned.durationMs;
    } catch (err) {
      // Preprocess is best-effort — keep going with the raw URL.
      if (err instanceof PreprocessError) {
        console.warn(
          `[smartmatch] preprocess skipped (${err.code}): ${err.message}`,
        );
      } else {
        console.warn("[smartmatch] preprocess failed:", err);
      }
    }

    const smartOutcome = await searchAliExpressBySmartMatch(mainImageUrl, {
      cleanedBase64,
      cleanedFormat,
      shipToCountry: locale.shipToCountry,
      targetCurrency: locale.targetCurrency,
      categoryIds: categoryVocab?.categoryIds.join(","),
    });

    smartmatchArm = smartOutcome.armUsed ?? null;
    smartmatchCandidateCount = smartOutcome.candidates?.length ?? 0;

    if (smartOutcome.candidates && smartOutcome.candidates.length > 0) {
      candidates = mergeAndDeduplicateCandidates(candidates, smartOutcome.candidates);
      keywordsUsed.push(
        `smartmatch:image (arm:${smartOutcome.armUsed ?? "none"}, ${smartOutcome.candidates.length} candidates)`,
      );
    }
  }

  // Category-specific negative filter — applied after all candidate pools
  // are merged but before scoring. Strips obvious noise (replacement parts,
  // accessories, wrong-family lookalikes) so we don't burn Gemini Vision
  // tokens on garbage in the rerank stage.
  if (categoryVocab && candidates.length > 0) {
    const before = candidates.length;
    candidates = filterByNegativeKeywords(candidates, categoryVocab.negativeKeywords);
    if (candidates.length < before) {
      keywordsUsed.push(
        `negative-filter:${categoryVocab.vertical} (-${before - candidates.length})`,
      );
    }
  }

  if (candidates.length === 0) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_RESULTS",
      `No qualifying AliExpress suppliers found for "${keywordsUsed.join(" / ")}".`,
      422,
    );
  }

  // Score top N candidates by text match confidence.
  // Phase 5: bumped from 8 → 12 to give the batch image rerank a wider pool
  // (rerank itself caps at 12 candidates in one Gemini call).
  const TOP_N = Math.min(12, candidates.length);
  const scored = candidates.slice(0, TOP_N).map((candidate) => ({
    candidate,
    confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate),
  }));
  scored.sort((a, b) => b.confidence.score - a.confidence.score);

  // If all top text scores are still weak, try any remaining AI keywords we
  // haven't used yet and fold in new candidates.
  const topTextScore = scored[0]?.confidence.score ?? 0;
  if (topTextScore < RETRY_WITH_CATEGORY_THRESHOLD) {
    const unusedAiKeywords = aiKeywords.slice(2);
    if (unusedAiKeywords.length > 0 || (categoryKeywords && !keywordsUsed.includes(categoryKeywords))) {
      const extraKeywords = [
        ...unusedAiKeywords,
        ...(categoryKeywords && !keywordsUsed.includes(categoryKeywords) ? [categoryKeywords] : []),
      ];
      for (const kw of extraKeywords.slice(0, 2)) {
        const results = await searchCandidates(kw, provider, keywordOpts);
        if (results.length > 0) {
          candidates = mergeAndDeduplicateCandidates(candidates, results);
          keywordsUsed.push(kw);
        }
      }
      const newScored = candidates.slice(0, TOP_N).map((candidate) => ({
        candidate,
        confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate),
      }));
      newScored.sort((a, b) => b.confidence.score - a.confidence.score);
      scored.splice(0, scored.length, ...newScored);
    }
  }

  // Phase 5 Stage 2 — Cheap batch image rerank (single Gemini call).
  // Sends source image + top 12 candidate thumbnails in one prompt to
  // rate each on same-product + same-function. Lets us cull to the top 3-4
  // BEFORE running the more detailed per-candidate image AI verification.
  //
  // Without this, we'd either run deep image AI on too many candidates
  // (wasteful) or miss good candidates by running on too few.
  if (
    isImageMatchEnabled() &&
    params.attributes.mainImageUrl !== null &&
    scored.length > 3 &&
    scored[0].confidence.score < TEXT_SCORE_SKIP_IMAGE_THRESHOLD
  ) {
    const rerankResult = await rerankCandidatesByImage({
      sourceTitle: params.attributes.title,
      sourceImageUrl: params.attributes.mainImageUrl,
      candidates: scored.map(({ candidate }) => ({
        id: candidate.productId,
        title: candidate.title,
        imageUrl: candidate.imageUrl,
      })),
    });

    if (rerankResult && rerankResult.ratings.length > 0 && !rerankResult.error) {
      const ratingById = new Map(rerankResult.ratings.map((r) => [r.candidateId, r]));
      // Keep candidates rated >= threshold by the rerank model. If too few
      // pass, keep the top 4 by rating to preserve choice for the deep stage.
      const ranked = scored
        .map((entry) => ({
          entry,
          rating: ratingById.get(entry.candidate.productId)?.rating ?? 0,
        }))
        .sort((a, b) => b.rating - a.rating);

      const passing = ranked.filter((r) => r.rating >= RERANK_KEEP_THRESHOLD);
      const culled = (passing.length >= 2 ? passing : ranked.slice(0, 4)).map((r) => r.entry);

      // Push rerank reasons into the top candidate's match confidence reasons
      // so the user sees them in the "verify before buying" warning panel.
      const topRating = ratingById.get(culled[0]?.candidate.productId ?? "");
      if (topRating && culled[0]) {
        culled[0].confidence.reasons.push(
          `Image rerank: ${topRating.rating}/10 — ${topRating.reason}`,
        );
      }

      scored.splice(0, scored.length, ...culled);
    }
  }

  // Image-based verification on top 3 candidates (deep, per-candidate).
  const shouldRunImageMatch =
    isImageMatchEnabled() &&
    params.attributes.mainImageUrl !== null &&
    scored[0].confidence.score < TEXT_SCORE_SKIP_IMAGE_THRESHOLD;

  if (shouldRunImageMatch) {
    const imageOutcome = await runImageMatch(params.attributes, scored);

    if (imageOutcome.rejected) {
      // Image AI rejected the current pool.
      // Try any AI functional keywords + category keywords we haven't searched yet.
      const unusedForRetry = [
        ...aiKeywords.slice(2),
        ...(categoryKeywords && !keywordsUsed.includes(categoryKeywords) ? [categoryKeywords] : []),
      ];

      if (unusedForRetry.length > 0) {
        for (const kw of unusedForRetry.slice(0, 2)) {
          const results = await searchCandidates(kw, provider, keywordOpts);
          if (results.length > 0) {
            candidates = mergeAndDeduplicateCandidates(candidates, results);
            keywordsUsed.push(`${kw} (retry)`);
          }
        }
        const retryScored = candidates.slice(0, TOP_N).map((candidate) => ({
          candidate,
          confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate),
        }));
        retryScored.sort((a, b) => b.confidence.score - a.confidence.score);

        const retryImageOutcome = await runImageMatch(params.attributes, retryScored);
        if (!retryImageOutcome.rejected) {
          scored.splice(0, scored.length, ...retryScored);
        } else {
          throw new AliExpressSearchError(
            "ALIEXPRESS_NO_CONFIDENT_MATCH",
            `Image-match AI rejected all candidates for "${params.attributes.title}" even after keyword retry. ${retryImageOutcome.rejectionReason ?? imageOutcome.rejectionReason ?? "No match found."}`,
            422,
          );
        }
      } else {
        throw new AliExpressSearchError(
          "ALIEXPRESS_NO_CONFIDENT_MATCH",
          `Image-match AI rejected all top candidates for "${params.attributes.title}". ${imageOutcome.rejectionReason ?? "None visually matched the source product."}`,
          422,
        );
      }
    }

    // Re-sort by folded score after image match.
    scored.sort((a, b) => b.confidence.score - a.confidence.score);
  }

  // Variant resolution — fetch SKU detail for the top 3 candidates and pick
  // the SKU that best matches the source variant. Only runs when:
  //   - the source page exposed a variant signal (color/size/capacity/material)
  //   - the AliExpress API is configured (SKU fetch needs auth)
  //   - we have at least one candidate to consider
  //
  // The variant score is folded into the confidence. Hard mismatches (source
  // wants 256 GB but only 64/128 are offered) trigger a soft-clamp to 0.45.
  const variantResults = new Map<string, VariantMatchResult>();
  const sourceVariant = params.attributes.variant;
  if (
    sourceVariant &&
    provider === "aliexpress_api" &&
    scored.length > 0
  ) {
    const topForVariants = scored.slice(0, Math.min(3, scored.length));
    const detailResults = await Promise.all(
      topForVariants.map((entry) =>
        fetchAliExpressProductDetail(entry.candidate.productId),
      ),
    );

    for (let i = 0; i < topForVariants.length; i += 1) {
      const entry = topForVariants[i];
      const detail = detailResults[i];
      const variantMatch = matchVariantToSku(
        sourceVariant,
        detail,
        categoryVocab?.variantAxisMappings,
      );
      variantResults.set(entry.candidate.productId, variantMatch);

      if (variantMatch.matchedSku || variantMatch.hardMismatch) {
        entry.confidence = foldVariantIntoConfidence(entry.confidence, {
          score: variantMatch.variantConfidence,
          hardMismatch: variantMatch.hardMismatch,
          reasons: variantMatch.matchReasons,
        });
      }
    }

    scored.sort((a, b) => b.confidence.score - a.confidence.score);
  }

  const best = scored[0];

  if (best.confidence.score < MATCH_CONFIDENCE_MIN) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_CONFIDENT_MATCH",
      `Found ${candidates.length} candidates but none match "${params.attributes.title}" confidently. Best score: ${best.confidence.score.toFixed(2)} (${best.confidence.reasons.join("; ")}).`,
      422,
    );
  }

  const winner = best.candidate;

  const winnerVariantMatch = variantResults.get(winner.productId);
  const matchedSku = winnerVariantMatch?.matchedSku ?? null;

  // Build the product URL with variant + warehouse pre-selected when available
  const productUrlWithVariant = buildProductUrlWithVariant(
    winner.productUrl,
    matchedSku?.skuId ?? null,
    matchedSku?.warehouseCountry ?? null,
  );

  const { affiliateUrl, provider: affiliateProvider } = await convertToAffiliateLink({
    productUrl: productUrlWithVariant,
    existingPromotionLink: winner.promotionLink,
  });

  const affiliateLinkValidated = await validateAffiliateLink(affiliateUrl);

  if (!affiliateLinkValidated) {
    console.warn(
      `[aliexpress] Affiliate link validation failed for product ${winner.productId}; falling back to product URL.`,
    );
  }

  const resolvedAffiliateUrl = affiliateLinkValidated
    ? affiliateUrl
    : productUrlWithVariant;

  // Variant-aware price: prefer the matched SKU's price + shipping over the
  // candidate's lowest-variant list price (which may not reflect the actual
  // variant the user wants to buy).
  const finalPriceUsd = matchedSku?.priceUsd ?? winner.priceUsd;

  const variantLabel = matchedSku
    ? buildVariantLabel(matchedSku.attrs, matchedSku.warehouseCountry)
    : null;

  const aliexpressData: AliExpressProductData = {
    title: winner.title,
    priceUsd: finalPriceUsd,
    originalPriceUsd: params.storePriceUsd ?? undefined,
    imageUrl: winner.imageUrl ?? params.attributes.mainImageUrl ?? undefined,
    orderCount: winner.orderCount,
    sellerRating: winner.sellerRating,
    shippingDays: matchedSku?.shippingDays ?? winner.shippingDays ?? undefined,
    affiliateUrl: resolvedAffiliateUrl,
    ...(matchedSku && variantLabel
      ? {
          matchedVariant: {
            skuId: matchedSku.skuId,
            label: variantLabel,
            priceUsd: matchedSku.priceUsd,
            warehouseCountry: matchedSku.warehouseCountry,
            shippingCostUsd: matchedSku.shippingCostUsd,
            totalCostUsd:
              matchedSku.shippingCostUsd !== null
                ? matchedSku.priceUsd + matchedSku.shippingCostUsd
                : matchedSku.priceUsd,
          },
        }
      : {}),
    ...(winnerVariantMatch?.hardMismatch ? { variantWarning: true } : {}),
  };

  return {
    aliexpressUrl: productUrlWithVariant,
    aliexpressData,
    matchConfidence: best.confidence.score,
    matchQuality: best.confidence.quality,
    matchReasons: best.confidence.reasons,
    imageMatchScore: best.confidence.imageMatchScore,
    imageMatchSameFunction: best.confidence.imageMatchSameFunction,
    imageMatchReasoning: best.confidence.imageMatchReasoning,
    variantMatchScore: best.confidence.variantScore,
    variantHardMismatch: best.confidence.variantHardMismatch,
    variantMatchReasons: best.confidence.variantMatchReasons,
    searchMeta: {
      keywords: keywordsUsed.join(" / "),
      provider,
      candidateCount: candidates.length,
      winnerProductId: winner.productId,
      affiliateLinkValidated,
      affiliateProvider,
      ...(matchedSku ? { variantMatched: true, variantSkuId: matchedSku.skuId } : {}),
      ...(categoryVocab === null
        ? {
            categoryVocabMiss:
              params.identity?.category ?? params.productCategory ?? "(unknown)",
          }
        : {}),
      preprocessAttempted,
      ...(preprocessAttempted ? { preprocessCacheHit, preprocessDurationMs } : {}),
      smartmatchArm: smartmatchArm === null ? undefined : smartmatchArm,
      smartmatchCandidateCount,
    },
  };
}

function buildVariantLabel(
  attrs: Record<string, string>,
  warehouseCountry: string | null,
): string {
  const parts: string[] = [];
  if (attrs.color) parts.push(attrs.color);
  if (attrs.size) parts.push(attrs.size);
  if (attrs.capacity) parts.push(attrs.capacity);
  if (attrs.material) parts.push(attrs.material);
  if (warehouseCountry && warehouseCountry !== "CN") {
    parts.push(`${warehouseCountry} Warehouse`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Selected variant";
}

function buildProductUrlWithVariant(
  productUrl: string,
  skuId: string | null,
  warehouseCountry: string | null,
): string {
  if (!skuId && !warehouseCountry) return productUrl;
  try {
    const url = new URL(productUrl);
    if (skuId) url.searchParams.set("sku_id", skuId);
    if (warehouseCountry) url.searchParams.set("shipFromCountry", warehouseCountry);
    return url.toString();
  } catch {
    return productUrl;
  }
}
