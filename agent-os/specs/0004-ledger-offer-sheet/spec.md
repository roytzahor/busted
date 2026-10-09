---
id: "0004"
title: "The offer reads as The Ledger: verdict and evidence on paper first, observed prices on the bar, the money link last"
status: in-progress
risk: high
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [design/tokens, design/motion, design/surfaces, trust/presence-tier-contract, trust/affiliate-neutrality, sdd/constitution]
superseded_by: ""
---

# 0004 — The offer as The Ledger

## Problem

A scan *with* a supplier match is the moment the product proves its thesis,
and it is the one result screen still on the retired surfaces.
`components/analysis-results.tsx` renders a glass/bento comparison with
gradient clip-text figures, glow shadows, `shine-top` edges and blur blobs,
every one an anti-goal in `DESIGN.md` §11. The verdict itself
never appears. `map-response.ts` drops `dropshipPrediction` on the `full` path,
so the user sees a price comparison with no reasoning, no evidence and no
markup bar. The bar is the design's signature, and it renders only on scans
with *no* match. DESIGN.md Phase 6 lists exactly this as open work.

Three trust rules are broken outright:

- **§8.1 — the money link never precedes the reasoning.** The sticky mobile
  buy bar is an affiliate CTA pinned over the content before the user reaches
  any reasoning. `DESIGN.md` §11 rejects it by name ("A sticky or
  above-the-fold affiliate CTA"). Spec 0002 kept it, disclosed; it goes now.
- **§8.2 — the CTA is never louder than the verdict.** The CTA carries
  `glow-success` and a large green shadow. The verdict is absent.
- **The bar's own rule.** `components/ui/markup-bar.tsx` says "never draw a
  measurement from an estimate". Yet `verdict-sheet.tsx` feeds it the model's
  `estimatedStorePriceUsd` / `estimatedSupplierPriceUsd`, and prints a flame
  multiplier from the same estimates without the `≈` that §8.4 requires on a
  derived figure. When a real match exists we have **observed** prices: the
  resolved store price (spec 0003) and the matched listing's price. The sheet
  ignores them.

## Goals

- A matched scan at flame or amber reads, in DOM order:
  1. the verdict sheet (paper) with the bar drawn from observed prices
  2. the evidence
  3. the uncertainty prose, if any
  4. the supplier listing
  5. the disclosure and the CTA, last
- Figures from observed prices print plainly. Figures from estimates carry `≈`
  and never draw the bar.
- No retired surface remains on the result screen.

## Non-goals

- Changing any honesty rule from spec 0002. The view model
  (`buildOfferView`) is the contract, and this spec only changes how it looks.
  0002's tests keep passing. The one exception is the assertion that pinned
  the sticky bar this spec removes (two sponsored links become one).
- The choreographed entry sequence (count-up synchronised to `bar-draw`,
  stamp landing) — DESIGN §5.2's timing table. The static final state ships
  first. Motion is a follow-up, revertible on its own.
- The OG card and the chain-of-custody pipeline log (also Phase 6). They are
  separate surfaces with separate verification.
- Deleting `.glass` / `.glow-*` / `.shine-top` from `globals.css`. Other
  components still reference them, and that sweep is Phase 6's last step.

## Requirements

- **REQ-1** — When a matched scan is flame or amber, the result shall render
  the verdict sheet before any supplier listing or link, and the affiliate
  link shall be the last interactive element of the offer in DOM order.
- **REQ-2** — The system shall render no sticky or fixed-position affiliate
  CTA on a result.
- **REQ-3** — When both the store price and the matched supplier price are
  observed, and the match is not best-effort, the sheet's multiplier and bar
  shall be computed from those two prices. The multiplier shall print without
  `≈`.
- **REQ-4** — When only model estimates exist, the multiplier shall carry `≈`,
  the bar shall not render (as the bar's own rule requires), and the stamp
  shall read plain `BUSTED` with no figure.
- **REQ-5** — The offer shall use no retired surface: no `glass`,
  `glow-*`, `shine-top`, `backdrop-blur`, gradient clip-text, or `blur-3xl` decoration.
- **REQ-6** — The CTA shall be a plain fill at no larger type than the
  verdict line.
- **REQ-7** — The mapper shall pass `dropshipPrediction` through on the `full`
  path, unchanged, so the sheet can state the verdict and its evidence.
- **REQ-8** — The supplier card shall render on paper only for a confirmed
  (`same`) match. A `likely` or `closest` match renders on a plain room surface.

## Acceptance criteria

### AC-1 — reading order is the trust argument

Given a flame comparison with reasoning signals and a CTA, when rendered, then
in the markup the verdict sheet (`aria-labelledby="verdict-heading"`) and
"what we found" come before the supplier title, and the single sponsored
anchor comes after both. There is exactly one sponsored anchor.
Covers: REQ-1, REQ-2
Verify: test __tests__/ledger-offer.test.tsx

### AC-2 — no sticky CTA, no retired surfaces

Given flame and amber comparisons, when rendered, then the markup contains no
`fixed` positioning, `glass`, `glow-`, `shine-top`, `backdrop-blur`,
`bg-clip-text`, `blur-3xl`, and no `bg-gradient-to-`.
Covers: REQ-2, REQ-5, REQ-6
Verify: test __tests__/ledger-offer.test.tsx

### AC-3 — observed prices draw the bar, plainly

Given a flame comparison with store $59.99 and a matched supplier at $12.50,
when rendered, then the multiplier reads `×4.8` with no `≈`, and the bar's
label says the supplier price is 21% of retail. This holds even when the
model's estimates say otherwise (store 99, supplier 5).
Covers: REQ-3, REQ-7
Verify: test __tests__/ledger-offer.test.tsx

### AC-4 — estimates are marked and never drawn

Given a flame verdict with no matched price (the verdict-only view) whose
model estimates give ×8.7, when the sheet renders, then the figure reads
`≈×8.7`, no bar (`role="img"`) renders, and the stamp reads `BUSTED` with no
figure. Given a best-effort match with
known prices, the bar does not render either: a different product's price
is not a measurement.
Covers: REQ-3, REQ-4
Verify: test __tests__/ledger-offer.test.tsx

### AC-7 — only a confirmed match gets paper

Given a `same` match, the supplier card renders inside a `data-slot="paper"`
element. Given a `likely` or `closest` match, it does not.
Covers: REQ-8
Verify: test __tests__/ledger-offer.test.tsx

### AC-5 — the mapper carries the verdict

Given a flame success response with a match, when mapped, then
`comparison.dropshipPrediction` deep-equals the response's prediction.
Covers: REQ-7
Verify: test __tests__/map-response.test.ts

### AC-6 — it looks right

Given the design preview at `/dev-monitor/design`, when screenshotted in
Chromium at 390px and 1280px, LTR and RTL, flame and amber, then:
- the sheet sits above the listing
- the bar is visible and to scale
- nothing overlaps
- the CTA is the last thing in the offer

The screenshots are attached to the PR.
Covers: REQ-1, REQ-5, REQ-6
Verify: manual Playwright screenshots of /dev-monitor/design at 390px and 1280px, LTR and RTL

## Open questions

- none

## Decisions

- **Reuse, don't fork, the verdict sheet.** `VerdictSheet` already owns tier
  wording, torn paper, the stamp and the evidence lists. It gains an optional
  `observed` price pair. The offer renders it and then the listing below it.
  A second "sheet" component would split the tier rules across two files.
- **Estimates lose the bar on the verdict-only view too.** That changes a
  shipped screen. The rule is the bar component's own ("never draw a
  measurement from an estimate"), and §8.4 requires `≈` on a derived figure.
  When the code contradicts its own stated rule, the rule wins
  (`git/branching-and-commits`).
- **The sticky bar is removed, not hidden.** A hidden-on-scroll CTA is still
  a CTA that precedes the reasoning on first paint for anyone who scrolls.
- **The supplier card is on paper only when the match is confirmed.** §4.1
  lists "the supplier card" among the paper facts, and its corollary says "if
  a claim is uncertain, it does not get a sheet". A `same` match (Gold Path or
  image-confirmed high) is a fact we stand behind, so it goes on paper. A
  `likely` or `closest` match is a claim we hedge, so it sits in the room on a
  plain bordered surface, with the uncertainty as prose beside it (§8.3).
  The first draft of this spec put every listing in the room. It
  misremembered §4.1 and was corrected before implementation.

## Metrics

- Affiliate CTR on shown offers before and after. It may dip once the CTA moves
  below the reasoning, and that is the trade §0.3 makes on purpose.
- 👎 rate on shown offers. If the evidence shows first, users should challenge
  fewer matches.
