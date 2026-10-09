---
spec: "0003"
updated: 2026-10-09
---

# 0003 — Plan

## Approach

1. **Truth first.** Hand-label `expectedStorePrice` on the 13 real fixtures by
   reading the captured page. Each label carries an `expectedStorePriceNote`
   quoting the evidence. Vivify stays unlabelled, with the reason recorded.
2. **Measure.** `lib/eval/price-score.ts` holds the pure scorer (correct,
   wrong, false_price, missed, with 2% tolerance after FX).
   `scripts/eval/price-eval.ts` re-derives every source from `raw.html` and
   `raw.markdown`, not from the stored price, and compares the old rule with
   the new one. It runs offline, so it runs in CI.
3. **Extract.** `lib/scraping/extract-structured-price.ts` reads
   `og:price` / `product:price` meta first, then a JSON-LD offer through the
   existing `extractJsonLd`. It converts to USD with the existing
   `convertToUsd`. It returns null on anything uncertain and never throws.
4. **Record, don't replace.** The scraper service stores the structured price
   *beside* the regex price. `detectedStorePriceUsd` (the verdict prompt input
   and the matcher input) is untouched, so the verdict path cannot move in a
   change that cannot be live-measured here.
5. **One resolver.** `lib/analyze/store-price.ts` `resolveStorePriceUsd()`
   implements structured → AI estimate → unknown, behind
   `STRUCTURED_PRICE_ENABLED`. It replaces four copies of the old rule: the
   route's MISS path, its cache-HIT and verified paths, `lookup-by-id`, and
   trending.

## Constitution check

| Article | Result | Notes |
|---|---|---|
| I. Precision over recall | pass | the regex no longer feeds a claimed price; a missing price withholds a savings claim instead of fabricating one (10/12 vs 7/12 with the fallback) |
| II. Enforced in code | pass | the order is code in one resolver, with tests and a CI eval gate |
| III. Affiliate neutrality | n/a | no ranking or link change |
| IV. Measured, not asserted | pass | `eval:price` before/after on hand-labelled truth: old 6/12 → new 10/12, 0 wrong prices. `eval --skip-ai` is a no-regression check only, since it replays stored prices and cached AI. Not measured: the verdict path and the matcher, which is why neither is touched |
| V. Enhancements never break a scan | pass | the extractor returns null on any failure, with a test on malformed and huge input; the kill switch restores the old rule at runtime |
| VI. Public accusation gated | pass | trending now resolves price through the same rule, still behind spec 0002's tier gate |
| VII. One fact, one owner | pass | every stored-scan reader resolves through `resolveCachedStorePriceUsd()` (route HIT/verified/MISS/partial, permalink, trending, featured, quick-lookup, store pages). A static test fails on any new ad-hoc fallback |
| VIII. Design is derived | n/a | no visual change |
| IX. Smallest correct change | pass | reuses `extractJsonLd` and `convertToUsd`; the regex extractor is left alone |

## Files touched

| File | Change |
|---|---|
| `tests/fixtures/products/real-*/truth.json` | `expectedStorePrice` + evidence note (12), unlabelled reason (1) |
| `tests/eval/fixture-types.ts` | truth fields |
| `lib/eval/price-score.ts`, `scripts/eval/price-eval.ts` | new — scorer and offline eval |
| `lib/scraping/extract-structured-price.ts` | new — meta → JSON-LD extractor |
| `lib/analyze/store-price.ts` | new — the one resolver and the kill switch |
| `lib/services/scraper/index.ts` | record `structuredStorePrice` beside the regex price |
| `lib/types/cache.ts` | optional structured fields with defensive parsing |
| `app/api/analyze/route.ts`, `lib/cache/lookup-by-id.ts`, `app/api/stats/trending/route.ts`, `app/api/examples/featured/route.ts`, `app/api/extension/quick-lookup/route.ts`, `lib/store/report.ts` | resolve through the one rule; public savings via `claimableSavings()` |
| `lib/cache/persist-product.ts` | persist the structured fields (`toScrapeJson` exported for the round-trip test) |
| `lib/tier0/store-fingerprint.ts` | stop writing the regex price, a 25% supplier guess and a 300% markup into the prediction |
| `__tests__/store-price-wiring.test.ts`, `__tests__/scraper-structured-price.test.ts`, `__tests__/extract-structured-price-throw.test.ts` | persistence round-trip, single-owner static gate, Tier-0, scraper switch, guard |
| `package.json`, `.github/workflows/eval.yml` | `eval:price` script and CI gate |
| `__tests__/extract-structured-price.test.ts`, `store-price.test.ts`, `price-eval.test.ts` | new |

## Data and contracts

`CachedScrapeData` gains four optional `structuredStorePrice*` fields.
`parseCachedScrapeData` accepts them only when well-typed and drops anything
malformed. Rows cached earlier parse unchanged and resolve to the AI estimate
or unknown (`ai/cache-backcompat`). `AnalyzeResponse` is unchanged.

## Risks and kill switch

- **Fewer prices shown** where there is neither structured data nor an AI
  estimate. Those offers show the supplier price with no savings claim
  (spec 0002 handles an unknown store price). This is accepted: it is the
  precision-first direction.
- **A theme emitting a wrong og:price.** It was never seen in the corpus. It
  is caught by `eval:price` as new fixtures are labelled.
- **Kill switch:** `STRUCTURED_PRICE_ENABLED=false` skips extraction and
  restores `ai ?? regex` at runtime.

## Verification plan

| AC | Gate | Notes |
|---|---|---|
| AC-1, AC-2 | `npx vitest run __tests__/extract-structured-price.test.ts` | plus a mutation check on meta/JSON-LD precedence |
| AC-3 | `npx vitest run __tests__/store-price.test.ts` | plus a mutation check re-adding the regex fallback |
| AC-4, AC-5 | `npx vitest run __tests__/price-eval.test.ts` | |
| AC-6 | `npm run eval:price` | table recorded in the log |
| AC-7 | `npm run eval -- --skip-ai` | identical to the baseline |
| all | lint, clean tsc, `npm test`, build, budget | |
