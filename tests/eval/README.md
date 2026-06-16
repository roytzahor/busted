# Eval Harness

Offline replay test framework for the Busted pipeline (scrape → AI verdict → AliExpress supplier match).

## Why this exists

Without ground truth, every prompt tweak is vibes. This harness captures real scrape/AI/AliExpress outputs once per URL and replays them so we can measure precision/recall and confidence calibration across prompt changes — without burning API credits.

## Layout

```
tests/
  eval/
    fixture-types.ts       # TS types for truth.json + cached responses
    README.md              # this file
  fixtures/
    seed-urls.json         # the ~50-URL seed list, grouped by category
    products/
      <fixture-id>/
        truth.json         # expected verdict + supplier match (hand-labeled)
        scrape.json        # cached scrape output
        ai-response.json   # cached AI response (optional)
        aliexpress.json    # cached AliExpress candidates (optional)
```

## Categories

| Category | Meaning | Expected verdict |
|----------|---------|------------------|
| `dropship_obvious` | Telltale signs: urgency timers, generic brand, single-product Shopify | `dropship` |
| `dropship_subtle` | Looks legit but ships from Chinese suppliers | `dropship` |
| `legit_brand` | Real DTC / established retailer | `legit` |
| `not_a_product` | Blog post, category page, 404 | `not_a_product` |
| `aliexpress_itself` | Already-at-supplier URL | `legit` (rule-based) |

## Workflow

### 1. Capture fixtures

```bash
# Run live pipeline against a URL and save its outputs
npm run eval:capture -- <fixture-id> <url> [category]

# Example
npm run eval:capture -- shopify-watch-01 https://example.com/products/watch dropship_obvious
```

Then edit `tests/fixtures/products/<fixture-id>/truth.json` to confirm the expected verdict and supplier match.

### 2. List fixtures

```bash
npm run eval:list
```

### 3. Run eval

```bash
# Full eval (runs live AI on cached scrapes)
npm run eval

# Replay cached AI responses too (no API cost)
npm run eval -- --skip-ai

# Only run fixtures matching a filter
npm run eval -- --filter shopify

# Skip supplier matching
npm run eval -- --skip-supplier
```

## Output

The runner prints:

1. **Confusion matrix** — predicted verdict vs truth, per category
2. **Confidence calibration** — accuracy per confidence bucket. If the 0.8–1.0 bucket has low accuracy, the model is overconfident.
3. **Supplier match accuracy** — precision/recall on finding the right AliExpress supplier
4. **Per-fixture failures** — exactly which fixtures broke and why
5. **Summary** — overall verdict + supplier accuracy

## Suggested capture order

1. Start with the 3 synthetic fixtures shipped with the repo to verify the harness runs
2. Capture 10 `legit_brand` fixtures from the seed URLs — these are easiest, real well-known URLs
3. Capture 10 `not_a_product` fixtures — also easy, anti-confidence test
4. Capture 10 `dropship_obvious` fixtures from URLs you've found in the wild
5. Capture 5 `aliexpress_itself` fixtures
6. Capture 10 `dropship_subtle` fixtures — these are the hardest and most valuable for tuning the model

After each capture, manually verify the AliExpress winner in `aliexpress.json` is actually the same product as the scraped one. Set `expectedPriceUsdBand` accordingly in `truth.json`.

## CI integration (later)

Once we have ≥30 labeled fixtures, wire `npm run eval -- --skip-ai` into CI to catch regressions in the AliExpress ranking/match logic without API spend. Live AI eval should run on a weekly cron with a small subset.
