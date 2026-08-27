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
 * Mirrors production's actual accumulation, filtering order, AND per-attempt
 * error philosophy — not just ordering:
 *  - Tries both of the first two AI keywords AND the title arm
 *    unconditionally, merging every non-empty result via the SAME
 *    mergeAndDeduplicateCandidates find-supplier.ts uses.
 *  - Filters keywords by length BEFORE slicing to the first two, matching
 *    find-supplier.ts's filter-then-slice order.
 *  - Swallows a per-arm failure and moves to the next arm, exactly like
 *    find-supplier.ts's searchCandidates() (`catch { return []; }` /
 *    `catch { // swallow and try next fallback }`) — NOT by pattern-matching
 *    a specific error message. An earlier version of this file only
 *    swallowed errors whose text matched the AliExpress affiliate API's
 *    zero-result wording, which never matches searchAliExpressViaScrape's
 *    actual error ("No AliExpress products found for..."), so a zero-result
 *    keyword on the scrape-fallback provider aborted every remaining arm —
 *    the opposite of what this file exists to fix.
 *  - The ONE error that must NOT be swallowed: ALIEXPRESS_NOT_CONFIGURED.
 *    That's a setup problem (missing credentials), not a per-keyword result,
 *    and swallowing it would silently write every subsequent fixture with
 *    candidates: [] — indistinguishable from a real empty search — instead
 *    of failing loudly the first time someone runs the tool without creds.
 *
 * Deliberately NOT a full port of find-supplier.ts's precedence — no
 * identity/vision keywords, category vocab, locale-aware price bands, or
 * vertical-prior banning, since those need live production context (a
 * resolved category vocab, a learned keyword prior) a fixture capture
 * doesn't have and shouldn't fake.
 */
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { mergeAndDeduplicateCandidates } from "@/lib/aliexpress/find-supplier";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

export interface KeywordSearchOutcome {
  /** Every keyword string that contributed at least one candidate, joined
   *  for the fixture's single `keywords` field — so the fixture is honest
   *  about the full accumulated search, not just the first arm tried. */
  keywords: string;
  candidates: AliExpressProductCandidate[];
}

function isMisconfiguration(err: unknown): boolean {
  return err instanceof AliExpressSearchError && err.code === "ALIEXPRESS_NOT_CONFIGURED";
}

export async function searchWithAiKeywordsFirst(
  effectiveTitle: string,
  aiKeywords: string[] | undefined,
  searchFn: (keywords: string) => Promise<AliExpressProductCandidate[]>,
): Promise<KeywordSearchOutcome> {
  const titleKeywords = extractSearchKeywords(effectiveTitle);
  let candidates: AliExpressProductCandidate[] = [];
  const keywordsUsed: string[] = [];

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
      if (isMisconfiguration(err)) throw err;
      // Any other failure — including a legitimate zero-result search on
      // EITHER provider — means only "this arm found nothing." Move on.
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
      if (isMisconfiguration(err)) throw err;
    }
  }

  return {
    keywords: keywordsUsed.length > 0 ? keywordsUsed.join("; ") : titleKeywords,
    candidates,
  };
}
