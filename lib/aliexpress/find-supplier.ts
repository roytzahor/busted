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
  BEST_EFFORT_FLOOR,
  computeMatchConfidence,
  foldImageMatchIntoConfidence,
  foldVariantIntoConfidence,
} from "@/lib/aliexpress/match-confidence";
import { getVerticalPrior } from "@/lib/learning/priors";
import { matchVariantToSku, type VariantMatchResult } from "@/lib/aliexpress/match-variant";
import { fetchAliExpressProductDetail } from "@/lib/aliexpress/sku";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
import { extractProductIdFromUrl } from "@/lib/aliexpress/parse-search-markdown";
import {
  embedProductText,
  findNearestProducts,
  isVectorIndexEnabled,
} from "@/lib/index/embeddings";
import {
  deriveOutcomeVertical,
  filterByNegativeKeywords,
  resolveCategoryVocab,
} from "@/lib/aliexpress/category-map";
import { resolveLocaleFromSourceUrl } from "@/lib/aliexpress/locale";
import {
  isPreprocessEnabled,
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
import {
  buildReputationPenaltyReason,
  getReputationForProducts,
  recordLinkOutcome,
  REPUTATION_PENALTY_MULTIPLIER,
} from "@/lib/aliexpress/reputation";

/**
 * ── AI-COST ESCALATION LADDER (single source of truth) ──────────────────────
 * The supplier match escalates through tiers of increasing cost, and each tier
 * fires ONLY when the cheaper tier below it left the result ambiguous. Keep new
 * cost-bearing steps on this ladder — don't add unconditional AI calls.
 *
 *   Tier 0  Text match          always     ~$0        Jaccard title + price + trust
 *   Tier 1  SmartMatch (url)    always*    ~$0        raw image-URL arm (*API + image)
 *   Tier 2  Batch image rerank  score<0.85 ~$0.0001   TEXT_SCORE_SKIP_IMAGE_THRESHOLD
 *   Tier 3  Deep image match    score<0.85 ~$0.0001   per-candidate verification
 *   Tier 4  Preprocess+base64   score<0.60 ~$0.038    PREPROCESS_TRIGGER_THRESHOLD,
 *                                                      gated by isPreprocessEnabled()
 *
 * A confident text match (≥0.85) short-circuits the whole ladder — no image
 * spend. The projected cost of each tier is tracked in scripts/eval/run-fixtures
 * (COST_USD) and can be budget-gated with `npm run eval -- --enforce-cost`.
 */
const TEXT_SCORE_SKIP_IMAGE_THRESHOLD = 0.85;

/**
 * Sprint 12 — conditional preprocess threshold.
 *
 * When `PREPROCESS_ENABLED=true`, `preprocessForSmartMatch()` only fires when
 * the best text+raw-image score after initial scoring is below this value.
 * Above 0.6 we already have a confident-enough match and spending $0.039 on
 * image generation produces no meaningful lift.
 */
const PREPROCESS_TRIGGER_THRESHOLD = 0.6;

/**
 * Maps industrial material tokens (case-insensitive substring match) to
 * generic terms that indicate a raw-material or component supplier rather
 * than a finished-product listing. Added to the negative keyword filter when
 * `preprocessForSmartMatch` detects these materials on the product image.
 */
const MATERIAL_GENERIC_NEGATIVES: Record<string, string[]> = {
  TPU: ["tpu sheet", "tpu roll", "tpu pellets", "tpu granules", "tpu raw"],
  ABS: ["abs filament", "abs sheet", "abs pellets", "abs plastic raw", "3d filament"],
  EVA: ["eva foam roll", "eva foam sheet", "eva sheet raw", "eva pellets"],
  ALUMINUM: ["aluminum billet", "aluminum sheet", "aluminum extrusion", "aluminium bar"],
  "STAINLESS STEEL": ["stainless sheet", "steel tube raw", "steel bar stock"],
  S925: ["925 silver plated", "silver plating", "silver imitation", "fake silver"],
  "STERLING SILVER": ["silver plated", "silver plating", "imitation silver", "silver tone"],
  SILICONE: ["silicone sheet", "silicone raw", "silicone mold material"],
  CERAMIC: ["ceramic tile", "ceramic substrate", "ceramic powder raw"],
  CARBON: ["carbon fiber sheet", "carbon fiber prepreg", "carbon fiber raw"],
};

/** Build negative keyword terms derived from detected material tokens. */
function buildMaterialNegatives(materialTokens: string[]): string[] {
  const negatives = new Set<string>();
  for (const token of materialTokens) {
    const upper = token.toUpperCase();
    for (const [key, terms] of Object.entries(MATERIAL_GENERIC_NEGATIVES)) {
      if (upper.includes(key)) {
        for (const t of terms) negatives.add(t);
      }
    }
  }
  return [...negatives];
}

// When first-pass text scores are all below this, trigger a category keyword retry.
const RETRY_WITH_CATEGORY_THRESHOLD = 0.35;

// Minimum candidates before we bother with a category-keyword retry.
const RETRY_MIN_CANDIDATES_THRESHOLD = 5;

async function searchCandidates(
  keywords: string,
  provider: "aliexpress_api" | "firecrawl_scrape",
  opts: KeywordSearchOptions = {},
): Promise<AliExpressProductCandidate[]> {
  if (provider !== "aliexpress_api") {
    try {
      return await searchAliExpressViaScrape(keywords);
    } catch {
      return [];
    }
  }

  // The AliExpress affiliate API returns empty or errors when category IDs or
  // price-band params aren't supported by the caller's API tier. We try in
  // progressive fallback order to keep the keyword search useful even when
  // category/price narrowing isn't available:
  //   1. Full opts (category IDs + price band + sort)
  //   2. Without price band (category IDs + sort only)
  //   3. Without category IDs (base search — always works)
  const attempts: KeywordSearchOptions[] = [opts];

  const hasPriceBand =
    opts.minSalePrice !== undefined || opts.maxSalePrice !== undefined;
  const hasCategoryIds = opts.categoryIds !== undefined;

  // Build progressive fallback chain: drop constraints one tier at a time.
  // Tier 2: no price band (keep categoryIds + sort)
  // Tier 3: no categoryIds + no price band (keep sort)
  // Tier 4: bare locale search (drop everything except geo)
  if (hasPriceBand || hasCategoryIds) {
    const { minSalePrice: _a, maxSalePrice: _b, ...withoutPrice } = opts;
    if (hasPriceBand) attempts.push(withoutPrice);

    const { categoryIds: _c, minSalePrice: _d, maxSalePrice: _e, ...withoutCat } = opts;
    if (hasCategoryIds) attempts.push(withoutCat);

    // Bare locale — always works, no narrowing.
    const { categoryIds: _f, minSalePrice: _g, maxSalePrice: _h, sortStrategy: _s, ...bareOpts } = opts;
    attempts.push(bareOpts);
  }

  for (const attemptOpts of attempts) {
    try {
      const results = await searchAliExpressProducts(keywords, attemptOpts);
      if (results.length > 0) return results;
    } catch {
      // swallow and try next fallback
    }
  }
  return [];
}

// How many ANN nearest-neighbor rows to pull. Kept small — this arm only
// ever adds to the pool that computeMatchConfidence() re-ranks; anything
// off-topic gets filtered out downstream the same as a bad keyword-search
// candidate would.
const VECTOR_CANDIDATE_LIMIT = 5;

/**
 * ANN candidate arm — ROADMAP Phase 2 item 1 wiring. Embeds the query text
 * and looks up nearest AliExpress-network rows in ProductEmbedding by cosine
 * distance. Behind isVectorIndexEnabled() (default off); returns [] on any
 * failure or when a NearestProduct's sourceUrl doesn't carry a parseable
 * AliExpress item id (ingest never stored productId for aliexpress rows —
 * see scripts/index/ingest-embeddings.ts).
 *
 * Deliberately does NOT skip scoring: results feed into the same
 * mergeAndDeduplicateCandidates() + computeMatchConfidence() pipeline as
 * every other arm, so a bad ANN hit is filtered the same way a bad keyword
 * hit is — this arm only ever adds candidates, never picks a winner itself.
 */
async function findVectorCandidates(
  queryText: string,
): Promise<AliExpressProductCandidate[]> {
  if (!isVectorIndexEnabled()) return [];

  try {
    const embedding = await embedProductText(queryText);
    if (!embedding) return [];

    const nearest = await findNearestProducts(embedding, {
      network: "aliexpress",
      limit: VECTOR_CANDIDATE_LIMIT,
    });

    const candidates: AliExpressProductCandidate[] = [];
    for (const row of nearest) {
      const productId = row.productId ?? extractProductIdFromUrl(row.sourceUrl);
      if (!productId || row.priceUsd === null) continue;

      candidates.push({
        productId,
        title: row.title,
        priceUsd: row.priceUsd,
        productUrl: row.sourceUrl,
        imageUrl: row.imageUrl,
        // Trust signals aren't captured by the embedding index — conservative
        // defaults so match-confidence's 15% trust weight can't overstate an
        // ANN hit relative to a keyword-search candidate with real seller data.
        orderCount: 0,
        sellerRating: 0,
        shippingDays: null,
        promotionLink: null,
      });
    }
    return candidates;
  } catch (err) {
    console.warn("[find-supplier] vector candidate lookup failed", err);
    return [];
  }
}

export function mergeAndDeduplicateCandidates(
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
  imageMatchMin: number = IMAGE_MATCH_MIN,
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

  if (imageResult.bestCandidateId === null || imageResult.bestScore < imageMatchMin) {
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
  /**
   * Escalation trigger. When true (a retry after the user marked the previous
   * match "wrong"), the Tier-2 vision preprocess fires even when the cheap-arm
   * score looks decent (trigger widened to 0.95). Requires PREPROCESS_ENABLED —
   * kill switches stay absolute; with the flag off the retry runs the normal
   * arms only. We pay the heavy compute once; a resulting high-confidence
   * match is then auto-committed to the verified map by the route.
   */
  escalate?: boolean;
}): Promise<SupplierMatchResult> {
  // Use the translated title for keyword extraction when the original title is
  // non-Latin script (Hebrew, Arabic, CJK). The translation is attached by the
  // scrape router and preserves the original for AI verdict prompts.
  const effectiveTitle =
    params.attributes.translatedTitle ?? params.attributes.title;
  const titleKeywords = extractSearchKeywords(effectiveTitle);
  const thin = isThinTitle(effectiveTitle);

  // Descriptive terms folded into every match-confidence call so brand-name-only
  // titles (e.g. "Bleesse") still overlap with generic AliExpress listings via
  // the AI's productCategory + functional keywords.
  const matchTerms = [params.productCategory, ...(params.aiKeywords ?? [])]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" ");

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

  // Resolve locale + category vocab before any search so keyword arms use the
  // same geo + category context as the smartmatch arm. Locale is derived from
  // the source-store TLD (co.il → IL/ILS) so all AliExpress price quotes
  // reflect the buyer's actual market, not env-default-US.
  const locale = resolveLocaleFromSourceUrl(params.attributes.sourceUrl);
  const categoryVocab = resolveCategoryVocab(
    params.identity?.category ?? params.productCategory ?? null,
  );

  // ── Sprint 13: pull learned prior for this vertical (if any) ──────────────
  // Used to (a) seed additional keyword arms with proven winners, (b) filter
  // out historically-bad keywords, (c) override IMAGE_MATCH_MIN per vertical.
  // The lookup hits an in-memory 5-min cache so warm scans pay nothing.
  //
  // Use deriveOutcomeVertical so the lookup key matches what the cron wrote
  // into VerticalKeywordPrior — covers both vocab-matched verticals and the
  // tokenised-fallback verticals (e.g. "led galaxy projector") that exist
  // only because the loop has been collecting outcomes for them.
  const verticalKey = deriveOutcomeVertical(
    params.identity?.category ?? params.productCategory ?? null,
  );
  const verticalPrior = verticalKey ? await getVerticalPrior(verticalKey) : null;
  const bannedKeywordSet = new Set(
    verticalPrior?.bannedKeywords.map((k) => k.toLowerCase()) ?? [],
  );
  const effectiveImageMatchMin =
    verticalPrior?.imageMatchThreshold ?? IMAGE_MATCH_MIN;

  // Sprint 13: seed `aiKeywords` from the learned vertical prior (when present).
  // Learned winners come first because they've already converted on real users.
  // We then merge identity + legacy AI keywords, deduplicating by lowercase
  // and dropping any banned keywords surfaced by the prior.
  const learnedPriorKeywords = (verticalPrior?.topKeywords ?? [])
    .map((entry) => entry.kw)
    .filter((kw) => kw.trim().length > 3);

  const seenKw = new Set<string>();
  const aiKeywords: string[] = [];
  for (const kw of [...learnedPriorKeywords, ...identityPrimary, ...identityVisual, ...legacyAi]) {
    const norm = kw.toLowerCase();
    if (!seenKw.has(norm) && !bannedKeywordSet.has(norm)) {
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
      ? buildCategoryKeywords(effectiveTitle, categorySource)
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

  // ── Vector ANN arm (ROADMAP Phase 2 item 1, behind VECTOR_INDEX_ENABLED) ──
  // Same query text ingest-embeddings.ts embeds for retail rows (title +
  // category), so query-time and index-time text construction stay in sync.
  const vectorQueryText = [effectiveTitle, categorySource]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" — ");
  const vectorCandidates = await findVectorCandidates(vectorQueryText);
  if (vectorCandidates.length > 0) {
    candidates = mergeAndDeduplicateCandidates(candidates, vectorCandidates);
    keywordsUsed.push(`vector-ann (${vectorCandidates.length} candidates)`);
  }

  // ── Phase 5A: SmartMatch raw-URL arm (always, free) ────────────────────────
  // We always dispatch SmartMatch with the raw source image URL — no Gemini
  // preprocessing, no cost. If the match is already confident (score ≥ 0.6
  // after text scoring below) we skip the expensive preprocess entirely.
  //
  // Tracking state — initialised to "skipped" and overwritten below.
  let preprocessAttempted = false;
  let preprocessCacheHit = false;
  let preprocessDurationMs = 0;
  let preprocessQualityScore: number | undefined;
  let preprocessLightPromptUsed: boolean | undefined;
  let smartmatchArm: SmartMatchOutcome["armUsed"] | "skipped" = "skipped";
  let smartmatchCandidateCount = 0;
  let preprocessOcrTraces: string[] = [];
  let preprocessMaterialTokens: string[] = [];
  let preprocessTechnicalSpecs: string[] = [];

  const mainImageUrl = params.attributes.mainImageUrl;
  const categoryForPrompt =
    categoryVocab?.vertical ??
    params.identity?.category ??
    params.productCategory ??
    "product";

  if (provider === "aliexpress_api" && mainImageUrl) {
    const rawSmartOutcome = await searchAliExpressBySmartMatch(mainImageUrl, {
      // No cleanedBase64 — raw URL arm only at this stage.
      shipToCountry: locale.shipToCountry,
      targetCurrency: locale.targetCurrency,
      categoryIds: categoryVocab?.categoryIds.join(","),
    });

    smartmatchArm = rawSmartOutcome.armUsed ?? null;
    smartmatchCandidateCount = rawSmartOutcome.candidates?.length ?? 0;

    if (rawSmartOutcome.candidates && rawSmartOutcome.candidates.length > 0) {
      candidates = mergeAndDeduplicateCandidates(candidates, rawSmartOutcome.candidates);
      keywordsUsed.push(
        `smartmatch:url (${rawSmartOutcome.candidates.length} candidates)`,
      );
    }
  }

  // Negative filter — merges category vocab negatives with material-derived negatives.
  // Material negatives strip raw-material supplier listings (e.g. "TPU pellets",
  // "ABS filament") that appear when spec terms broaden the candidate pool.
  // Applied regardless of whether category vocab is present.
  const materialNegatives = buildMaterialNegatives(preprocessMaterialTokens);
  const effectiveNegatives = [
    ...(categoryVocab?.negativeKeywords ?? []),
    ...materialNegatives,
  ];
  let negativeKeywordsFiltered = 0;
  if (effectiveNegatives.length > 0 && candidates.length > 0) {
    const before = candidates.length;
    candidates = filterByNegativeKeywords(candidates, effectiveNegatives);
    negativeKeywordsFiltered = before - candidates.length;
    if (candidates.length < before) {
      const label = categoryVocab
        ? `negative-filter:${categoryVocab.vertical}`
        : "negative-filter:material";
      keywordsUsed.push(`${label} (-${negativeKeywordsFiltered})`);
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
    confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate, matchTerms),
  }));
  scored.sort((a, b) => b.confidence.score - a.confidence.score);

  // Stage 11: apply affiliate-link reputation penalty before image rerank.
  // Fetches reputation rows for the top candidates in one query. Candidates
  // whose link has failed >80% of the time for this country (min 5 samples)
  // get their confidence score multiplied by REPUTATION_PENALTY_MULTIPLIER.
  // This prevents repeat exposure of products with broken affiliate funnels.
  if (provider === "aliexpress_api" && scored.length > 0) {
    const topIds = scored.map((s) => s.candidate.productId);
    const reputation = await getReputationForProducts(topIds, locale.shipToCountry);

    let penaltyApplied = false;
    for (const entry of scored) {
      const rep = reputation.get(entry.candidate.productId);
      if (!rep) continue;
      const reason = buildReputationPenaltyReason(rep);
      if (!reason) continue;
      entry.confidence.score = Math.max(0, entry.confidence.score * REPUTATION_PENALTY_MULTIPLIER);
      entry.confidence.reasons.push(reason);
      penaltyApplied = true;
    }
    if (penaltyApplied) {
      scored.sort((a, b) => b.confidence.score - a.confidence.score);
    }
  }

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
        confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate, matchTerms),
      }));
      newScored.sort((a, b) => b.confidence.score - a.confidence.score);
      scored.splice(0, scored.length, ...newScored);
    }
  }

  // ── Phase 5B: Conditional preprocess — Sprint 12 cost gate ───────────────
  // Only fires when:
  //   1. PREPROCESS_ENABLED=true  (off by default — keeps cold scan at $0.0015)
  //   2. Best score after text+raw-image scoring < PREPROCESS_TRIGGER_THRESHOLD
  //   3. We have a source image URL and are using the AE API provider
  //
  // When triggered, `preprocessForSmartMatch()` sends the source image to
  // Gemini for a tight crop + white-BG + brand-text inpaint (cost: ~$0.039).
  // The cleaned bytes feed a second SmartMatch call via `image_base64` which
  // yields significantly better recall on visually similar factory listings.
  // OCR traces and material tokens from the preprocess round-trip also seed
  // additional keyword searches before we re-score.
  // Escalation widens the trigger threshold so we spend the compute even on a
  // match the cheap arms thought was "good enough" but the user rejected. It
  // does NOT override PREPROCESS_ENABLED — kill switches are absolute; with
  // the flag off, an escalated retry just re-runs the normal search arms.
  const escalate = params.escalate ?? false;
  const preprocessAllowed = isPreprocessEnabled();
  const preprocessTrigger = escalate ? 0.95 : PREPROCESS_TRIGGER_THRESHOLD;
  if (
    preprocessAllowed &&
    provider === "aliexpress_api" &&
    mainImageUrl &&
    (scored[0]?.confidence.score ?? 0) < preprocessTrigger
  ) {
    let cleanedBase64: string | undefined;
    let cleanedFormat: "jpg" | "png" | "webp" | undefined;

    preprocessAttempted = true;
    try {
      const cleaned = await preprocessForSmartMatch(mainImageUrl, categoryForPrompt);
      cleanedBase64 = cleaned.base64;
      cleanedFormat = cleaned.format;
      preprocessCacheHit = cleaned.cacheHit;
      preprocessDurationMs = cleaned.durationMs;
      preprocessQualityScore = cleaned.qualityScore;
      preprocessLightPromptUsed = cleaned.lightPromptUsed;
      preprocessOcrTraces = cleaned.ocrTraces;
      preprocessMaterialTokens = cleaned.materialTokens;
      preprocessTechnicalSpecs = cleaned.technicalSpecs;
    } catch (err) {
      if (err instanceof PreprocessError) {
        console.warn(`[smartmatch] preprocess skipped (${err.code}): ${err.message}`);
      } else {
        console.warn("[smartmatch] preprocess failed:", err);
      }
    }

    // OCR model-number arm — near-exact factory hits when a model/serial is visible.
    for (const trace of preprocessOcrTraces.slice(0, 2)) {
      const ocrResults = await searchCandidates(trace, provider, keywordOpts);
      if (ocrResults.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, ocrResults);
        keywordsUsed.push(`ocr:${trace}`);
      }
    }

    // Material/spec text arm — industrial terms narrow the pool to factory-grade listings.
    const specTerms = [
      ...preprocessMaterialTokens.slice(0, 2),
      ...preprocessTechnicalSpecs.slice(0, 2),
    ].filter((t) => t.trim().length > 2);
    if (specTerms.length > 0) {
      const specQuery = specTerms.join(" ");
      const specResults = await searchCandidates(specQuery, provider, keywordOpts);
      if (specResults.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, specResults);
        keywordsUsed.push(`specs:${specQuery}`);
      }
    }

    // SmartMatch base64 arm — uses the cleaned image bytes for higher precision.
    if (cleanedBase64) {
      const base64Outcome = await searchAliExpressBySmartMatch(mainImageUrl, {
        cleanedBase64,
        cleanedFormat,
        shipToCountry: locale.shipToCountry,
        targetCurrency: locale.targetCurrency,
        categoryIds: categoryVocab?.categoryIds.join(","),
      });

      smartmatchArm = base64Outcome.armUsed ?? smartmatchArm;
      if (base64Outcome.candidates && base64Outcome.candidates.length > 0) {
        smartmatchCandidateCount += base64Outcome.candidates.length;
        candidates = mergeAndDeduplicateCandidates(candidates, base64Outcome.candidates);
        keywordsUsed.push(
          `smartmatch:base64 (arm:base64, ${base64Outcome.candidates.length} candidates)`,
        );
      }
    }

    // Re-score the now-richer candidate pool.
    const reScored = candidates.slice(0, TOP_N).map((candidate) => ({
      candidate,
      confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate, matchTerms),
    }));
    reScored.sort((a, b) => b.confidence.score - a.confidence.score);
    scored.splice(0, scored.length, ...reScored);
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

  let bestEffortOnly = false;

  if (shouldRunImageMatch) {
    const imageOutcome = await runImageMatch(params.attributes, scored, effectiveImageMatchMin);

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
          confidence: computeMatchConfidence(params.attributes, params.storePriceUsd, candidate, matchTerms),
        }));
        retryScored.sort((a, b) => b.confidence.score - a.confidence.score);

        const retryImageOutcome = await runImageMatch(params.attributes, retryScored, effectiveImageMatchMin);
        if (!retryImageOutcome.rejected) {
          scored.splice(0, scored.length, ...retryScored);
        } else {
          // Both image-match rounds rejected — surface the best text-scored
          // candidate as a "closest match" rather than returning nothing.
          scored.splice(0, scored.length, ...retryScored);
          bestEffortOnly = true;
        }
      } else {
        // No retry keywords available — surface best text-scored as closest match.
        bestEffortOnly = true;
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

  // Hard suppression — never surface a garbage match. An absurd/parse-error
  // price (e.g. an "$18M olive-oil extractor") or a score down in the noise
  // floor is worse than showing no supplier at all. Soft-skip so the route
  // renders "no confident match" instead of a misleading one.
  if (best.confidence.priceVerdict === "absurd" || best.confidence.score < BEST_EFFORT_FLOOR) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_CONFIDENT_MATCH",
      `Best candidate failed the sanity check (score ${best.confidence.score.toFixed(2)}, price ${best.confidence.priceVerdict}) — no supplier shown.`,
      422,
    );
  }

  if (best.confidence.score < MATCH_CONFIDENCE_MIN) {
    // Score below confident threshold — surface as closest match rather than returning nothing.
    bestEffortOnly = true;
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

  // Fire-and-forget: persist this affiliate link outcome for future reputation scoring.
  // Never awaited — never blocks the response. Runs in the background.
  recordLinkOutcome(winner.productId, locale.shipToCountry, affiliateLinkValidated);

  return {
    aliexpressUrl: productUrlWithVariant,
    aliexpressData,
    bestEffortOnly: bestEffortOnly || undefined,
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
      ...(preprocessAttempted
        ? {
            preprocessCacheHit,
            preprocessDurationMs,
            ...(preprocessQualityScore !== undefined ? { preprocessQualityScore } : {}),
            ...(preprocessLightPromptUsed !== undefined ? { preprocessLightPromptUsed } : {}),
          }
        : {}),
      smartmatchArm: smartmatchArm === null ? undefined : smartmatchArm,
      smartmatchCandidateCount,
      // Sprint 9 Stage 14 — locale + category + vision signals for /monitoring.
      shipToCountry: locale.shipToCountry,
      targetCurrency: locale.targetCurrency,
      ...(categoryVocab
        ? {
            categoryVertical: categoryVocab.vertical,
            categoryIds: categoryVocab.categoryIds.join(","),
          }
        : {}),
      ...(negativeKeywordsFiltered > 0 ? { negativeKeywordsFiltered } : {}),
      ...(preprocessOcrTraces.length > 0 ? { ocrTraces: preprocessOcrTraces } : {}),
      ...(preprocessMaterialTokens.length > 0 ? { materialTokens: preprocessMaterialTokens } : {}),
      ...(preprocessTechnicalSpecs.length > 0 ? { technicalSpecs: preprocessTechnicalSpecs } : {}),
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
