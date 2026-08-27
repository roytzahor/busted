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
 * Mirrors production's actual accumulation and filtering order, not just
 * ordering:
 *  - Tries both of the first two AI keywords AND the title arm
 *    unconditionally, merging every non-empty result via the SAME
 *    mergeAndDeduplicateCandidates find-supplier.ts uses — reused, not
 *    reimplemented, so the two can't drift on dedup semantics the way
 *    lib/eval/derive-verdict.ts had to be extracted to fix once already.
 *  - Filters keywords by length BEFORE slicing to the first two, matching
 *    find-supplier.ts's filter-then-slice order. Slicing first (as an
 *    earlier version of this file did) can lock onto two short/junk AI
 *    keywords and never reach a longer, useful one further down the array.
 *
 * Deliberately NOT a full port of find-supplier.ts's precedence — no
 * identity/vision keywords, category vocab, locale-aware price bands, or
 * vertical-prior banning, since those need live production context (a
 * resolved category vocab, a learned keyword prior) a fixture capture
 * doesn't have and shouldn't fake.
 */
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { mergeAndDeduplicateCandidates } from "@/lib/aliexpress/find-supplier";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

export interface KeywordSearchOutcome {
  /** Every keyword string that contributed at least one candidate, joined
   *  for the fixture's single `keywords` field — so the fixture is honest
   *  about the full accumulated search, not just the first arm tried. */
  keywords: string;
  candidates: AliExpressProductCandidate[];
}

/**
 * True only for the specific "this exact keyword matched nothing" case the
 * AliExpress affiliate API reports as a thrown error rather than an empty
 * array. Any OTHER error (auth, network, HTTP, a genuinely different query
 * failure) must propagate to the caller — capture-fixture.ts and
 * refresh-fixture.ts both have their own try/catch that logs a real failure
 * distinctly from "searched, found nothing". Swallowing every error here
 * unconditionally would make a real infrastructure failure indistinguishable
 * from a legitimate zero-result search, silently writing an aliexpress.json
 * that LOOKS like it was searched when the search actually errored out.
 */
function isEmptyResultError(err: unknown): boolean {
  return err instanceof Error && /result is empty/i.test(err.message);
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
      if (!isEmptyResultError(err)) throw err;
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
      if (!isEmptyResultError(err)) throw err;
    }
  }

  return {
    keywords: keywordsUsed.length > 0 ? keywordsUsed.join("; ") : titleKeywords,
    candidates,
  };
}
