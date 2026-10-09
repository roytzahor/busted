---
id: "0003"
title: "Store price comes from the page's structured data before regex or the model's guess, measured against hand-labelled truth"
status: draft
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
- **REQ-4** — When a structured price exists, the scraped store price shall be
  the structured price, recorded with source `structured`. Otherwise it shall be
  the regex price, with source `markdown`.
- **REQ-5** — The resolved store price shall be: the structured price when
  present, else the AI estimate, else the regex price. A cached scrape without
  a source field shall resolve exactly as before.
- **REQ-6** — The system shall provide `npm run eval:price`. It reports, per
  source (structured, regex, AI estimate, old resolution, new resolution),
  correct prices, wrong prices, and false prices on no-price pages against the
  truth, offline, with no API spend. It fails when the new resolution scores
  below the old one.
- **REQ-7** — Setting `STRUCTURED_PRICE_ENABLED=false` shall restore the old
  behaviour at runtime: regex only, AI estimate first.

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

### AC-3 — the resolution order, and back-compat

Given `{ source: "structured", detectedUsd: 848, aiUsd: 30 }`, the resolved
price is 848. Given `{ source: "markdown", detectedUsd: 30, aiUsd: 44 }` it is
44 (the old order). Given no source field (older cache), it resolves as before.
Given the kill switch off, a structured source is treated like markdown.
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
- **Structured beats the AI estimate, but the AI beats regex.** On the one
  page where regex found nothing (vivify), the AI estimate was plausible. On
  agas-tamar the AI echoed the regex error. The page's own machine-readable
  price is evidence; the model's number is an estimate. The eval checks the
  order.
- **2% tolerance** absorbs FX-snapshot drift and `.92`-style rounding
  (3121.92 vs ₪3,122) without accepting a wrong product's price.
- **Vivify stays unlabelled.** Its capture shows ₪260 next to ₪250, ₪450–640
  and ₪130 from related products, with no structured data. Guessing a label
  would make the truth the thing under test.
- **Kill switch defaults on.** It ships only if AC-6 shows improvement. If the
  eval disagrees, the default flips to off and this spec records why.

## Metrics

- `npm run eval:price` new-resolution accuracy on the labelled corpus. It is
  re-run whenever a fixture is added, and every new real fixture gets an
  `expectedStorePrice` label.
- In production, the share of scans whose `detectedStorePriceSource` is
  `structured`, from the scrape debug events.
