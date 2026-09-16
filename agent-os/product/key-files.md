# Key Files

Orientation, not an invariant — read directly, not via `/inject-standards`.
For "who calls X" or "what breaks if I change X", query the graph instead
(`standards/code-navigation`); this table goes stale, the graph does not.

`CLAUDE.md` carries only the handful of entry points. The rest live here.

## Pipeline

| File | Purpose |
|---|---|
| `app/api/analyze/route.ts` | `POST()` — the single main route, orchestrates all 8 stages |
| `lib/analyze/client.ts` | `validateProductUrl()` |
| `lib/scraping/router.ts` | `scrapeProductUrl()` — scraping entry point |
| `lib/scraping/detect-source.ts` | source detection, runs before routing |
| `lib/scraping/firecrawl.ts` | `scrapeWithFirecrawl()` |
| `lib/scraping/extract-product.ts` | `extractProductAttributes()` — HTML → structured |
| `lib/learning/priors.ts` | per-domain scraper ordering; getters must never throw |
| `lib/cache/product-cache.ts` | `findValidCachedProduct()` |
| `lib/cache/persist-product.ts` | `persistScannedProduct()` — cache write-back |
| `lib/cache/verified-map.ts` | VerifiedProductMap ("Gold Path") — confirmed retail→supplier mappings that bypass the pipeline |

## AI

| File | Purpose |
|---|---|
| `lib/ai/client.ts` | `AIClient` — unified provider wrapper |
| `lib/ai/models.ts` | **single source of truth** for every model id; accessors read env at call time |
| `lib/ai/dropship-verifier.ts` | `DropshipPrediction`, the prompt, `applyClamps()` |
| `lib/ai/supplier-marketplace-analysis.ts` | supplier marketplace classification |
| `lib/ai/image-match.ts` | `compareProductImagesWithAI()` — multimodal comparison |
| `lib/tier0/store-fingerprint.ts` | Tier-0 deterministic gate — zero-token verdict |
| `lib/analyze/presence-tier.ts` | `computePresenceTier()` — the badge contract |
| `lib/types/cache.ts` | `parseCachedAiPrediction()` — back-compat obligation |

## Supplier matching

| File | Purpose |
|---|---|
| `lib/aliexpress/match-confidence.ts` | `computeMatchConfidence()`, `foldImageMatchIntoConfidence()` |
| `lib/aliexpress/find-supplier.ts` | re-ranks top 5, runs image AI on top 3, soft-skips on `NO_CONFIDENT_MATCH` |
| `lib/aliexpress/api-client.ts` | product search |
| `lib/aliexpress/oauth.ts` | OAuth + request signing |
| `lib/index/embeddings.ts` | Gemini embeddings + pgvector ANN, behind `VECTOR_INDEX_ENABLED` |
| `scripts/index/cluster-products.ts` | `npm run index:cluster`; `--calibrate` before changing thresholds |
| `lib/affiliate/convert-link.ts` | Admitad conversion |

## UI

| File | Purpose |
|---|---|
| `lib/utils.ts` | `cn()` — called everywhere, most-connected node in the graph |
| `components/search-hub.tsx` | main search UI |
| `components/analysis-results.tsx` | results display, match-quality badge, uncertain-match warning |
| `components/ui/silent-boundary.tsx` | `<SilentBoundary>` — structural silence, see `trust/presence-tier-contract` |
| `extension/` | Chrome MV3, vanilla JS, no build step — renders `presenceTier` verbatim |
| `app/dev-monitor/` | dev-only dashboard, gated by `isDevMonitorAllowed()` |

## Eval and support

| File | Purpose |
|---|---|
| `lib/eval/fixture-store.ts` | fixture loader |
| `tests/eval/fixture-types.ts` | fixture schema |
| `scripts/eval/run-fixtures.ts` | `npm run eval` |
| `scripts/eval/capture-fixture.ts` | `npm run eval:capture` |
| `lib/api/error-utils.ts` | the only error path |
| `lib/aliexpress/supplier-enabled.ts` | `isSupplierSearchEnabled()` feature flag |
| `lib/dev-monitor/service-probes.ts` | health probes |
| `lib/types/debug.ts` | `AnalyzeDebugInfo` |
| `ROADMAP.md` | product vision and phases — keep in sync with reality |
