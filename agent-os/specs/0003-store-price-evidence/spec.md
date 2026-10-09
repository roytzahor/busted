---
id: "0003"
title: "Store price comes from the page's structured data before regex or the model's guess, measured against hand-labelled truth"
status: verified
risk: high
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [eval/gates, eval/fixtures, scraping/provider-chain, ai/cache-backcompat, sdd/constitution]
superseded_by: ""
---

# 0003 — Store price from evidence

## Problem

The store price drives every savings figure the offer shows (spec 0002), and
it is the input the matcher scores against. Today it comes from the weakest
available source, and nothing measures how often it is wrong:

- **The regex reads policy text as a price.** On
  `real-agas-tamar-in-between-ring` (a legit jewellery brand) the product sells
  for **₪3,122**. `detectPriceInMarkdown` returned **$30**, the cancellation
  fee in the refund policy ("עמלת ביטול בסך $30"). The page's own JSON-LD
  said 3121.92 ILS.
- **The model echoes the error.** That fixture's cached AI response has
  `estimatedStorePriceUsd: 30`. The route prefers the AI estimate over every
  scraped value (`app/api/analyze/route.ts:244-251, 990`), so the wrong number
  wins either way.
- **Structured data is parsed, then dropped.** `extractJsonLd` already reads
  `lowestPrice` and `currency` (`lib/scraping/extract-jsonld.ts:199-207`), but
  `extractProductAttributes` keeps only name, description and image
  (`lib/scraping/extract-product.ts:88-95`). `og:price:amount` /
  `og:price:currency` meta tags, which Shopify themes emit, are never read.
  Of the 13 real fixtures, 10 are Shopify.
- **Unmeasurable today.** `truth.json` has no price field, and the eval
  replays the stored `detectedStorePriceUsd` (lessons 2026-07-25), so no price
  change can show a number. A hand survey of the 13 real fixtures (2026-10-09)
  found:
  - Regex: correct on 3 of the 4 labelled product pages, and it returned a
    price on 5 of the 8 pages that have no single product price (homepages
    and collections).
  - Structured data: present on 4 product pages, and correct on every one
    where it exists.

## Goals

- A hand-labelled store-price truth for the real fixtures, and an offline
  eval that scores every price source against it.
- The resolved store price prefers the page's own structured data, and the
  number proves the change is better, not merely different.

## Non-goals

- Fixing prices on pages that have no single product price (homepages,
  collections). The eval will report those false prices per source. Gating
  price by page type is a separate spec once the eval shows its size.
- Shopify's `/products/<handle>.js` endpoint. It is probably the strongest
  source for 10/13 of the corpus, but it cannot be exercised from the build
  sandbox (egress policy) and needs a live capture to verify. That is the next
  spec, now measurable thanks to this one.
- Brand / GTIN / SKU for matching. The survey found 0 GTINs and a placeholder
  brand ("My Store") in the corpus, so it is not worth building yet.
- Rewriting stored fixture prices. `run-fixtures.ts` keeps replaying them, and
  this spec measures the extractor directly, per lessons 2026-07-25.
- **The verdict path and the matcher.** The verdict prompt receives
  `detectedStorePriceUsd`. It has a few-shot example built on agas-tamar's
  wrong "$30", and rule 15 reads a null price as a dropship signal. Feeding it
  the structured price is a prompt-input change that needs `npm run eval:model`
  (live, with credentials). The matcher's price term has the same problem with
  a stored-price replay. Both stay on the regex price here. Moving them is the
  next spec, with its live measurement.

## Requirements

- **REQ-1** — Fixture truth shall support a hand-labelled `expectedStorePrice`:
  `{ amount, currency }` for a product page, or `null` for a page with no single
  product price. Each real fixture shall be labelled, or explicitly marked
  unlabelled with a reason.
- **REQ-2** — The system shall extract a structured store price from the page
  HTML: `og:price` / `product:price` meta tags first, then a JSON-LD Product
  offer. It shall return amount, currency and USD amount, and `null` when the
  currency is not one we can convert.
