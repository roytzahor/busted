/**
 * Keyword strategy for the eval capture/refresh tools.
 *
 * Both scripts/eval/capture-fixture.ts and scripts/eval/refresh-fixture.ts
 * used ONLY extractSearchKeywords(title) — never the AI's own curated
 * aliexpressKeywords, even though production (find-supplier.ts) always tries
 * AI keywords FIRST and MERGES every arm's results, never stopping at the
 * first hit. Real consequence: real-bleesse-belly-massager's title is
 * literally just the brand name ("Bleesse"), so the title-only search had
 * nothing to search with — while the AI's aliexpressKeywords ("menstrual
 * heating pad", "period pain relief massager") describe what the product
 * actually does. Fixtures captured with the weaker strategy don't reflect
 * what a real user's scan would surface, which understates real
 * supplier-match accuracy in the eval corpus.
 *
 * Mirrors production's accumulation and filtering order:
 *  - Tries both of the first two AI keywords AND the title arm
 *    unconditionally, merging every non-empty result via the SAME
 *    mergeAndDeduplicateCandidates find-supplier.ts uses.
 *  - Filters keywords by length BEFORE slicing to the first two, matching
 *    find-supplier.ts's filter-then-slice order.
 *
 * NEVER THROWS. Every arm's failure — recognized (a real zero-result
 * search) or not (a network blip, a ScraperError from the Firecrawl-based
 * scrape fallback, missing credentials) — is recorded into `warnings` and
 * the search continues to the next arm, returning whatever candidates WERE
 * found. Throwing here would discard every candidate already merged from
 * prior successful arms — neither caller (capture-fixture.ts /
 * refresh-fixture.ts) treats a thrown error as fatal anyway, so a thrown
 * exception would only cost partial progress for no benefit. Warnings give
 * the caller an honest, inspectable signal instead.
 */
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { ALIEXPRESS_NOT_CONFIGURED } from "@/lib/aliexpress/api-client";
import { mergeAndDeduplicateCandidates } from "@/lib/aliexpress/find-supplier";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

export interface KeywordSearchOutcome {
  /** Every keyword string that contributed at least one candidate, joined
   *  for the fixture's single `keywords` field — so the fixture is honest
   *  about the full accumulated search, not just the first arm tried. */
  keywords: string;
  candidates: AliExpressProductCandidate[];
  /**
   * One entry per arm that failed for a reason OTHER than "this exact
   * keyword matched nothing" — an unrecognized error type, or missing
   * credentials. Empty when every arm either succeeded or was a normal
   * empty result. The caller decides whether to log this or ignore it;
   * this function's job is only to never lose information silently.
   */
  warnings: string[];
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function searchWithAiKeywordsFirst(
  effectiveTitle: string,
  aiKeywords: string[] | undefined,
  searchFn: (keywords: string) => Promise<AliExpressProductCandidate[]>,
): Promise<KeywordSearchOutcome> {
  const titleKeywords = extractSearchKeywords(effectiveTitle);
  let candidates: AliExpressProductCandidate[] = [];
  const keywordsUsed: string[] = [];
  const warnings: string[] = [];

  // Filter-then-slice, matching find-supplier.ts:353-357+453 — slicing
  // first would lock onto two junk keywords and never try a good third one.
  const usableAiKeywords = (aiKeywords ?? [])
    .filter((kw) => kw.trim().length > 3)
    .slice(0, 2);

  for (const kw of usableAiKeywords) {
    try {
      const results = await searchFn(kw);
      if (results.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, results);
        keywordsUsed.push(kw);
      }
    } catch (err) {
      // A recognized AliExpressSearchError that isn't a config problem just
      // means this exact keyword found nothing — not worth a warning, that's
      // the normal "try the next arm" case find-supplier.ts also treats as
      // silent. Anything else (including missing credentials) is recorded
      // and the loop still continues — a config problem will keep failing
      // identically on every remaining arm, but that's cheap to discover
      // and safer than assuming it based on one error.
      const recognizedEmptyResult =
        err instanceof AliExpressSearchError && err.code !== ALIEXPRESS_NOT_CONFIGURED;
      if (!recognizedEmptyResult) {
        warnings.push(`"${kw}": ${describeError(err)}`);
      }
    }
  }

  if (titleKeywords.trim()) {
    try {
      const results = await searchFn(titleKeywords);
      if (results.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, results);
        keywordsUsed.push(titleKeywords);
      }
    } catch (err) {
      const recognizedEmptyResult =
        err instanceof AliExpressSearchError && err.code !== ALIEXPRESS_NOT_CONFIGURED;
      if (!recognizedEmptyResult) {
        warnings.push(`"${titleKeywords}": ${describeError(err)}`);
      }
    }
  }

  return {
    keywords: keywordsUsed.length > 0 ? keywordsUsed.join("; ") : titleKeywords,
    candidates,
    warnings,
  };
}
