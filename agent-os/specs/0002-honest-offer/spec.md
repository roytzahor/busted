---
id: "0002"
title: "Honest alternative offer: no invented numbers, no unearned claims, disclosure at every CTA"
status: verified
risk: high
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [trust/affiliate-neutrality, trust/presence-tier-contract, design/tokens, sdd/constitution]
superseded_by: ""
---

# 0002 — Honest alternative offer

## Problem

The supplier offer is the moment Busted earns money, and today it says things
the engine never established:

- **Invented store price.** When the store price is unknown,
  `lib/analyze/map-response.ts:148` substitutes AliExpress's own crossed-out
  "original" price, or failing that **4× the supplier price**, then computes a
  savings figure from it. The route also turns an unknown price into `0`
  (`app/api/analyze/route.ts:990`), so the hero can read "They're overcharging
  you $0 · Save 0%" above a "Buy Original … & Save" button.
- **Invented trust data.** `map-response.ts:170-172` defaults
  `orderCount=1000`, `sellerRating=4.8` and `shippingDays=14`, and the card and
  CTA print them as fact ("1k+ orders sold · 4.8★ seller rating"). eBay and
  Amazon fallback matches never carry these fields
  (`lib/supplier/fallback-match.ts`), so every one of them shows fabricated
  numbers.
- **Accusations on legit stores.** Supplier search runs for every verdict except
  not_a_product, insufficient_evidence and collection_page
  (`lib/services/supplier-match/index.ts:70`). A `legit` verdict with a match
  therefore renders the full comparison, with "Overpriced Store Product",
  "Dropship markup detected" and "They're overcharging you". The comparison
  never receives `presenceTier`, because `map-response.ts` drops it on the
  `full` path. This breaks `trust/presence-tier-contract` on a real brand's page.
- **Unearned identity claims.** The supplier card is always labelled
  "Original {network} Supplier" with the static badge "Verified original
  supplier — we got you" (`components/analysis-results.tsx:246,680`), even for a
  33% "low" match. We never know a listing is the *original* supplier.
- **Mislabelled figure.** The big number is
  `savings / store price` but is captioned "markup detected" (`:200-203`). A
  $100 item sourced at $20 is an 80% saving and a 400% markup.
- **Disclosure gaps.** The sticky mobile buy bar (`:416-442`) and every browse
  card (`components/browse-analysis-results.tsx:218-234`) render an affiliate
  link with no disclosure in their CTA container. A missing affiliate URL
  becomes `href="#"` (`map-response.ts:173`).

## Goals

- Every number on the offer comes from the page or the supplier API. When
  one is unknown, it is absent, not estimated.
- Every claim on the offer is one the engine supports at the tier it computed.
- Every affiliate CTA carries its disclosure and `rel="sponsored"` inside its own
  container, before the button.

## Non-goals

- Changing which candidate wins, any threshold, or the verdict. This spec
  changes only what the result view is allowed to *say* about a result it is
  given. Matching changes belong to 0003.
- Choosing between the AI-estimated and the scraped store price
  (`route.ts:244,990`). Which source is more accurate is an eval question.
  0003 adds structured (JSON-LD) price as the stronger source.
- Redesigning the comparison into The Ledger (DESIGN.md). That is visual work
  on top of the honest model this spec creates, and is a separate spec.
- The extension, which renders `presenceTier` verbatim and shows no offer card.

## Requirements

- **REQ-1** — When a scan's `presenceTier` is `silent` or missing, the system
  shall render no comparison card, no supplier price, no savings, no trust
  metrics and no affiliate link: at most one muted line (the store's own title
  and price, the same quiet line the verdict-only view uses).
- **REQ-2** — The system shall display supplier order count, seller rating and
  shipping time only when the supplier source provided that value.
- **REQ-3** — If the store price is unknown (missing or ≤ 0), then the system
  shall not substitute any estimate for it.
