---
spec: "0002"
updated: 2026-10-09
---

# 0002 — Tasks

- [x] T1 (AC-8) — baseline: `npm run eval -- --skip-ai`, record numbers
- [x] T2 — vitest JSX runtime so `.test.tsx` can render components (Vite 8 → `oxc.jsx`, not `esbuild.jsx`)
- [x] T3 (AC-2, AC-3, AC-4) — failing tests in `__tests__/offer-view.test.ts`, tagged
- [x] T4 (AC-2, AC-3, AC-4) — `lib/analyze/offer-view.ts`; types in `lib/mock-data.ts`
- [x] T5 (AC-2, AC-9) — failing `__tests__/map-response.test.ts`; then `map-response.ts`: no invented store price or trust data, pass `presenceTier`, silent → verdict-only, null savings
- [x] T6 (AC-1, AC-5, AC-6, AC-7) — failing render tests in `__tests__/analysis-results.test.tsx`, tagged
- [x] T7 (AC-1, AC-5, AC-6, AC-7) — `analysis-results.tsx` from the view model; SilentBoundary; sticky-bar disclosure
- [x] T8 (AC-6) — `browse-analysis-results.tsx`: disclosure in each card's CTA
- [x] T9 — consumers: `bulk-paste.tsx` (null → undefined); tsc clean
- [x] T10 (AC-8) — gates: lint, clean tsc, `npm test`, build, eval after; record below
- [x] T11 (AC-1, AC-4, AC-5, AC-6, AC-7, AC-10) — act on the spec-auditor's findings: amber CTA copy, per-container disclosure test, rendered identity wording, no link to a pricier supplier, bulk-paste `$0`, OG/meta claims, tier-gated trending, skeleton copy
- [x] T12 — re-run all gates after T11; record below

## Verification log

- 2026-10-09 — baseline `eval --skip-ai` (empty .env) → 52 fixtures; verdict 52/52, supplier 52/52; shown-verdict precision 26/26 (flame 22, amber 4); 0 Tier-0 false fires
- 2026-10-09 — new tests before implementation → map-response 3/4 failing ("expected 'full' to be 'dropship_only'", "expected undefined to be 'flame'"), render tests 10/10 failing (2 sponsored anchors at silent, no "dropship signals" at amber, …), offer-view failing on missing module — each for the defect it names
- 2026-10-09 — after implementation: `npx vitest run` offer-view + map-response + analysis-results → 28/28 passed
- 2026-10-09 — `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` → exit 0; `npm run lint` → no errors, no warnings in touched files
- 2026-10-09 — `npm test` → 281/281 passed (17 files)
- 2026-10-09 — `npm run build` → exit 0
- 2026-10-09 — after `eval --skip-ai` → identical to baseline: verdict 52/52, supplier 52/52, shown precision 26/26, 0 false fires (AC-8)
- 2026-10-09 — spec-auditor (read-only, cheaper model) on the diff → VERDICT fail. Its findings:
  - The amber CTA still said "markup".
  - The disclosure test accepted text from any container.
  - The rendered identity wording was untested.
  - Constitution III's delta clause was unjustified.
  - bulk-paste could print `$0`.
  - The OG card and meta made a saving claim on every permalink.
  - Trending advertised savings for silent scans.
  - Skeleton copy said "original supplier".
  - `parse-search-markdown.ts` defaults the rating to 4.6.

  All were fixed in T11 except the 4.6 rating, which is deferred to spec 0004 with the reason in Decisions.
- 2026-10-09 — mutation check: deleting the sticky-bar disclosure → AC-6 test fails ("puts a disclosure before every sponsored link…"); restored → passes
- 2026-10-09 — after T11: `npm test` → 285/285 (18 files); clean tsc exit 0; lint clean on touched files; `npm run build` exit 0; `npm run perf:budget` → within budget (heaviest route /scan/[id] 704.5 KB, +0.6%)
- 2026-10-09 — after T11 `eval --skip-ai` → verdict 52/52, supplier 52/52, shown precision 26/26, 0 false fires — identical to baseline (AC-8)
