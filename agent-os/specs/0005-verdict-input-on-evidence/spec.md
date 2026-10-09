---
id: "0005"
title: "The verdict prompt and the matcher read evidence: structured price input, a corrected few-shot, no invented seller rating"
status: draft
risk: high
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [ai/verdict-clamps, eval/gates, supplier/match-thresholds, sdd/constitution]
superseded_by: ""
---

# 0005 — Verdict and matcher inputs on evidence

## Problem

Specs 0002 and 0003 made what we **show** honest. Two inputs that *decide*
the verdict and the match still read guesses:

- **The verdict prompt is fed the regex price.** `detectedStorePriceUsd` goes
  into `verifyDropshipLikelihood` (`lib/ai/dropship-verifier.ts`). The prompt's
  own few-shot example for agas-tamar hard-codes the wrong
  `detectedStorePriceUsd: 30` (line ~211). That is a legit ₪3,122 ring taught
  to the model as a $30 item. Rule 15 treats a null price as a dropship
  signal, so the regex's misses also shape verdicts.
- **The matcher scores against the regex price too.** `computeMatchConfidence`'s
  30% price term (`lib/aliexpress/match-confidence.ts`) and the absurd-price
  guard use `storePriceUsd`, which is the regex price.
- **An invented rating feeds the trust term.**
  `lib/aliexpress/parse-search-markdown.ts:91` defaults a scraped candidate's
  `sellerRating` to 4.6. That number enters the matcher's 15% trust term and
  the offer's displayed metrics, where the mapper cannot tell it was made up.
  It was found by the spec-0002 auditor and deferred to here.

Each of these needs a live measurement before it can ship (constitution IV):
the replay eval uses cached AI responses and stored candidate pools, so by
construction it cannot see any of them.

## Goals

- The verdict prompt receives the best evidence price: structured first, regex
  second. The few-shot examples carry correct prices.
- The matcher scores against the same price.
- No candidate metric is defaulted.

## Non-goals

- The resolution of the displayed price (spec 0003, shipped).
- Prompt rules other than the price input and the corrected example.

## Requirements

- **REQ-1** — The verdict prompt's price input shall be the structured price
  when present, else the regex price.
- **REQ-2** — The prompt's few-shot examples shall carry prices consistent
  with their captured pages.
- **REQ-3** — The matcher's price term and absurd-price guard shall use the
  same evidence price as REQ-1.
- **REQ-4** — A scraped supplier candidate with no parsed rating shall carry no
  rating. The trust term shall treat it as unknown, not as 4.6.

## Acceptance criteria

### AC-1 — the live verdict does not regress

Given the real fixtures, `npm run eval:model` before and after shows verdict
accuracy not lower and shown-verdict precision not lower, with the token cost
reported. The numbers are recorded in the log.
Covers: REQ-1, REQ-2
Verify: eval npm run eval:model

### AC-2 — the input is the evidence price

Given a scrape with a structured price of $843.76 and a regex price of $30,
when the verdict input is built, then it carries 843.76.
Covers: REQ-1, REQ-3
Verify: test __tests__/verdict-input.test.ts

### AC-3 — no invented rating

Given scraped search markdown with no rating near a product id, when parsed,
then the candidate's `sellerRating` is absent, and the trust term treats it as
unknown.
Covers: REQ-4
Verify: test __tests__/parse-search-markdown.test.ts

## Open questions

- [NEEDS CLARIFICATION] The live measurements need credentials this cloud
  environment lacks:
  - `GOOGLE_AI_API_KEY` for `eval:model`. The host is reachable.
  - AliExpress and Crawlbase keys for a live matcher check. Those hosts are
    currently blocked by the environment's egress policy.

  The spec stays `draft` until a human adds them. This is a setup action,
  not a product decision.

## Decisions

- The matcher change is bundled with the verdict input so that both read one
  evidence price. Splitting them would leave a window where verdict and match
  disagree about what the store charges.

## Metrics

- `eval:model` verdict accuracy, shown-verdict precision, and cost per scan,
  before and after.
- In production, the 👎 "wrong match" rate on shown offers.
