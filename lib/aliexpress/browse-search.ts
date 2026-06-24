/**
 * Browse-mode candidate search.
 *
 * Used when the AI verdict is `collection_page`. Builds an enriched long-tail
 * query from {styleTokens, materialPriors, productCategory} and runs ONE
 * keyword search against the AliExpress Affiliate API. No image preprocessing,
 * no SmartMatch, no per-candidate image-AI re-rank — this path is intentionally
 * lightweight (typical ~1 API call, <800ms) since "browse" is about giving the
 * shopper aesthetic options, not asserting an exact 1:1 supplier match.
 */

import {
  searchAliExpressProducts,
  type KeywordSearchOptions,
} from "@/lib/aliexpress/api-client";
import type { AliExpressBrowseCandidate } from "@/lib/types/analyze";
import { AliExpressSearchError } from "@/lib/aliexpress/types";

/** Hard cap on candidates surfaced in the browse grid. */
export const BROWSE_CANDIDATE_LIMIT = 12;

/** Max style tokens to fold into the query before AE keyword scoring degrades. */
const MAX_STYLE_TOKENS_IN_QUERY = 2;

/** Max material priors to fold in — one strong material cue beats two. */
const MAX_MATERIAL_TOKENS_IN_QUERY = 1;

export interface BrowseSearchInput {
  productCategory: string;
  styleTokens: string[];
  materialPriors: string[];
  /** Buyer ship-to country for AE locale routing. */
  shipToCountry?: string;
  /** Buyer target currency (e.g. "USD", "ILS"). */
  targetCurrency?: string;
}

export interface BrowseSearchResult {
  /** The literal keyword string sent to AliExpress. */
  query: string;
  /** Ranked candidates, already capped at BROWSE_CANDIDATE_LIMIT. */
  candidates: AliExpressBrowseCandidate[];
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the enriched long-tail query.
 *
 * Order is deliberate: material → style → category. AliExpress relevance
 * weights early terms more heavily, and a concrete material (e.g. "14k gold")
 * is the strongest signal for visual congruence with the source store.
 *
 * Dedup is at the WORD level so overlapping phrases (e.g. material "14k gold"
 * + category "gold necklace") don't bloat the query into "14k gold gold
 * necklace" — we emit "14k gold necklace".
 *
 * Example: { category: "necklace", style: ["minimalist", "dainty"],
 * material: ["14k gold"] } → "14k gold minimalist dainty necklace"
 */
export function buildBrowseQuery(input: {
  productCategory: string;
  styleTokens: string[];
  materialPriors: string[];
}): string {
  const seenWords = new Set<string>();
  const ordered: string[] = [];

  const push = (token: string) => {
    const normalized = normalizeToken(token);
    if (!normalized) return;
    for (const word of normalized.split(" ")) {
      if (!word) continue;
      if (seenWords.has(word)) continue;
      seenWords.add(word);
      ordered.push(word);
    }
  };

  for (const t of input.materialPriors.slice(0, MAX_MATERIAL_TOKENS_IN_QUERY)) {
    push(t);
  }
  for (const t of input.styleTokens.slice(0, MAX_STYLE_TOKENS_IN_QUERY)) {
    push(t);
  }
  push(input.productCategory);

  return ordered.join(" ").trim();
}

export async function searchBrowseCandidates(
  input: BrowseSearchInput,
): Promise<BrowseSearchResult> {
  const query = buildBrowseQuery({
    productCategory: input.productCategory,
    styleTokens: input.styleTokens,
    materialPriors: input.materialPriors,
  });

  if (!query) {
    throw new AliExpressSearchError(
      "BROWSE_EMPTY_QUERY",
      "Cannot build browse query — category and style/material tokens are all empty.",
      422,
    );
  }

  const opts: KeywordSearchOptions = {
    ...(input.shipToCountry ? { shipToCountry: input.shipToCountry } : {}),
    ...(input.targetCurrency ? { targetCurrency: input.targetCurrency } : {}),
  };

  const ranked = await searchAliExpressProducts(query, opts);

  const candidates: AliExpressBrowseCandidate[] = ranked
    .filter((c) => c.priceUsd > 0)
    .slice(0, BROWSE_CANDIDATE_LIMIT)
    .map((c) => ({
      productId: c.productId,
      title: c.title,
      priceUsd: c.priceUsd,
      imageUrl: c.imageUrl,
      // The keyword search already returns promotion_link for tracked queries;
      // fall back to the raw product URL when AE returned no promotion link.
      affiliateUrl: c.promotionLink ?? c.productUrl,
      orderCount: c.orderCount,
      sellerRating: c.sellerRating,
    }));

  return { query, candidates };
}
