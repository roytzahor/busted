# The Fixture Corpus

Offline replay framework at `tests/eval/` and `scripts/eval/`. It measures
precision/recall and confidence calibration across prompt and threshold changes
without burning API credits. What it can and cannot prove is in `eval/gates`.

## Layout

```
tests/fixtures/seed-urls.json          ~50-URL seed list, 5 categories
tests/fixtures/products/<id>/
  truth.json                           ground truth — HAND-EDITED
  scrape.json                          stored scrape output
  ai-response.json                     cached model response
  aliexpress.json                      stored candidate pool
tests/eval/fixture-types.ts            TS schema for the above
lib/eval/fixture-store.ts              loadAllFixtures(), saveFixture()
scripts/eval/capture-fixture.ts        live pipeline once per URL, dumps stages
scripts/eval/run-fixtures.ts           confusion matrix + calibration + failures
scripts/eval/list-fixtures.ts          listing helper
```

## truth.json is authored, never captured

`eval:capture` writes an auto-stub. It is **not** ground truth. Hand-edit it
before the fixture counts. Synthetic fixtures come from
`scripts/eval/seed-synthetic-fixtures.ts`, not from hand-authoring JSON.

## The replay reads stored stages, not live ones

This is the trap that makes fixes look like no-ops:

- `run-fixtures.ts` replays the stored `detectedStorePriceUsd` from
  `scrape.json`, so a fix to `lib/scraping/extract-price.ts` shows a 0.000 delta
  until fixtures are backfilled by re-running the extractor over the captured
  `raw.markdown`. Backfill **nulls only** — synthetic fixtures' non-null prices
  are hand-authored to build a specific markup scenario.
- `aliexpress.json` is a stored candidate pool, so keyword, translation and
  search fixes cannot move the number by construction.

A 0.000 delta on these paths is evidence of nothing. Verify on the derived
artifact plus unit tests.

## Mirror production, and prove it

A comment claiming to mirror production is not evidence that it does.
`run-fixtures.ts` once gated supplier search on `verdict === "dropship"` while
production only blocks `not_a_product` / `insufficient_evidence` /
`collection_page` — so `legit` reached the matcher in prod and never in eval.

Re-read the actual call sites when touching eval gating. Any diagnostic that
reports false positives must model the verdict gate, or it cries wolf on
shielded fixtures.

Fixtures marked `blockedOnFixtureData` in `truth.json` are excluded from the
pass/fail gate so genuine regressions still fail the build.
