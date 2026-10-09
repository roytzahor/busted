---
spec: "0004"
updated: 2026-10-09
---

# 0004 — Plan

## Approach

1. **Mapper** — `map-response.ts` passes `dropshipPrediction` into the
   comparison on the `full` path. `ProductComparisonResult` gains an optional
   `dropshipPrediction` field.
2. **VerdictSheet** gains an optional
   `observed: { storeUsd, supplierUsd, confirmed }`. This was amended after
   the audit; `confirmed` hedges a likely match.
   - With `observed`, the multiplier and the bar come from those two prices,
     and the stamp reads `BUSTED ×N`.
   - Without it, the multiplier comes from the model estimates and is printed
     `≈×N`. The bar does not render, and the stamp reads plain `BUSTED`. A
     figure we did not observe does not get stamped.
   - The verdict-only view (`dropship-analysis-results.tsx`) passes nothing
     and gets the estimate behaviour automatically.
3. **AnalysisResults** is rebuilt in DOM order. It renders the whole thing
   inside `SilentBoundary` and takes all wording from `buildOfferView()`:
   1. `VerdictSheet` with `observed` set when the offer has a claimable
      saving: same product, both prices known, supplier cheaper.
   2. The offer header line: 0002's tier wording ("overcharging" at flame,
      "dropship signals" at amber, and so on) plus "N% cheaper".
   3. The supplier card, on `<Paper>` when `matchKind === "same"` and on a
      bordered room surface otherwise. It shows the label, image, title,
      price, variant chip, landed-cost line, reported trust metrics and the
      variant warning.
   4. The uncertainty prose (§8.3), unchanged from 0002.
   5. The CTA container (`data-affiliate-cta`): disclosure, a plain `success`
      fill button with no glow and no shadow, and Share as a secondary action.
   6. `MatchFeedback`.

   The sticky bar, the hero banner, the gradient text, the glow and shine,
   and the blur blobs are deleted. The `IntersectionObserver` effect goes
   with the sticky bar, so the component no longer needs `useRef`/`useEffect`.
4. **Preview** — `app/dev-monitor/design/page.tsx`, already gated by
   `isDevMonitorAllowed()`, gets flame, amber, likely and closest offer
   fixtures, so Playwright can screenshot them with no DB and no API.

## Constitution check

| Article | Result | Notes |
|---|---|---|
| I. Precision over recall | pass | estimates are marked `≈` and never drawn; the stamp carries a figure only when observed; uncertain matches get no paper |
| II. Enforced in code | pass | DOM order, the absence of a sticky CTA, the absence of retired surfaces and the observed-only bar are all asserted by render tests |
| III. Affiliate neutrality | pass | the money link moves last in DOM order, below the reasoning; one CTA, disclosed in its container; it is no longer louder than the verdict |
| IV. Measured, not asserted | pass | render tests plus browser screenshots at 2 widths × 2 directions; `eval --skip-ai` no-regression (UI only, so no eval number can move). Production metric: CTR and 👎 rate on shown offers |
| V. Enhancements never break a scan | n/a | presentation only |
| VI. Public accusation gated | n/a | |
| VII. One fact, one owner | pass | tier wording stays in `VerdictSheet`, offer wording stays in `buildOfferView()`; no second sheet component |
| VIII. Design is derived | pass | the purpose of the spec: DESIGN §5.2/§5.3/§8 applied to the last legacy result surface |
| IX. Smallest correct change | pass | reuses `VerdictSheet`, `MarkupBar`, `Paper`, `Stamp` and `SilentBoundary`; the `globals.css` sweep is left to Phase 6's last step |

## Files touched

| File | Change |
|---|---|
| `lib/mock-data.ts` | `ProductComparisonResult.dropshipPrediction?` |
| `lib/analyze/map-response.ts` | pass the prediction through on `full` |
| `components/verdict-sheet.tsx` | `observed` prices; `≈` on estimates; bar and figured stamp only when observed |
| `components/analysis-results.tsx` | rebuilt as the Ledger offer |
| `app/dev-monitor/design/page.tsx` | offer previews for screenshots |
| `components/match-feedback.tsx`, `components/share-button.tsx` | drop `backdrop-blur-sm`: they render inside the offer, and the AC-2 test found the glass there. `right-2` → `end-2` for RTL |
| `__tests__/ledger-offer.test.tsx` | new |
| `__tests__/map-response.test.ts` | AC-5 |
| `__tests__/analysis-results.test.tsx` | sticky-bar assertion → exactly one CTA |

## Data and contracts

`ProductComparisonResult` is client-side and built fresh per response, so it
has no cache shape. `dropshipPrediction` is optional on the type: old
permalinks map fresh from the stored prediction anyway.

## Risks and kill switch

CTR may drop because the CTA moves below the evidence and loses the sticky
bar. That is accepted on purpose (DESIGN §0.3). No kill switch: the rollback
is a revert, as with any presentation change, and DESIGN §10.2 requires each
phase to be revertible on its own, which this one is.

## Verification plan

| AC | Gate | Notes |
|---|---|---|
| AC-1, AC-2, AC-3, AC-4, AC-7 | `npx vitest run __tests__/ledger-offer.test.tsx` | |
| AC-5 | `npx vitest run __tests__/map-response.test.ts` | |
| AC-6 | Playwright screenshots of `/dev-monitor/design`: 390 and 1280 px, LTR and RTL | attached to the PR |
| all | lint, clean tsc, `npm test`, build, budget, `eval --skip-ai` | |