- **REQ-4** — The system shall state a savings amount, a savings percentage, an
  "overcharging" or a "markup" claim only when both prices are known, the
  supplier price is strictly lower, and the match is not best-effort. The price
  of a *different* product is not a saving.
- **REQ-5** — The system shall call a listing "the same product" only when the
  match is confirmed: a Verified Product Map hit, or `high` quality with
  positive image verification. It shall call an unconfirmed confident match a
  "likely match" and a best-effort one the "closest match". It shall never
  claim a listing is the "original supplier".
- **REQ-6** — The system shall use dropship-accusation wording ("markup
  detected", "overcharging") only at `flame`. At `amber` it shall say "dropship
  signals".
- **REQ-7** — Every rendered affiliate link shall carry
  `rel="noopener noreferrer sponsored"`, and shall have the affiliate
  disclosure rendered inside its CTA container, before the link. This covers
  the main CTA, the sticky mobile bar and browse cards.
- **REQ-8** — If no real destination URL exists, or both prices are known and
  the supplier is not cheaper, then the system shall render no affiliate link.
  A link with no benefit to the user only earns us money.
- **REQ-9** — The headline percentage shall be labelled as how much cheaper the
  listing is, never as markup.
- **REQ-10** — When a scan with a supplier match is `silent`, the response
  mapper shall produce the verdict-only result, which has its own silent
  presentation, and no comparison object. Surfaces that repeat a stored
  scan's savings shall do so only for a scan whose tier speaks and only from a
  real delta: the home-page trending grid, and the share or OG card with its
  struck-through store price.

## Acceptance criteria

### AC-1 — silent shows no offer

Given a comparison whose tier is `silent` (a `legit` verdict with a confident
match), when the result view renders, then the markup contains no
`<a … sponsored>`, no supplier price and no savings figure, and does contain
the store title as one muted line. A comparison with no tier at all renders the
same way.
Covers: REQ-1
Verify: test __tests__/analysis-results.test.tsx

### AC-2 — the view model refuses to invent

Given a supplier with no order count, rating or shipping days, and a store
price of `0`, `null` or `undefined`, when the offer view is built, then trust
metrics are absent, the store price is unknown, savings and savings percent are
`null`, and no estimate (4× supplier price, AliExpress original price) appears
anywhere in the output.
Covers: REQ-2, REQ-3, REQ-4
Verify: test __tests__/offer-view.test.ts

### AC-3 — savings only from a real, positive delta

Given known prices where the supplier is cheaper, when built, then savings
equal the difference and the percentage is `round(savings / store × 100)`.
Given equal prices, a pricier supplier, or a best-effort match, then savings
are `null`, not `0`.
Covers: REQ-4, REQ-9
Verify: test __tests__/offer-view.test.ts

### AC-4 — identity wording follows the evidence

Given a Gold Path hit, or a `high` match with image score ≥ 0.7 and
`sameFunction === true`, then the label says "same product". Given `high`
without image verification, or `medium` or `low`, it says "likely match".
Given best-effort, it says "closest match". No input produces the word
"original" anywhere in the rendered offer.
Covers: REQ-5
Verify: test __tests__/offer-view.test.ts

### AC-5 — accusation wording follows the tier

Given `flame` with a positive delta, then the rendered headline accuses
("overcharging"). Given `amber` with the same prices, then it says "dropship
signals" and does not say "overcharging" or "markup detected".
Covers: REQ-6, REQ-9
Verify: test __tests__/analysis-results.test.tsx

### AC-6 — disclosure precedes every affiliate link

Given a rendered `flame` comparison, the sticky mobile bar, or a browse card,
then every `<a>` whose `rel` contains `sponsored` has the affiliate disclosure
text earlier in the same CTA container.
Covers: REQ-7
Verify: test __tests__/analysis-results.test.tsx

### AC-7 — no placeholder CTA

Given a comparison whose supplier has no affiliate URL and no product URL, or
whose supplier price is not lower than a known store price, when rendered,
then no `href="#"` and no sponsored anchor appear.
Covers: REQ-8
Verify: test __tests__/analysis-results.test.tsx

### AC-9 — silent scans never become a comparison

Given a success response with `presenceTier: "silent"` (or no tier) and a
complete supplier match, when mapped, then the mode is `dropship_only`,
`comparison` is `null`, and the verdict-only result carries the tier. Given
`flame` with a match, then the mode is `full`, the comparison carries the tier,
and it has no invented store price, trust metric, or `#` link.
Covers: REQ-1, REQ-2, REQ-3, REQ-8, REQ-10
Verify: test __tests__/map-response.test.ts

### AC-10 — public surfaces repeat only claimable savings

Given a stored scan whose verdict is `legit`, or is `dropship` below the amber
bar, or has no prediction, when a public surface asks what saving it may
show, then the answer is none. Given a flame or amber scan with a positive
delta, then it is that delta. Given an unknown or non-positive delta, none.
Covers: REQ-10
Verify: test __tests__/offer-view.test.ts

### AC-8 — nothing regresses on the verdict path

Given the fixture corpus, when `npm run eval -- --skip-ai` runs after the
change, then verdict and supplier accuracy equal the pre-change baseline,
because this spec does not touch them.
Covers: REQ-1
Verify: eval npm run eval -- --skip-ai

## Open questions

- none

## Decisions

- **Silent means no offer, even for a cheaper exact match.** On a `legit`
  brand, an AliExpress listing that "matches" is most likely a counterfeit or a
  grey-market reseller. Sending a user there under our name is the precision
  failure the thesis exists to prevent, and the presence contract already
  says `silent` renders one line and no card. Cost: affiliate revenue on legit
  scans. That is accepted: there have been 5 affiliate clicks ever
  (`product/context` question 2), and trust is the asset. Rejected: a neutral
  "cheaper elsewhere" card at silent. It would re-open the verdict the sheet
  just closed, and it recommends a probable knockoff.
- **Unknown is `null`, never `0`.** The view model types savings as
  `number | null`. `0` is a real answer ("same price") and must not mean
  "don't know".
- **Placement of the honesty rules:** a pure `buildOfferView()` in
  `lib/analyze/offer-view.ts`. The component renders what it returns. This
  matches the repo's pattern of keeping trust decisions server-side or pure
  (`computePresenceTier`) and makes them unit-testable without a DOM.
- **Render tests use `react-dom/server`** (already installed). The test
  environment stays `node`, with no jsdom or testing-library dependency.
- No kill switch. Honesty is not a feature to turn off. The rollback is a
  revert.
- **Link with an unknown store price, no link with a known pricier one.**
  With no store price, the user can still compare, and the copy makes no
  saving claim. With a known higher supplier price, the link has no user
  benefit. `trust/affiliate-neutrality`'s "never without a concrete price
  delta" rule is written for the extension (Chrome policy). The web adopts the
  stricter half, and the constitution's article III wording was corrected to
  match its owner.
- **Found by the spec-auditor, deliberately not fixed here:**
  `lib/aliexpress/parse-search-markdown.ts:91` defaults a scraped candidate's
  `sellerRating` to 4.6. That number is invented at the source, so the
  mapper cannot tell. But it also feeds the 15% trust term of
  `computeMatchConfidence`, so removing it changes which candidates clear
  `MATCH_CONFIDENCE_MIN`. That is a matcher change needing a before/after
  measurement on live searches (article IV), so it gets its own spec (0004),
  not a silent edit here.

## Metrics

- Affiliate CTR on shown offers (`lib/clicks.ts` events / offers rendered),
  before and after. It may fall on legit scans. That is the point.
- 👎 "wrong match" rate on shown offers (`MatchFeedback`) should not rise.
- Zero rendered offers with `presenceTier = silent`. Spot-check via `/scan/[id]`
  permalinks of legit scans.