- **REQ-3** — If structured extraction meets malformed or hostile HTML, then it
  shall return `null` and never throw.
- **REQ-4** — When a structured price exists, the scrape shall record it
  alongside the regex price (amount, currency, USD, and source `meta` or
  `jsonld`). The regex `detectedStorePriceUsd`, which the verdict prompt and
  the matcher consume, shall be unchanged, so the verdict path does not move.
- **REQ-5** — The store price the product **shows and claims** shall be the
  structured price when present, else the AI estimate, else unknown. The regex
  price no longer feeds a claim. Cached scrapes without structured fields
  resolve to the AI estimate or unknown.
- **REQ-6** — The system shall provide `npm run eval:price`. It reports, per
  source (structured, regex, AI estimate, old resolution, new resolution),
  correct prices, wrong prices, and false prices on no-price pages against the
  truth, offline, with no API spend. It fails when the new resolution scores
  below the old one.
- **REQ-8** — Every surface that shows or repeats a store price for a stored
  scan shall resolve it through the same rule, from the same persisted fields.
  That covers cache HIT, the verified path, the permalink, trending, featured
  examples, the extension quick-lookup and store pages. No pipeline stage shall
  put a scraped or invented price into the prediction's estimate fields.
- **REQ-7** — Setting `STRUCTURED_PRICE_ENABLED=false` shall restore the old
  behaviour at runtime: no structured extraction, and the AI estimate, else
  the regex price.

## Acceptance criteria

### AC-1 — structured extraction reads meta and JSON-LD

Given HTML with `og:price:amount`/`og:price:currency` in either attribute
order, or `product:price:*`, or a JSON-LD Product with an offer price and
currency, when extracted, then the amount, currency and USD conversion are
returned, and meta wins over JSON-LD. Given an unknown currency, a zero, or a
missing amount, the result is `null`.
Covers: REQ-2
Verify: test __tests__/extract-structured-price.test.ts

### AC-2 — never throws

Given malformed JSON-LD, absurd numbers, or 1 MB of junk, when extracted,
then the result is `null` and no exception escapes.
Covers: REQ-3
Verify: test __tests__/extract-structured-price.test.ts

### AC-3 — the resolution order, and the switch

Given `{ structured: 843.76, ai: 30, regex: 30 }`, the resolved price is
843.76. Given `{ structured: null, ai: 44.55, regex: 44.59 }` it is 44.55.
Given `{ structured: null, ai: null, regex: 53.78 }` it is unknown (`null`).
That is a homepage's random product price, and it no longer becomes a claim.
Given the kill switch off, the same inputs resolve to `ai ?? regex` (30, 44.55
and 53.78). Given a cached scrape with no structured fields, the structured
input is absent.
Covers: REQ-4, REQ-5, REQ-7
Verify: test __tests__/store-price.test.ts

### AC-4 — scoring is exact about what counts as right

Given truth `{ 3122, ILS }` and a source of $848.37, the price scores correct
(within 2% after FX). $30 scores wrong. Given truth `null` and any price, it
scores a false price. Given truth `null` and `null`, it scores correct.
Covers: REQ-6
Verify: test __tests__/price-eval.test.ts

### AC-5 — the truth exists

Given the real fixtures, each `truth.json` has `expectedStorePrice`, or
`expectedStorePriceUnlabelled` with a reason. Labels were authored by reading
the captured page, not by running an extractor.
Covers: REQ-1
Verify: test __tests__/price-eval.test.ts

### AC-6 — the change is measurably better

Given the labelled corpus, when `npm run eval:price` runs, then the new
resolution has at least as many correct prices as the old one and no new wrong
ones. The per-source table is recorded in the verification log.
Covers: REQ-6, REQ-5
Verify: eval npm run eval:price

### AC-8 — one rule, everywhere, persisted

