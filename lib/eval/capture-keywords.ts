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
 * Mirrors production's accumulation and filtering order — NOT its blanket
 * per-attempt error swallowing:
 *  - Tries both of the first two AI keywords AND the title arm
 *    unconditionally, merging every non-empty result via the SAME
 *    mergeAndDeduplicateCandidates find-supplier.ts uses.
 *  - Filters keywords by length BEFORE slicing to the first two, matching
 *    find-supplier.ts's filter-then-slice order.
 *  - Deliberately does NOT copy find-supplier.ts's `catch { return []; }` /
 *    `catch { // swallow and try next fallback }` — swallow-everything is
 *    correct for a live serving path (a fast soft-skip either way), but
 *    wrong for a batch tool writing PERSISTENT fixture data: a transient
 *    network blip or a Firecrawl rate-limit would get silently recorded as
 *    "searched, found nothing", indistinguishable from a genuine empty
 *    result. See shouldSwallow() for the actual classification this file
 *    uses instead — narrower than production on purpose.
 *
 * Deliberately NOT a full port of find-supplier.ts's keyword precedence — no
 * identity/vision keywords, category vocab, locale-aware price bands, or
 * vertical-prior banning, since those need live production context (a
 * resolved category vocab, a learned keyword prior) a fixture capture
 * doesn't have and shouldn't fake.
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
}

/**
 * True only for an error we can POSITIVELY identify as "this specific
 * keyword attempt produced no results" — i.e. an AliExpressSearchError that
 * isn't the one code meaning "credentials aren't configured at all".
 *
 * Two-part classification, both parts load-bearing:
 *
 * 1. Must be an AliExpressSearchError. A plain network/fetch failure (e.g.
 *    a DNS timeout inside api-client.ts's unguarded fetch) or a ScraperError
 *    from the Firecrawl-based scrape fallback (search-scrape-fallback.ts)
 *    is NOT this type — those are unrecognized/unexpected failures, not a
 *    known "this attempt found nothing" outcome, so they are NOT swallowed
 *    here. They propagate to the caller's own try/catch
 *    (capture-fixture.ts / refresh-fixture.ts), which logs a real failure
 *    distinctly from "searched, found nothing".
 *
 * 2. Must NOT be ALIEXPRESS_NOT_CONFIGURED. That's a setup problem (missing
 *    credentials), not a per-keyword result — swallowing it would silently
 *    write every subsequent fixture with candidates: [], instead of failing
 *    loudly the first time someone runs the tool without credentials
 *    configured. Compared against the exported ALIEXPRESS_NOT_CONFIGURED
 *    constant, not an inline string literal: this file already shipped one
 *    bug from matching free-text error MESSAGE content instead of a stable
 *    identifier, and a bare string literal here would have the same failure
 *    mode one type level down (a typo silently misclassifying at runtime
 *    instead of failing to compile).
 */
function shouldSwallow(err: unknown): boolean {
  return err instanceof AliExpressSearchError && err.code !== ALIEXPRESS_NOT_CONFIGURED;
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
      if (!shouldSwallow(err)) throw err;
      // A recognized "this keyword found nothing" outcome. Move on.
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
      if (!shouldSwallow(err)) throw err;
    }
  }

  return {
    keywords: keywordsUsed.length > 0 ? keywordsUsed.join("; ") : titleKeywords,
    candidates,
  };
}
