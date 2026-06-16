import { convertToAffiliateLink } from "@/lib/affiliate/convert-link";
import { validateAffiliateLink } from "@/lib/affiliate/validate-link";
import {
  compareProductImagesWithAI,
  isImageMatchEnabled,
} from "@/lib/ai/image-match";
import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
} from "@/lib/aliexpress/api-client";
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
} from "@/lib/aliexpress/match-confidence";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
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
): Promise<AliExpressProductCandidate[]> {
  try {
    return provider === "aliexpress_api"
      ? await searchAliExpressProducts(keywords)
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
}): Promise<SupplierMatchResult> {
  const titleKeywords = extractSearchKeywords(params.attributes.title);
  const thin = isThinTitle(params.attributes.title);

  // AI-generated functional keywords (from DropshipPrediction.aliexpressKeywords).
  // These describe what the product DOES rather than what it's named — e.g.
  // "bottle cap launcher" instead of "capblast". Use the first two as separate
  // searches and merge the pools for maximum coverage.
  const aiKeywords = params.aiKeywords?.filter((k) => k.trim().length > 3) ?? [];

  // Derive category keywords as a further fallback.
  const categoryKeywords =
    params.productCategory && (thin || aiKeywords.length === 0)
      ? buildCategoryKeywords(params.attributes.title, params.productCategory)
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

  // Search strategy — run in priority order and merge pools:
  // 1. AI functional keywords (most descriptive of what the product does)
  // 2. Title-derived keywords (good when title is descriptive)
  // 3. Category keywords (last-resort fallback for thin titles)
  let candidates: AliExpressProductCandidate[] = [];
  const keywordsUsed: string[] = [];

  // AI keywords — search the first two independently and merge
  for (const kw of aiKeywords.slice(0, 2)) {
    const results = await searchCandidates(kw, provider);
    if (results.length > 0) {
      candidates = mergeAndDeduplicateCandidates(candidates, results);
      keywordsUsed.push(kw);
    }
  }

  // Title keywords — always add unless title is a near-empty brand slug
  if (titleKeywords.trim()) {
    const titleResults = await searchCandidates(titleKeywords, provider);
    candidates = mergeAndDeduplicateCandidates(candidates, titleResults);
    if (titleResults.length > 0) keywordsUsed.push(titleKeywords);
  }

  // Category keywords — add when title was thin or pool is still small
  if (categoryKeywords && (thin || candidates.length < RETRY_MIN_CANDIDATES_THRESHOLD)) {
    const categoryResults = await searchCandidates(categoryKeywords, provider);
    candidates = mergeAndDeduplicateCandidates(candidates, categoryResults);
    if (categoryResults.length > 0) keywordsUsed.push(categoryKeywords);
  }

  if (candidates.length === 0) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_RESULTS",
      `No qualifying AliExpress suppliers found for "${keywordsUsed.join(" / ")}".`,
      422,
    );
  }

  // Score top N candidates by text match confidence.
  const TOP_N = Math.min(8, candidates.length);
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
        const results = await searchCandidates(kw, provider);
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

  // Image-based verification on top 3 candidates.
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
          const results = await searchCandidates(kw, provider);
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

  const best = scored[0];

  if (best.confidence.score < MATCH_CONFIDENCE_MIN) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_CONFIDENT_MATCH",
      `Found ${candidates.length} candidates but none match "${params.attributes.title}" confidently. Best score: ${best.confidence.score.toFixed(2)} (${best.confidence.reasons.join("; ")}).`,
      422,
    );
  }

  const winner = best.candidate;

  const { affiliateUrl, provider: affiliateProvider } = await convertToAffiliateLink({
    productUrl: winner.productUrl,
    existingPromotionLink: winner.promotionLink,
  });

  const affiliateLinkValidated = await validateAffiliateLink(affiliateUrl);

  if (!affiliateLinkValidated) {
    console.warn(
      `[aliexpress] Affiliate link validation failed for product ${winner.productId}; falling back to product URL.`,
    );
  }

  const resolvedAffiliateUrl = affiliateLinkValidated ? affiliateUrl : winner.productUrl;

  const aliexpressData: AliExpressProductData = {
    title: winner.title,
    priceUsd: winner.priceUsd,
    originalPriceUsd: params.storePriceUsd ?? undefined,
    imageUrl: winner.imageUrl ?? params.attributes.mainImageUrl ?? undefined,
    orderCount: winner.orderCount,
    sellerRating: winner.sellerRating,
    shippingDays: winner.shippingDays ?? undefined,
    affiliateUrl: resolvedAffiliateUrl,
  };

  return {
    aliexpressUrl: winner.productUrl,
    aliexpressData,
    matchConfidence: best.confidence.score,
    matchQuality: best.confidence.quality,
    matchReasons: best.confidence.reasons,
    imageMatchScore: best.confidence.imageMatchScore,
    imageMatchSameFunction: best.confidence.imageMatchSameFunction,
    imageMatchReasoning: best.confidence.imageMatchReasoning,
    searchMeta: {
      keywords: keywordsUsed.join(" / "),
      provider,
      candidateCount: candidates.length,
      winnerProductId: winner.productId,
      affiliateLinkValidated,
      affiliateProvider,
    },
  };
}
