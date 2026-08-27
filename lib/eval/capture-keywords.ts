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
 * Mirrors production's actual accumulation, not just its ordering: tries
 * both of the first two AI keywords AND the title arm unconditionally,
 * merging every non-empty result via the SAME mergeAndDeduplicateCandidates
 * find-supplier.ts uses — reused, not reimplemented, so the two can't drift
 * on dedup semantics the way lib/eval/derive-verdict.ts had to be extracted
 * to fix once already on this branch.
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

export async function searchWithAiKeywordsFirst(
  effectiveTitle: string,
  aiKeywords: string[] | undefined,
  searchFn: (keywords: string) => Promise<AliExpressProductCandidate[]>,
): Promise<KeywordSearchOutcome> {
  const titleKeywords = extractSearchKeywords(effectiveTitle);
  let candidates: AliExpressProductCandidate[] = [];
  const keywordsUsed: string[] = [];

  for (const kw of (aiKeywords ?? []).slice(0, 2)) {
    if (!kw || kw.trim().length <= 3) continue;
    try {
      const results = await searchFn(kw);
      if (results.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, results);
        keywordsUsed.push(kw);
      }
    } catch {
      // This exact keyword found nothing (the AliExpress affiliate API
      // throws rather than returning [] on a zero-result query) — try the
      // next arm rather than failing the whole capture.
    }
  }

  if (titleKeywords.trim()) {
    try {
      const results = await searchFn(titleKeywords);
      if (results.length > 0) {
        candidates = mergeAndDeduplicateCandidates(candidates, results);
        keywordsUsed.push(titleKeywords);
      }
    } catch {
      // fall through — every arm found nothing
    }
  }

  return {
    keywords: keywordsUsed.length > 0 ? keywordsUsed.join("; ") : titleKeywords,
    candidates,
  };
}
