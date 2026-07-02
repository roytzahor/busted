/**
 * Cross-network supplier fallback.
 *
 * The primary supplier path (`findAliExpressSupplier`) is AliExpress-only and
 * very thorough. When it can't produce a confident match — or only a weak
 * best-effort one — this module fans out to the OTHER configured networks
 * (eBay, Amazon) via the multi-supplier router, scores them with the SAME
 * `computeMatchConfidence` engine, and returns the single best cross-network
 * candidate as a `SupplierMatchResult`.
 *
 * Design guarantees:
 *  - Never queries AliExpress here (the primary path already did, thoroughly) —
 *    we only ADD coverage the primary path lacks.
 *  - "Highest confidence wins": the caller compares this result's confidence to
 *    the AliExpress result and keeps the higher one.
 *  - Returns null (never throws) on no-config / no-results / garbage match, so
 *    it can only ever help, never break, the scan.
 *  - eBay/Amazon candidates already carry a native affiliate link, so no
 *    Admitad conversion is needed (or attempted) for them.
 */

import {
  BEST_EFFORT_FLOOR,
  MATCH_CONFIDENCE_MIN,
} from "@/lib/aliexpress/match-confidence";
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { resolveLocaleFromSourceUrl } from "@/lib/aliexpress/locale";
import type { SupplierMatchResult } from "@/lib/aliexpress/types";
import type { ProductIdentity } from "@/lib/services/types";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import { searchAndScoreSuppliers } from "@/lib/supplier/router";

/** Kill switch. Default ON — the whole point is to always try to find a product.
 *  Set MULTI_SUPPLIER_ENABLED=false to disable the cross-network fallback. */
export function isMultiSupplierEnabled(): boolean {
  return process.env.MULTI_SUPPLIER_ENABLED !== "false";
}

export interface CrossNetworkFallbackInput {
  attributes: ScrapedProductAttributes;
  storePriceUsd: number | null;
  productCategory?: string;
  aiKeywords?: string[];
  identity?: ProductIdentity | null;
}

/** Build the keyword arms the router should search, mirroring the primary path's
 *  precedence (vision identity → AI functional keywords → title-derived). */
function buildKeywordArms(input: CrossNetworkFallbackInput): string[] {
  const effectiveTitle =
    input.attributes.translatedTitle ?? input.attributes.title;
  const identityPrimary =
    input.identity?.searchKeywords.primary?.filter((k) => k.trim().length > 3) ??
    [];
  const legacyAi = (input.aiKeywords ?? []).filter((k) => k.trim().length > 3);
  const titleKeywords = extractSearchKeywords(effectiveTitle);

  const seen = new Set<string>();
  const arms: string[] = [];
  for (const kw of [...identityPrimary, ...legacyAi, titleKeywords]) {
    const norm = kw.trim().toLowerCase();
    if (norm.length > 0 && !seen.has(norm)) {
      seen.add(norm);
      arms.push(kw);
    }
  }
  return arms.slice(0, 3); // cap arms to bound the per-provider call count
}

export async function findCrossNetworkSupplier(
  input: CrossNetworkFallbackInput,
): Promise<SupplierMatchResult | null> {
  const keywords = buildKeywordArms(input);
  if (keywords.length === 0) return null;

  const locale = resolveLocaleFromSourceUrl(input.attributes.sourceUrl);
  const matchTerms = [input.productCategory, ...(input.aiKeywords ?? [])]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" ");

  let scored: Awaited<ReturnType<typeof searchAndScoreSuppliers>>["scored"];
  let router: Awaited<ReturnType<typeof searchAndScoreSuppliers>>["router"];
  try {
    const result = await searchAndScoreSuppliers({
      scrapedAttrs: input.attributes,
      storePriceUsd: input.storePriceUsd,
      keywords,
      extraMatchTerms: matchTerms,
      opts: {
        shipToCountry: locale.shipToCountry,
        targetCurrency: locale.targetCurrency,
      },
    });
    scored = result.scored;
    router = result.router;
  } catch {
    // Router is defensive already, but never let a fallback failure surface.
    return null;
  }

  // Only consider networks the primary path did NOT already cover.
  const crossNetwork = scored.filter(
    (s) => s.candidate.sourceProvider !== "aliexpress",
  );
  if (crossNetwork.length === 0) return null;

  const best = crossNetwork[0];

  // Same hard-suppression rules the AliExpress path uses: never surface a
  // garbage match (absurd/unparseable price or a noise-floor score).
  if (
    best.confidence.priceVerdict === "absurd" ||
    best.confidence.score < BEST_EFFORT_FLOOR
  ) {
    return null;
  }

  const bestEffortOnly = best.confidence.score < MATCH_CONFIDENCE_MIN;
  const c = best.candidate;

  return {
    aliexpressUrl: c.affiliateLink,
    aliexpressData: {
      title: c.title,
      priceUsd: c.priceUsd,
      originalPriceUsd: input.storePriceUsd ?? undefined,
      imageUrl: c.imageUrl || input.attributes.mainImageUrl || undefined,
      affiliateUrl: c.affiliateLink,
    },
    matchConfidence: best.confidence.score,
    matchQuality: best.confidence.quality,
    matchReasons: best.confidence.reasons,
    imageMatchScore: best.confidence.imageMatchScore,
    imageMatchSameFunction: best.confidence.imageMatchSameFunction,
    imageMatchReasoning: best.confidence.imageMatchReasoning,
    bestEffortOnly: bestEffortOnly || undefined,
    searchMeta: {
      keywords: keywords.join(" / "),
      provider: c.sourceProvider === "ebay" ? "ebay" : "amazon",
      sourceNetwork: c.sourceProvider,
      candidateCount: router.candidates.length,
      winnerProductId: `${c.sourceProvider}:${c.id}`,
      affiliateLinkValidated: true,
      affiliateProvider: c.sourceProvider === "ebay" ? "ebay" : "direct",
      shipToCountry: locale.shipToCountry,
      targetCurrency: locale.targetCurrency,
    },
  };
}
