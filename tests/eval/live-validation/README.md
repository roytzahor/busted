# Live URL validation — 2026-08-28

The "100 hand-labeled live URLs" check named in `ROADMAP.md` Phase 2.5 item 3
and `agent-os/product/context.md` open question #1. Run via
`scripts/eval/live-url-validation.ts`, which is separate from the fixture
corpus in `tests/fixtures/products/` on purpose — this is a point-in-time
measurement outside the CI-gated corpus, not a permanent addition to it.

## Methodology fix mid-run

The first version of the script called `verifyDropshipLikelihood()` directly.
Self-review caught that this skips two things production actually runs on
every scan (`app/api/analyze/route.ts`): the Tier-0 deterministic fingerprint
gate (`lib/tier0/store-fingerprint.ts`) and the vision-grounded product
identifier (`lib/services/product-identifier`), which feeds corroborating
identity into the AI verifier. Since most of the sample is exactly Tier-0's
target pattern (template dropship stores), that mattered — re-running through
the real `scraper → identifier → dropship-verdict` service chain changed
several results, generally for the better (e.g. a single-SKU novelty-gadget
homepage that the simplified pipeline called `legit` was correctly identified
and verdicted `dropship` once the identifier and Tier-0 were in the loop).
The script now calls the same three services the route does.

## Result

- 90 candidates (dead 404s dropped from an original 102 during sourcing).
- 83/90 scraped and verdicted; 7 excluded on a transient Google AI 503
  ("high demand") during the run. This is a real operational gap worth its
  own ticket: only one `GOOGLE_AI_API_KEY` is configured with no fallback
  provider, so a demand spike drops requests rather than failing over.
- **Shown-verdict precision: 28/28 = 100%.** Zero false accusations across
  33 major real brands (Nike, Allbirds, Patagonia, Casper, Sephora, Yeti,
  Hydro Flask, Away, Bombas, Theragun, Crocs, Fjällräven, Solo Stove, plus
  Liforme — a real brand deliberately hosted on `myshopify.com` to check the
  platform itself isn't a false signal), dropship-pattern stores, and
  non-product/collection pages.
- Raw verdict accuracy read 70/83 = 84.3% on the first pass. `2026-08-28-90-urls.json`
  is the unedited script output — `expectedVerdict` there is my a-priori
  label, assigned before seeing what actually got scraped.

## Adjudication

Hand-reviewing every mismatch against the real `markdownExcerpt` and
`identityName` in the results file (not the a-priori label) found 12 of 13
mismatches were errors in my labeling, not the model's:

| id | my label said | actual verdict | why the actual verdict was right |
| --- | --- | --- | --- |
| val-ds-002, 026, 039, 040 | dropship | not_a_product | store had closed since being sourced (Shopify "store unavailable" page) |
| val-ds-047, 053 | dropship | not_a_product / collection_page | homepage is a genuine multi-product catalog, not the single product I assumed |
| val-ds-051 | dropship | legit | Geepas is a real registered appliance brand (2-yr warranty) — I labeled by product category without recognizing the brand |
| val-legit-003, 004 | legit | collection_page | the sourced URL resolved to a category page, not the specific product |
| val-legit-031 | legit | not_a_product | the sourced URL resolved to the Solo Stove homepage, not the Bonfire product page |
| val-coll-002, 005 | legit | collection_page | pre-flagged in the candidate notes as taxonomy placeholders, not real mismatches |

That leaves one genuine case:

- **val-ds-030** (the-dooloop, single-SKU novelty dog-leash gadget) — the
  identifier correctly named it ("hands-free dog poop bag leash holder
  clip"), but the verdict still called it `legit` at 0.88 confidence. Matches
  the D2C-polished-single-product pattern; a plausible miss, not provably
  confirmed (no supplier-sourcing check was done). Counted against the model.

**Corrected verdict accuracy: 82/83 = 98.8%** (the one plausible miss counted
as wrong, everything else corrected to what the actual scraped content
showed).

## Why this doesn't get folded into the fixture corpus

Folding 90 hand-labeled-by-one-person URLs straight into the CI-gated
corpus would let a single afternoon's labeling errors silently become the
new ground truth. This run's own adjudication table is the reason: 12 of 13
"failures" were my mistakes, not the model's. The script and the raw/corrected
results stay here as a re-runnable, inspectable record; promoting any
individual URL into `tests/fixtures/products/` is a separate, deliberate
decision per CLAUDE.md's rule that fixture `truth.json` files are hand-edited,
never trusted from an auto-stub.
