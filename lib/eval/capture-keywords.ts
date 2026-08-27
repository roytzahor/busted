/**
 * Keyword strategy for the eval capture/refresh tools.
 *
 * Both scripts/eval/capture-fixture.ts and scripts/eval/refresh-fixture.ts
 * used ONLY extractSearchKeywords(title) — never the AI's own curated
 * aliexpressKeywords, even though production (find-supplier.ts) always tries
 * AI keywords FIRST and falls back to title-derived. Real consequence:
 * real-bleesse-belly-massager's title is literally just the brand name
 * ("Bleesse"), so the title-only search had nothing to search with — while
 * the AI's aliexpressKeywords ("menstrual heating pad", "period pain relief
 * massager") describe what the product actually does. Fixtures captured with
 * the weaker strategy don't reflect what a real user's scan would surface,
 * which understates real supplier-match accuracy in the eval corpus.
 *
 * Deliberately NOT a full port of find-supplier.ts's precedence — no
 * identity/vision keywords, category vocab, or vertical-prior banning, since
 * those need live production context (a resolved category vocab, a learned
 * keyword prior) a fixture capture doesn't have and shouldn't fake. This
 * covers the two arms that matter for fixture fidelity: AI keywords, then
 * title, in the order production actually tries them.
 */
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

export interface KeywordSearchOutcome {
  /** The keyword string that actually produced results (or the last one
   *  tried, if none did) — recorded into FixtureAliExpress.keywords so the
   *  fixture is honest about what was searched. */
  keywords: string;
  candidates: AliExpressProductCandidate[];
}

export async function searchWithAiKeywordsFirst(
  effectiveTitle: string,
  aiKeywords: string[] | undefined,
  searchFn: (keywords: string) => Promise<AliExpressProductCandidate[]>,
): Promise<KeywordSearchOutcome> {
  const titleKeywords = extractSearchKeywords(effectiveTitle);
  let lastTried = titleKeywords;

  for (const kw of (aiKeywords ?? []).slice(0, 2)) {
    if (!kw || kw.trim().length <= 3) continue;
    lastTried = kw;
    try {
      const candidates = await searchFn(kw);
      if (candidates.length > 0) return { keywords: kw, candidates };
    } catch {
      // This exact keyword found nothing (the AliExpress affiliate API
      // throws rather than returning [] on a zero-result query) — try the
      // next arm rather than failing the whole capture.
    }
  }

  if (titleKeywords.trim()) {
    try {
      const candidates = await searchFn(titleKeywords);
      if (candidates.length > 0) return { keywords: titleKeywords, candidates };
    } catch {
      // fall through — every arm found nothing
    }
  }

  return { keywords: lastTried, candidates: [] };
}