Given a scrape with a structured price, when it is persisted and parsed back,
then the structured fields survive. No file outside
`lib/analyze/store-price.ts` contains an ad-hoc
`estimatedStorePriceUsd ??` / `detectedStorePriceUsd ??` price fallback.
When Tier-0 fires on a page with a regex price, its prediction carries no
price estimates.
Covers: REQ-8
Verify: test __tests__/store-price-wiring.test.ts

### AC-7 — nothing regresses on the replay

Given the fixture corpus, `npm run eval -- --skip-ai` equals the pre-change
baseline (52/52 verdict, 52/52 supplier, 26/26 shown precision).
Covers: REQ-4
Verify: eval npm run eval -- --skip-ai

## Open questions

- none

## Decisions

- **Meta before JSON-LD.** Shopify's `og:price:amount` is the selected
  variant's current price. JSON-LD `lowestPrice` is the minimum across all
  offers, which can understate a variant product. Both beat regex: in the
  survey, structured sources were never wrong where present.
- **Structured beats the AI estimate; regex no longer feeds a claim.** The
  first draft ordered structured → AI → regex. The eval (2026-10-09) scored it
  7/12, because the regex fallback put random product prices on 3 homepages
  where the AI had correctly said "no price". Structured → AI scores 10/12 with
  0 wrong prices. A missing price costs a savings claim; an invented one
  fabricates it (article I). The AI estimate is no gold standard either: it is
  fed the regex price and echoed agas-tamar's $30. That is why structured data
  outranks it.
- **2% tolerance** absorbs FX-snapshot drift and `.92`-style rounding
  (3121.92 vs ₪3,122) without accepting a wrong product's price.
- **Vivify stays unlabelled.** Its capture shows ₪260 next to ₪250, ₪450–640
  and ₪130 from related products, with no structured data. Guessing a label
  would make the truth the thing under test.
- **What the 10/12 is made of.** The spec-auditor called this out. "Structured
  12/12" is 4 priced product pages plus 8 correct nulls. Of the 4 fixtures that
  improved, structured data fixed one (agas-tamar's wrong $30). The other three
  came from dropping the regex fallback on homepages. Both are real, and the
  second is the bigger effect on this corpus.
- **Findings from the spec-auditor, fixed before merge:**
  - The structured price was never persisted (`toScrapeJson` whitelists
    fields), so a revisit would have shown $30 again.
  - Six display paths bypassed the resolver: quick-lookup, store pages,
    featured examples, the AI-unavailable partial response, and two local
    `resolveStorePrice` wrappers.
  - Tier-0 copied the regex price into `estimatedStorePriceUsd`, and invented
    a 25% supplier price and a 300% markup, so the regex reached claims
    disguised as a model estimate.
  - The meta regex was quadratic on unclosed tags: 21 s on a hostile page,
    now under 500 ms and tested.
  - JSON-LD could return a related product's price, or a minimum across two
    currencies.
  - "1.299" parsed as 1.299.
  - The eval only failed on correct-to-not-correct. It now fails on any
    fixture that gets worse.

  Each fix has a test.
- **Known limits, deliberately not fixed here:**
  - The persisted supplier data has no best-effort flag, so stored-scan
    surfaces cannot exclude best-effort matches from savings. This predates
    the spec.
  - The home "totals" counter sums model estimates across all verdicts. It
    is aggregate with no store named, and is follow-up work.
  - The supplier-marketplace verdict sets its estimate to the page's own
    price. That screen makes no savings claim (markup 0).
  - The verdict sheet's estimate multiplier is covered by spec 0004
    (`≈`, no bar).
- **Kill switch defaults on.** It ships only if AC-6 shows improvement. If the
  eval disagrees, the default flips to off and this spec records why.

## Metrics

- `npm run eval:price` new-resolution accuracy on the labelled corpus. It is
  re-run whenever a fixture is added, and every new real fixture gets an
  `expectedStorePrice` label.
- In production, the share of scans with a `structuredStorePriceSource`
  (`meta` or `jsonld`), from the `scrape:done` service event.
