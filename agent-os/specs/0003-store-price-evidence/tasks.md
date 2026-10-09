---
spec: "0003"
updated: 2026-10-09
---

# 0003 — Tasks

- [x] T1 (AC-5) — hand-label `expectedStorePrice` on the real fixtures from the captured pages; vivify unlabelled with its reason
- [x] T2 (AC-4, AC-6) — `lib/eval/price-score.ts` + `scripts/eval/price-eval.ts`; run to get the numbers that decide the order
- [x] T3 — amend spec REQ-4/REQ-5 from the numbers (regex out of the claim; verdict and matcher inputs untouched) before coding the resolver
- [x] T4 (AC-1, AC-2) — `lib/scraping/extract-structured-price.ts`
- [x] T5 (AC-3) — `lib/analyze/store-price.ts`, the one resolver, plus the kill switch
- [x] T6 (AC-3) — scraper service records the structured price; cache fields with defensive parse; route, permalink and trending resolve through the one rule
- [x] T7 (AC-1…AC-5) — tests, plus mutation checks (written after T4/T5, so mutation, not a red-first run, is the proof they bite)
- [x] T8 (AC-6) — `npm run eval:price` script + CI step
- [x] T9 (AC-7) — gates; record below
- [x] T10 (AC-8) — act on the spec-auditor (fail): persist the structured fields; route every stored-scan reader through one resolver; Tier-0 stops inventing prices; linear meta regex; refuse ambiguous JSON-LD and amounts; rank-based eval gate; tests and mutation checks for each
- [x] T11 — re-run all gates; record below

## Verification log

- 2026-10-09 — survey of the 15 fixtures with HTML: Product JSON-LD on 4, GTIN on 0, a placeholder brand "My Store" on calmo, and og:price on 3 of the 10 Shopify pages. agas-tamar regex = $30 (the refund-policy cancellation fee) vs JSON-LD 3121.92 ILS.
- 2026-10-09 — `npm run eval:price` with the first-draft order (structured → AI → regex): new 7/12 vs old 6/12. 0 wrong prices, but 5 false prices on homepages (3 of them from the regex fallback). This drove the T3 amendment.
- 2026-10-09 — `npm run eval:price` with the shipped order (structured → AI): **new 10/12 vs old 6/12, wrong prices 1 → 0, false prices 5 → 2** (davincified and smartjewelry, both from the AI estimate). By source: structured 12/12, regex 6/12, AI 9/12. PASS. (AC-6)
- 2026-10-09 — mutation checks: re-adding the regex fallback fails "never falls back to the regex"; making JSON-LD win over meta fails "prefers meta over JSON-LD". Both restored and passing.
- 2026-10-09 — `npx vitest run` extract-structured-price + store-price + price-eval → 16/16 passed
- 2026-10-09 — clean `tsc` exit 0; lint clean on touched files; `npm test` → 301/301 (21 files); `npm run build` exit 0; `npm run perf:budget` within budget
- 2026-10-09 — `eval --skip-ai` → verdict 52/52, supplier 52/52, shown precision 26/26, 0 false fires: identical to baseline (AC-7)
- 2026-10-09 — spec-auditor → VERDICT fail. Findings:
  - The structured price was not persisted.
  - Six bypass paths existed.
  - Tier-0 laundered the regex price as an estimate.
  - The meta regex was quadratic.
  - JSON-LD could return a related product's price or a min across currencies.
  - "1.299" was misread.
  - The eval gate was too lenient.

  All were fixed in T10. Labels were spot-checked by the auditor against raw.markdown: agas, calmo, imri, giftorder correct.
- 2026-10-09 — mutation checks after T10:
  - Old `[^>]*` meta regex → the linear test fails (21.4 s vs a 500 ms budget).
  - Removing the try/catch → the guard test fails.
  - Dropping the persisted structured fields → the round-trip test fails.

  All restored and passing.
- 2026-10-09 — `npm run eval:price` after T10 (rank-based gate) → new 10/12 vs old 6/12; wrong 1 → 0; false 5 → 2; PASS
- 2026-10-09 — T11, on a clean detached worktree at the commit (no 0004 work in the tree):
  - clean `tsc` exit 0
  - `npm test` 310/310 (24 files)
  - `sdd:check` 0 errors
  - `eval:price` PASS (10/12 vs 6/12)
  - `eval --skip-ai --enforce-cost`: verdict 52/52, supplier 52/52, shown precision 26/26, 0 Tier-0 false fires. Identical to baseline: the Tier-0 estimate change moved no verdict.
  - `npm run build` exit 0
  - `perf:budget` within budget
