# Live URL validation — 2026-08-28

The "100 hand-labeled live URLs" check named in `ROADMAP.md` Phase 2.5 item 3
and `agent-os/product/context.md` open question #1. Run via
`scripts/eval/live-url-validation.ts`, which is separate from the fixture
corpus in `tests/fixtures/products/` on purpose — this is a point-in-time
measurement outside the CI-gated corpus, not a permanent addition to it.

## Result

- 90 candidates (dead 404s dropped from an original 102 during sourcing),
  scraped and verdicted live — no `--skip-ai`, no fixture reuse.
- **Shown-verdict precision: 29/29 = 100%.** Zero false accusations across
  33 major real brands (Nike, Allbirds, Patagonia, Casper, Sephora, Yeti,
  Hydro Flask, Away, Bombas, Theragun, Crocs, Fjällräven, Solo Stove, plus
  Liforme — a real brand deliberately hosted on `myshopify.com` to check the
  platform itself isn't a false signal), dropship-pattern stores, and
  non-product/collection pages.
- Raw verdict accuracy read 72/90 = 80% on the first pass. `2026-08-28-90-urls.json`
  is the unedited script output — `expectedVerdict` there is my a-priori
  label, assigned before seeing what actually got scraped.

## Adjudication

Hand-reviewing every mismatch against the real `markdownExcerpt` in the
results file (not the a-priori label) found 16 of 18 mismatches were errors
in my labeling, not the model's:

| id | my label said | actual verdict | why the actual verdict was right |
| --- | --- | --- | --- |
| val-ds-002, 026, 039, 040 | dropship | not_a_product | store had closed since being sourced (Shopify "store unavailable" page) |
| val-ds-047, 031, 032, 034, 038, 054 | dropship | not_a_product / collection_page | homepage is a genuine multi-product catalog, not the single product I assumed |
| val-ds-051 | dropship | legit | Geepas is a real registered appliance brand (2-yr warranty) — I labeled by product category without recognizing the brand |
| val-legit-003, 004 | legit | collection_page | the sourced URL resolved to a category page, not the specific product |
| val-coll-002, 005, 006 | legit / dropship | collection_page | pre-flagged in the candidate notes as taxonomy placeholders, not real mismatches |

That leaves two genuine cases:

- **val-ds-013** (balancedbayou "THE YOGI" yoga mat) — model said `legit`
  0.85. Scraped content shows a multi-category boutique ("Louisiana Proud",
  a real content blog) — genuinely ambiguous, excluded from the corrected
  tally rather than scored either way.
- **val-ds-030** (the-dooloop, single-SKU novelty dog-leash gadget) — model
  said `legit` 0.88. Matches the D2C-polished-single-product pattern; a
  plausible miss, not provably confirmed. Counted against the model.

**Corrected verdict accuracy: 87/88 = 98.9%** (excluding the ambiguous case,
counting the plausible miss as wrong).

## Why this doesn't get folded into the fixture corpus

Folding 90 hand-labeled-by-one-person URLs straight into the CI-gated
corpus would let a single afternoon's labeling errors silently become the
new ground truth. This run's own adjudication table is the reason: 16 of 18
"failures" were my mistakes, not the model's. The script and the raw/corrected
results stay here as a re-runnable, inspectable record; promoting any
individual URL into `tests/fixtures/products/` is a separate, deliberate
decision per CLAUDE.md's rule that fixture `truth.json` files are hand-edited,
never trusted from an auto-stub.
