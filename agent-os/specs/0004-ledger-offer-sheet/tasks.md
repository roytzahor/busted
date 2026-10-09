---
spec: "0004"
updated: 2026-10-09
---

# 0004 — Tasks

- [x] T1 (AC-1, AC-2, AC-3, AC-4, AC-7) — failing render tests in `__tests__/ledger-offer.test.tsx`, tagged
- [x] T2 (AC-5) — failing mapper test; `map-response.ts` and its type pass the prediction through
- [x] T3 (AC-3, AC-4) — `verdict-sheet.tsx`: `observed` prices, `≈` on estimates, observed-only bar and figured stamp
- [x] T4 (AC-1, AC-2, AC-7) — rebuild `analysis-results.tsx` as the Ledger offer; drop glass from `match-feedback`/`share-button`; 0002's sticky-bar assertion → one CTA
- [x] T5 (AC-6) — offer previews in `/dev-monitor/design` (`?only=offers&dir=rtl`); Playwright screenshots at 390 and 1280 px, LTR and RTL; fix the RTL bidi bugs they exposed
- [x] T6 — gates: lint, clean tsc, `npm test`, build, budget, `eval --skip-ai`; record below
- [x] T7 (AC-2, AC-3, AC-8) — act on the spec-auditor (fail):
  - observed prices are never replaced by estimates; under 1.5× or not cheaper, no figure
  - a likely match is hedged: `≈`, ghost bar, no stamp figure
  - no CTA without a verdict
  - "different function" is always prose
  - feedback sits outside the offer region
  - the class scan strips variants and renders every shape
  - added a CTA type-size check
  - RTL `end-2`
  - spec Goals order corrected to match the code
- [x] T8 (AC-6) — re-shoot every shape at 390 and 1280, LTR and RTL; visuals replaced

## Verification log

- 2026-10-09 — new tests before implementation → 6 failing for the defects they name:
  - "expected '…' to contain '×4.8'" (the offer had no sheet)
  - the estimate-only sheet printed `×8.7` and drew a bar from estimates ("Supplier price is 11%")
  - 15 retired-surface classes found (`fixed`, `glow-success`, `shine-top`, `backdrop-blur-*`…)
  - no paper for a confirmed match
- 2026-10-09 — after implementation: ledger-offer + analysis-results + map-response → 24/24
- 2026-10-09 — AC-6, browser check (Chromium via Playwright, `next dev`, `/dev-monitor/design?only=offers`), 4 shapes × {LTR, RTL} × {390, 1280}:
  - no horizontal overflow in any layout
  - 0 fixed-position elements inside the offer
  - in every preview, sheet top < offer heading < sponsored link
  - bar present on flame/amber with observed prices; absent on the best-effort closest match
  - first RTL pass showed bidi bugs: ".here, $7.42 … $64.32", "MATCH · HIGH · IMAGE-VERIFIED 86%", and "8.7×" in the sheet (the last one pre-existing). Fixed with `dir="auto"` on English copy and `<bdi>` on the figure, re-shot, correct.
  - Screenshots are in `visuals/`
  - The only console errors are blocked placeholder images (sandbox egress) and a pre-existing ShareButton hydration mismatch (`data-og-preview` reads `window`), not introduced here.
- 2026-10-09 — spec-auditor → VERDICT fail. Findings:
  - REQ-3 broken under 1.5×: the sheet fell back to `≈×8.7` from estimates beside "20% cheaper".
  - A likely match got a plain figure, a solid bar and a figured stamp.
  - MatchFeedback sat after the CTA inside the region.
  - "Different function" could be hidden.
  - A no-prediction path rendered a CTA with no reasoning.
  - The class scan missed variant prefixes.
  - Physical `right-2` in RTL.

  All were fixed in T7.
- 2026-10-09 — mutation check: restoring the estimate fallback → the "never lets the model's estimate replace observed prices" test fails, showing `≈×19.8` beside "20% cheaper"; restored → passes
- 2026-10-09 — after T7: `npm test` 324/324 (25 files); clean tsc; lint; `sdd:check` 0 errors. 0002's fixture gained a prediction, and its bare `/4\.8/` regex was narrowed to rating context (it matched the legitimate `≈×4.8`); see spec Non-goals.
- 2026-10-09 — T8, browser re-shoot (Chromium, 4 shapes × LTR/RTL × 390/1280):
  - no overflow; 0 fixed elements
  - sheet < offer < link in all 16
  - bar on confirmed (solid), likely (ghost) and amber (ghost); none on closest
  - `visuals/` holds all shapes at 390 in both directions, plus the confirmed shape at 1280 in both directions
- 2026-10-09 — final gates on a clean detached worktree at the head commit:
  - clean `tsc` exit 0; lint exit 0
  - `npm test` 324/324 (25 files)
  - `sdd:check` 0 errors
  - `eval:price` PASS (10/12 vs 6/12)
  - `eval --skip-ai --enforce-cost`: verdict 52/52, supplier 52/52, shown precision 26/26, 0 false fires (identical to baseline; UI-only change)
  - `npm run build` exit 0; `perf:budget` within budget
