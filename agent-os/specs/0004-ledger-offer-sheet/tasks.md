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
