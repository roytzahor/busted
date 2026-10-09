/**
 * The one store-price resolution rule — spec 0003.
 *
 * This is the price the product SHOWS and CLAIMS savings against. Before this
 * module the rule (AI estimate ?? regex ?? 0) was copied into the analyze
 * route twice, the permalink loader and the trending route; every caller now
 * asks here.
 *
 * Order, and why (scored by `npm run eval:price` against hand-labelled truth):
 *   1. The **structured** price (og:price / JSON-LD) — the page's own
 *      machine-readable number. Evidence. 12/12 where present or absent.
 *   2. The AI estimate — an estimate, and one that is fed the regex price (it
 *      echoed agas-tamar's $30 cancellation fee), but it correctly says "no
 *      price" on most homepages.
 *   3. Nothing. The regex price no longer feeds a claim: as a fallback it put a
 *      random product's price on 3 homepages (7/12 vs 10/12 without it). A
 *      missing price costs a savings claim; an invented one fabricates it.
 *
 * NOT the verdict prompt's or the matcher's input — those still read the regex
 * `detectedStorePriceUsd` until a live eval clears moving them (spec 0003
 * non-goals).
 */

/**
 * Runtime kill switch (default on). Off restores the pre-0003 behaviour: no
 * structured extraction, AI estimate else regex. Read at call time, never
 * cached at import, so an env flip takes effect without a deploy.
 */
export function isStructuredPriceEnabled(): boolean {
  return process.env.STRUCTURED_PRICE_ENABLED !== "false";
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolved store price in USD, or null when nothing credible exists. Callers
 * that need the legacy "0 = unknown" sentinel apply `?? 0`.
 */
export function resolveStorePriceUsd(
  input: {
    structuredUsd?: number | null;
    aiEstimateUsd: number | null | undefined;
    regexUsd: number | null | undefined;
  },
  structuredEnabled: boolean = isStructuredPriceEnabled(),
): number | null {
  if (!structuredEnabled) {
    return positive(input.aiEstimateUsd) ?? positive(input.regexUsd);
  }
  return positive(input.structuredUsd) ?? positive(input.aiEstimateUsd);
}
