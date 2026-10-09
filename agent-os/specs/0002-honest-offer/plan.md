---
spec: "0002"
updated: 2026-10-09
---

# 0002 — Plan

## Approach

Split *what we may say* from *how it looks*.

1. **`lib/analyze/offer-view.ts` — `buildOfferView(comparison)`**, a pure function
   that turns a `ProductComparisonResult` into the only facts the view may
   render. It returns:
   - `show` (the tier gate)
   - `tier`
   - `matchKind`: `same` | `likely` | `closest`
   - `storePriceUsd` and `supplierPriceUsd` (`number | null`)
   - `savingsUsd` and `savingsPercent` (`number | null`)
   - `trust`: only the metrics that are present
   - `cta`: an href, or `null`
   - `accusation`: `flame` | `amber` | `none`

   It encodes every rule in REQ-1 to REQ-9 once.
2. **`map-response.ts`** stops inventing. It drops the `?? originalPriceUsd ??
   priceUsd*4` chain and the `1000 / 4.8 / 14` defaults. It computes savings
   only from a positive known delta, as `null` otherwise, and passes
   `presenceTier` through on the `full` path. An older cached response without
   the field reads as `silent`, the same pass-through rule the `dropship_only`
   path already uses.
3. **`components/analysis-results.tsx`** renders from the view model:
   - The whole decorated comparison goes inside `<SilentBoundary>`, with a quiet
     line, following the pattern in `dropship-analysis-results.tsx`.
   - The copy branches on `matchKind` and `accusation`.
   - Trust badges render only when present.
   - The sticky bar gets the disclosure line.
   - The CTA renders only when `cta` exists.
4. **`components/browse-analysis-results.tsx`**: each `BrowseCard` renders
   `AFFILIATE_DISCLOSURE` (a compact form) above its button.
5. **Types**: `SupplierProduct.orderCount`, `sellerRating` and `shippingDays`
   become optional. `ProductComparisonResult` gains `presenceTier?` and its
   savings fields become `number | null`. Consumers already handle
   `null`/`undefined` (`scan/[id]` uses `?? null`). `bulk-paste` maps `null` to
   `undefined`.
6. **Test harness**: vitest gains `esbuild.jsx: "automatic"` so `.test.tsx`
   files can `renderToStaticMarkup` the real components in the existing `node`
   environment.

## Constitution check

| Article | Result | Notes |
|---|---|---|
| I. Precision over recall | pass | the purpose of the spec: silent shows nothing; a "same product" claim needs confirmation; unknown stays unknown |
| II. Enforced in code | pass | rules live in `buildOfferView()` plus SilentBoundary, not in copy guidelines |
| III. Affiliate neutrality | pass | disclosure before every sponsored link, inside its own `data-affiliate-cta` container, including the two places it was missing. No link when the supplier is known not to be cheaper. Browse cards and unknown-store-price offers keep a disclosed link with no delta: the owner standard's delta rule is extension-scoped, and the constitution wording was corrected. No change to ranking |
| IV. Measured, not asserted | pass | eval `--skip-ai` before/after must be identical (no matcher/verdict change); render tests prove the copy rules; production metric is CTR and 👎 rate on shown offers |
| V. Enhancements never break a scan | n/a | display only; no pipeline stage added |
| VI. Public accusation gated | n/a | `/store/[domain]` untouched; it already gates on tier |
| VII. One fact, one owner | pass | one rule set (`offer-view.ts`); component and permalink page both consume it |
| VIII. Design is derived | pass | accusation wording and tier colour are derived from `presenceTier`; silent gets the quiet line only |
| IX. Smallest correct change | pass | keeps the existing component and layout; the Ledger redesign is explicitly a separate spec |

## Files touched

| File | Change |
|---|---|
| `lib/analyze/offer-view.ts` | new — the honesty rules; `claimableSavings()` for public surfaces |
| `lib/brand.ts` | `AFFILIATE_DISCLOSURE_SHORT` for the sticky bar and browse cards |
| `app/api/stats/trending/route.ts` | tier-gated `claimableSavings()` instead of a raw delta |
| `app/scan/[id]/page.tsx` | OG prices only with a real saving; neutral meta description |
| `components/analysis-skeleton.tsx` | drop "original supplier" copy |
| `lib/analyze/map-response.ts` | stop inventing store price and trust data; pass `presenceTier`; route silent scans to the verdict-only view; savings `null` when unknown |
| `lib/mock-data.ts` | types: optional trust metrics, nullable savings, `presenceTier?` |
| `components/analysis-results.tsx` | render from the view model; SilentBoundary; honest copy; sticky-bar disclosure; no placeholder CTA |
| `components/browse-analysis-results.tsx` | disclosure inside each card's CTA |
| `components/bulk-paste.tsx` | `null` savings → `undefined`; unknown store price is not `$0`; strike-through only with a saving |
| `vitest.config.ts` | automatic JSX runtime for `.test.tsx` (`oxc.jsx` on Vite 8; `esbuild.jsx` is ignored there) |
| `__tests__/offer-view.test.ts`, `__tests__/analysis-results.test.tsx` | new |

## Data and contracts

- `AnalyzeResponse` is unchanged. The server already sends `presenceTier`.
- `ProductComparisonResult` is client-side only, built fresh from each response
  (including `/scan/[id]` via `lookup-by-id.ts`, which also computes
  `presenceTier`), so there is no cached shape to back-fill.
- `StoreProduct.priceUsd = 0` keeps its existing meaning of "unknown" (see
  `dropship-analysis-results.tsx`). The view model maps it to `null`.

## Risks and kill switch

- Fewer offers shown, so fewer affiliate clicks on legit scans. This is
  intended (spec Decisions). No kill switch: re-enabling offers on silent is
  exactly what article I forbids.
- A cached `full` response predating `presenceTier` renders silent. This
  under-claims, which is the safe direction. A re-scan restores it.

## Verification plan

| AC | Gate | Notes |
|---|---|---|
| AC-1, AC-5, AC-6, AC-7 | `npx vitest run __tests__/analysis-results.test.tsx` | real component through `renderToStaticMarkup` |
| AC-2, AC-3, AC-4 | `npx vitest run __tests__/offer-view.test.ts` | pure function |
| AC-8 | `npm run eval -- --skip-ai` before and after | numbers recorded in the log |
| all | lint, clean tsc, `npm test`, `npm run build` | `eval/gates` |
