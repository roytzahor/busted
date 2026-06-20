# Busted — Pipeline Improvement Sprint

**Started:** 2026-06-19  
**Branch:** main  
**Owner:** Roy Tzahor  

Tracks stages 4–12 of the AliExpress supplier-matching pipeline upgrade.
Stages 1–3 (Prisma migration, env var pin, live calmo test) were completed 2026-06-19.

**Sprint 8 — DONE.** Stages 4–12 closed and committed at `d74988e` plus the in-session
dual-arm fetcher + vision-analysis cache work. Sprint 9 (stages 13–18) starts below the
Phase 9 section.

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and committed |
| 🔄 | In progress |
| ⬜ | Not started |
| ❌ | Blocked |

---

## Phase 8 — Immediate sprint (this week)

### Stage 4 — Geo-aware keyword arms (`searchAliExpressProducts`) ✅

**Why:** `searchAliExpressProducts()` still sends `target_currency: "USD"` and `ship_to_country` from env-default on every keyword call. IL-targeted funnels (`.co.il` stores) see USD prices and US-warehouse results. We fixed smartmatch in the last commit; this finishes the rewrite.

**Impact:** Every text-keyword candidate pool now reflects the buyer's actual market, not a US default. Price-band filtering (`min_sale_price` / `max_sale_price`) can be activated once locale is wired.

**Effort:** ~50 LoC across 2 files. ~1 hour.

**Files to change:**

| File | Change |
|------|--------|
| `lib/aliexpress/api-client.ts` | Add `KeywordSearchOptions` interface; thread options into `searchAliExpressProducts()` |
| `lib/aliexpress/find-supplier.ts` | Update `searchCandidates()` + call sites to pass locale + price bands |

**Implementation spec:**

```typescript
// lib/aliexpress/api-client.ts — add before searchAliExpressProducts()

export interface KeywordSearchOptions {
  shipToCountry?: string;   // override env default
  targetCurrency?: string;  // override "USD"
  categoryIds?: string;     // comma-joined AE category IDs
  sortStrategy?: SortStrategy;
  /** AE min_sale_price filter — source retail × priceFloorRatio */
  minSalePrice?: number;
  /** AE max_sale_price filter — source retail × priceCeilRatio */
  maxSalePrice?: number;
}

// Updated signature:
export async function searchAliExpressProducts(
  keywords: string,
  opts: KeywordSearchOptions = {},
): Promise<AliExpressProductCandidate[]>
```

In `find-supplier.ts`, `searchCandidates()` becomes:
```typescript
async function searchCandidates(
  keywords: string,
  provider: "aliexpress_api" | "firecrawl_scrape",
  opts: KeywordSearchOptions = {},
): Promise<AliExpressProductCandidate[]>
```

All four call sites in `findAliExpressSupplier()` pass:
```typescript
{
  shipToCountry: locale.shipToCountry,
  targetCurrency: locale.targetCurrency,
  categoryIds: categoryVocab?.categoryIds.join(","),
  sortStrategy: categoryVocab?.defaultSort,
  minSalePrice: categoryVocab && params.storePriceUsd
    ? +(params.storePriceUsd * categoryVocab.priceFloorRatio).toFixed(2)
    : undefined,
  maxSalePrice: categoryVocab && params.storePriceUsd
    ? +(params.storePriceUsd * categoryVocab.priceCeilRatio).toFixed(2)
    : undefined,
}
```

**AliExpress API params to add in `callAffiliateApi` body:**
- `ship_to_country` → `opts.shipToCountry ?? config.shipToCountry`
- `target_currency` → `opts.targetCurrency ?? "USD"`
- `sort` → `opts.sortStrategy ?? "LAST_VOLUME_DESC"`
- `category_ids` → `opts.categoryIds` (omit when undefined)
- `min_sale_price` → `opts.minSalePrice?.toString()` (omit when undefined)
- `max_sale_price` → `opts.maxSalePrice?.toString()` (omit when undefined)

**Acceptance criteria:**
- [ ] TypeScript builds with no new errors
- [ ] A `.co.il` store URL routes with `ship_to_country=IL&target_currency=ILS` in all keyword arms
- [ ] A `.com` store routes with `ship_to_country=US&target_currency=USD`
- [ ] `SortStrategy` type reused from `category-map.ts` (no duplicate)

---

### Stage 5 — Variant-axis remapping (shower steamers + analogs) ✅

**Why:** Source stores encode the variant as `color` ("purple", "orange", "green"). AliExpress factories encode the same distinction as `scent` ("lavender", "citrus", "mint"). The current matcher compares `source.color` against `sku.attrs.color` — when the SKU has no `color` key, the comparison returns zero dimensions and the variant match is skipped entirely (`EMPTY_RESULT`). The buyer lands on the wrong scent.

**Impact:** All shower-steamer purchases will land on the correct scent variant. Same fix covers any category where the retail-facing axis and the factory axis diverge (candle `color` → `fragrance`, tea `color` → `flavor`, nail polish `size` → `capacity`).

**Effort:** ~120 LoC across 2 files. ~2 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/aliexpress/category-map.ts` | Add `variantAxisMappings` to `CategoryVocabEntry`; populate for shower steamers |
| `lib/aliexpress/match-variant.ts` | Add `applyAxisMappings()`; thread optional `AxisMapping[]` through `matchVariantToSku()` |

**Data model:**

```typescript
// In CategoryVocabEntry
variantAxisMappings?: AxisMapping[];

export interface AxisMapping {
  /** Source-side axis name (canonical: color | size | capacity | material). */
  fromAxis: "color" | "size" | "capacity" | "material";
  /** Factory-side axis name (arbitrary AE attr key, lowercase). */
  toAxis: string;
  /** Lowercase source values → target values. Non-matching keys pass through unchanged. */
  valueMap: Record<string, string>;
}
```

**Shower-steamer mapping to add in `CATEGORY_MAP["shower steamer"]`:**
```typescript
variantAxisMappings: [
  {
    fromAxis: "color",
    toAxis: "scent",
    valueMap: {
      purple:  "lavender",
      violet:  "lavender",
      blue:    "ocean",
      green:   "eucalyptus",
      "light green": "mint",
      mint:    "mint",
      orange:  "citrus",
      yellow:  "citrus",
      red:     "rose",
      pink:    "rose",
      white:   "vanilla",
      cream:   "vanilla",
      brown:   "coffee",
    },
  },
],
```

**`matchVariantToSku()` signature update:**
```typescript
export function matchVariantToSku(
  source: ScrapedProductVariant | undefined,
  detail: AliExpressProductDetail | null,
  axisMappings?: AxisMapping[],
): VariantMatchResult
```

**`applyAxisMappings()` logic:**
```typescript
function applyAxisMappings(
  source: ScrapedProductVariant,
  skuAttrs: Record<string, string>,
  mappings: AxisMapping[],
): { remappedSource: ScrapedProductVariant; attrOverrides: Record<string, string> } {
  // Returns a new source with remapped values AND a shadow attrs copy
  // that adds virtual keys so scoreSkuAgainstSource can find a match.
  // Original keys are preserved so non-mapped categories are unaffected.
}
```

Inside `scoreSkuAgainstSource`, add the remapped attrs alongside the original:
- If `source.color === "purple"` and mapping says `fromAxis: color, toAxis: scent, valueMap: {purple: lavender}`
- And `sku.attrs.scent === "lavender"`
- Then inject `sku.attrs.color = "purple"` temporarily (in local shadow) or score directly using `fromAxis → toAxis` bridged comparison
- Emit reason: `"color→scent remapped: purple→lavender (exact)"`

**Acceptance criteria:**
- [ ] `matchVariantToSku({ color: "purple" }, detail, axisMappings)` returns `matchedSku.scent = "lavender"`, `variantConfidence ≥ 0.9`, `hardMismatch: false`
- [ ] Category without `variantAxisMappings` behaves identically to current code (no regression)
- [ ] `AxisMapping` interface is exported from `category-map.ts` and imported by `match-variant.ts` (no circular deps)
- [ ] Unit test file `lib/aliexpress/match-variant.test.ts` covers: exact remap, partial remap (source purple, AE has green+lavender, selects lavender), no-mapping fallback

---

### Stage 6 — Category coverage-gap logging ✅

**Why:** We seeded 5 verticals. Every store that resolves `productCategory: null` from `resolveCategoryVocab()` is a blind spot — no category filter, no price band, no negative-keyword strip. Without logging, we have no signal for which verticals to add next.

**Impact:** First 10 new verticals (observable from logs within 2 weeks of prod traffic) will cover ~80% of common dropship categories. Zero runtime cost.

**Effort:** ~30 LoC across 1 file. ~30 minutes.

**Files to change:**

| File | Change |
|------|--------|
| `lib/aliexpress/category-map.ts` | Add miss counter + `console.warn` in `resolveCategoryVocab()` |
| `lib/aliexpress/find-supplier.ts` | Expose miss in `searchMeta.categoryVocabMiss` for debug output |

**Implementation spec:**

```typescript
// In category-map.ts — add after VERTICAL_SYNONYMS:

const _categoryMisses = new Map<string, number>(); // in-memory, resets per cold start

export function getCategoryMissCounts(): Record<string, number> {
  return Object.fromEntries(_categoryMisses);
}

// In resolveCategoryVocab(), after the synonym scan returns null:
const trimmed = productCategory?.trim() ?? "(null)";
const prev = _categoryMisses.get(trimmed) ?? 0;
_categoryMisses.set(trimmed, prev + 1);
console.warn(
  `[category-map] No vocab entry for "${trimmed}" — search will run without category filter or negative keywords. ` +
  `Add this vertical to CATEGORY_MAP to improve precision. ` +
  `(miss #${prev + 1} for this value)`,
);
return null;
```

In `find-supplier.ts`, add to `searchMeta`:
```typescript
categoryVocabMiss: categoryVocab === null
  ? (params.identity?.category ?? params.productCategory ?? null)
  : undefined,
```

**Acceptance criteria:**
- [ ] A store URL with `productCategory: "yoga mat"` logs a `[category-map]` warn in Vercel Functions logs
- [ ] `getCategoryMissCounts()` returns `{ "yoga mat": 3 }` after 3 calls
- [ ] Known verticals (shower steamer, slippers…) produce no warn
- [ ] `searchMeta.categoryVocabMiss` is visible in the debug output panel

---

## Phase 8 — Next sprint (next month)

### Stage 7 — SmartMatch outcome tracking ✅

**Why:** We don't know whether the Gemini-preprocessed `image_base64` arm actually outperforms the raw `image_url` arm. We're spending ~$0.001/call on Gemini preprocessing without evidence of lift. If cleaned images win by <10% of the time, preprocessing isn't worth the latency + cost.

**Effort:** ~3 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/aliexpress/types.ts` | Add `preprocessAttempted`, `preprocessCacheHit`, `smartmatchArmUsed`, `smartmatchCandidateCount` to `searchMeta` |
| `lib/aliexpress/find-supplier.ts` | Capture preprocess + smartmatch outcome; write to `searchMeta` |
| `lib/types/cache.ts` | Persist `searchMeta` fields into `StageCache.analyzeMetadata` JSON |

**What to measure:**
- `preprocessAttempted: boolean` — did we try Gemini?
- `preprocessCacheHit: boolean` — served from `PreprocessedImage` table?
- `preprocessDurationMs: number` — wall-clock for the preprocess call
- `smartmatchArm: "base64" | "url" | "skipped"` — which arm won
- `smartmatchCandidateCount: number` — how many AE candidates returned

**A/B analysis target:** after 100 analyses, compare `matchConfidence` distributions across `smartmatchArm === "base64"` vs `"url"`. If mean lift < 0.05, consider disabling preprocess or gating it to only thin-title products.

---

### Stage 8 — AE category-ID verification job ✅

**Why:** AliExpress occasionally re-trees subcategories. A category ID that returned 500 results for "necklace" in June can return 0 in September because AE moved the family to a new parent node. We'd have no warning until a customer complains.

**Effort:** ~2 hours.

**Implementation options:**

**Option A (recommended) — Script + GitHub Action:**  
`scripts/verify-category-ids.ts` — for each `CATEGORY_MAP` entry, fetch one known-good product via `aliexpress.affiliate.productdetail.get`, read back `first_level_category_id`, assert it appears in the entry's `categoryIds`. Run monthly via GitHub Actions cron. Fails the action (email notification) on mismatch.

**Option B — Prod health-check endpoint:**  
`GET /api/admin/category-health` — same logic, protected by `ADMIN_API_KEY`. Can be polled from an external monitoring tool.

**Verification seed data to add to `CATEGORY_MAP` entries:**
```typescript
verificationProductId?: string; // a known-good AE product ID to use as probe
```

---

### Stage 9 — Source-image inpaint quality scorer ✅

**Why:** Gemini's preprocessing is a black box. Sometimes it overcorrects (destroys product shape detail trying to remove a subtle logo). Sometimes it undercorrects (leaves brand text). A second cheap Gemini call asking "rate this cleanup 0–10" tells us when to retry with a lighter prompt or fall back to the raw URL.

**Effort:** ~4 hours.

**Gate:** Don't build this until Stage 7 shows that preprocess lift is real and >10%. If preprocess doesn't help, skip this.

**Files to change:**

| File | Change |
|------|--------|
| `lib/ai/preprocess-image.ts` | Add `scoreCleanup(cleanedBase64, categoryHint): Promise<number>` |
| `lib/ai/preprocess-image.ts` | If score < 5, retry with a lighter prompt (`BRAND_REMOVAL_ONLY`); if still < 5, throw `PreprocessError("LOW_QUALITY")` |

**Scoring prompt outline:** Send source + cleaned to Gemini, ask for a JSON `{ score: 0-10, issues: string[] }`. Score thresholds: `≥7` use cleaned, `4-6` use cleaned with warning, `<4` fall back to raw.

---

## Phase 9 — Stretch (next quarter)

### Stage 10 — Hebrew → English title translation pre-pass ✅

**Why:** 3 of the 4 test IL stores (`bleesse.com`, `imri-jewelry.co.il`, `calmo.co.il`) have Hebrew product titles. `extractSearchKeywords()` strips Hebrew as non-ASCII junk (`[^\w\s-]`). A Gemini pre-translate before keyword extraction unlocks the entire IL market — and any other non-Latin-script dropship vertical (Arabic `.sa`, Japanese `.jp`, Korean `.kr`).

**Effort:** ~6 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/scraping/extract-product.ts` | Detect non-ASCII title; if detected, call `translateTitle()` |
| `lib/ai/translate-title.ts` (new) | `translateTitle(title, sourceLang): Promise<string>` — single Gemini call, 10-word cap on output |
| `lib/aliexpress/keywords.ts` | Accepts pre-translated title transparently (no change needed) |

**Language detection:** use `Intl.Segmenter` or a simple Unicode range check: if >30% of chars are in `֐-׿` (Hebrew), `؀-ۿ` (Arabic), etc., flag as non-Latin.

**Caching:** translation result stored in `ScrapedProductAttributes.translatedTitle` and persisted in the Prisma `ProductCache` JSON. No Gemini call on cache hit.

---

### Stage 11 — Per-store affiliate-link reputation ✅

**Why:** `validateAffiliateLink()` logs failures but they don't feed back into ranking. A product whose affiliate link reliably fails for IL (because the Israeli storefront isn't enabled in the AE affiliate program) will keep getting shown to Israeli users even though we know the link won't convert.

**Effort:** ~8 hours.

**Schema change needed:**
```prisma
model SupplierReputation {
  id            String   @id @default(cuid())
  productId     String
  shipToCountry String
  linkFailures  Int      @default(0)
  linkSuccesses Int      @default(0)
  lastFailedAt  DateTime?
  lastCheckedAt DateTime @default(now())
  @@unique([productId, shipToCountry])
  @@index([productId])
}
```

**Scoring integration:** in `find-supplier.ts`, after building `scored[]`, fetch reputation rows for top candidates in one query. Apply a `reputationPenalty` multiplier to confidence: `failures / (failures + successes) > 0.8` → multiply score by `0.7`.

---

### Stage 12 — JSON-LD variant extraction (replace Markdown regex) ✅

**Why:** Firecrawl currently returns `formats: ["markdown"]` only. Shopify stores embed complete `Product.offers[]` data in `<script type="application/ld+json">` blocks — structured, machine-readable, contains exact variant names and prices. Switching to `formats: ["markdown", "html"]` + a JSON-LD extractor replaces ~80% of the regex-based variant extraction in `extract-variant.ts` with deterministic structured pulls. Estimated variant-miss reduction on Shopify stores: 30% → 5%.

**Effort:** ~1 day.

**Files to change:**

| File | Change |
|------|--------|
| `lib/scraping/firecrawl-client.ts` | Add `"html"` to `formats` array |
| `lib/scraping/extract-jsonld.ts` (new) | `extractJsonLd(html): ProductJsonLd \| null` — parse `<script type="application/ld+json">`, find `@type: "Product"` node, extract `offers[]` |
| `lib/scraping/extract-product.ts` | Try JSON-LD extractor first; fall back to `extract-variant.ts` regex when it returns null |
| `lib/scraping/extract-variant.ts` | Unchanged — remains as fallback |

**JSON-LD target fields:**
- `name` → `attributes.title`
- `offers[0].price` → `attributes.price`
- `offers[0].priceCurrency` → `attributes.currency`
- `offers[].name` → split into `variant.color`, `variant.size`, etc. via the same normalisation logic as `extractVariantSignals()`
- `image[0]` → `attributes.mainImageUrl`

---

## Sprint 9 — Trust, observability & legal hardening (this week)

**Started:** 2026-06-19  
**Theme:** make the product believable. Mid-scan transparency, a credible disclaimer
that protects us from "this isn't actually my dropshipper" pushback, and the
monitoring upgrades we needed since stages 4–12 started shipping rich metadata
nobody can see.

### Stage 13 — Homepage disclaimer + footer microcopy ✅

**Why:** Detection isn't perfect (legit brands occasionally test as "likely dropship"),
and the AliExpress match is often a similar product, not the literal same SKU.
Without explicit warnings on the landing page we expose ourselves to brand-defamation
claims and refund disputes. Adding a small visible disclaimer is the cheapest legal
moat we can put up.

**Impact:** Removes any "but you said it was a dropship!" or "this isn't the same
product I bought!" liability. Sets expectations *before* the user runs a scan.

**Effort:** ~30 LoC across 3 files. ~30 minutes.

**Files to change:**

| File | Change |
|------|--------|
| `components/search-hub.tsx` | Add an info-icon chip under the URL input — visible in idle state, dims when scanning |
| `app/layout.tsx` | Replace the single-line tagline footer with a 2-line legal note |
| `lib/brand.ts` | Add `DISCLAIMER_SHORT` + `DISCLAIMER_LONG` so copy lives in one place |

**Copy spec:**

```
Short (under the search box):
  ⓘ  Results are estimates. We may flag legit brands as dropships,
     and AliExpress matches may be similar items, not exact.

Long (footer):
  Busted is a price-comparison and education tool. Dropship detection
  and AliExpress matches are AI-generated estimates — verify product
  identity, seller reputation, and shipping before purchasing.
  Not affiliated with the stores or marketplaces we link to.
```

**Acceptance criteria:**
- [ ] Disclaimer chip appears immediately under the URL input in idle state
- [ ] Chip dims (50% opacity) while `phase === "analyzing"` to reduce noise
- [ ] Footer shows the long version on every page (including `/monitoring`)
- [ ] Copy is sourced from `lib/brand.ts` constants (no inline strings)

---

### Stage 14 — Surface pipeline metadata in /monitoring ✅

**Why:** Stages 4–12 plus the dual-arm fetcher and vision-analysis cache produce
~20 new metadata fields per scan (preprocess cache hit, OCR traces, material tokens,
smartmatch arm, locale, category vocab match, variant axis remapping, fetched-page
source arm…). All of it sits inside `searchMeta` and `serviceEvents[].meta` and is
invisible unless you expand the raw JSON `<details>`. The monitoring dashboard
should *show* this — it's the proof the pipeline is doing intelligent things.

**Impact:** /monitoring becomes a useful debugging surface again. Spot regressions
in 5 seconds instead of 5 minutes of JSON scrolling.

**Effort:** ~250 LoC across 4 files. ~3 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/types/debug.ts` | Add `AnalyzeDebugPipeline` interface with structured fields (page-cache, vision, smartmatch, variant, locale, category) |
| `app/api/analyze/route.ts` | Map `searchMeta` + event-meta into the new structured fields |
| `components/monitoring/pipeline-detail.tsx` (new) | Card grid: "Scrape", "Vision", "SmartMatch", "Variant", "Routing" — each shows the relevant signals |
| `components/monitoring/last-scan-panel.tsx` | Mount `<PipelineDetail />` above the existing event timeline |

**Visual spec (5 card grid):**

```
┌──────────────────────┬──────────────────────┐
│ Scrape               │ Vision               │
│ source: crawlbase    │ preprocess: cache HIT│
│ cache: HIT (5d ago)  │ quality: 8.2/10      │
│ size: 28 KB gzipped  │ ocr: ["A4S", "..."]  │
│                      │ materials: ["TPU"]   │
├──────────────────────┼──────────────────────┤
│ SmartMatch           │ Variant Match        │
│ arm: base64          │ axis: color→scent    │
│ candidates: 12       │ purple → lavender    │
│                      │ confidence: 0.92     │
├──────────────────────┴──────────────────────┤
│ Routing                                     │
│ locale: IL · ILS · ship_to_country=IL       │
│ category: "shower steamer" → IDs [200…]     │
│ negative keywords applied: 4                │
└─────────────────────────────────────────────┘
```

**Acceptance criteria:**
- [ ] All 5 cards render with real data on a fresh scan
- [ ] Cards collapse gracefully when a signal is absent (no broken empty cards)
- [ ] OCR / material / spec arrays show as chips, not raw JSON
- [ ] Cache HIT vs MISS uses semantic colour (success vs muted)

---

### Stage 15 — Per-stage latency waterfall with cost ✅

**Why:** The existing waterfall is a vertical text log. It hides the answer to the
question we ask most often: "where did the 18 seconds go and what did it cost?"
A horizontal bar chart with a cost column makes bottlenecks and overspend obvious.

**Impact:** Identifies whether Crawlbase, Firecrawl, Gemini Vision, or AE API is
the latency hog on any given scan. Estimated $/scan visible per stage drives
decisions about caching, prompt complexity, and arm priority.

**Effort:** ~180 LoC across 3 files. ~2 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/monitoring/cost-model.ts` (new) | `estimateStageCost(serviceName, meta): { usd, breakdown }` — pure function, no I/O |
| `components/monitoring/latency-cost-waterfall.tsx` (new) | Horizontal stacked bars with cost column |
| `components/monitoring/last-scan-panel.tsx` | Render the new waterfall above the existing text trace |

**Cost model (initial estimates — refine later from real bills):**

```typescript
const STAGE_COST_USD = {
  "crawlbase":         0.001,   // per JS render
  "firecrawl-scrape":  0.0015,  // per page
  "gemini-vision":     0.00012, // per call (Gemini 3 Flash image+text)
  "gemini-flash-text": 0.00005, // per call (text-only verdict/identity)
  "ae-keyword-search": 0.0,     // free tier within quotas
  "ae-smartmatch":     0.0,     // free tier
  "ae-product-detail": 0.0,     // free tier
  "admitad-link":      0.0,     // affiliate, free
  "neon-query":        0.0,     // included in hosting
};
```

**Acceptance criteria:**
- [ ] Horizontal bars proportional to actual stage duration
- [ ] Cost column shows USD with 4 decimal precision (e.g. "$0.0012")
- [ ] Total row at the bottom: total ms · total $
- [ ] Bars colour-coded by stage type (scrape blue, AI amber, AE green, cache grey)

---

### Stage 16 — Cache stats overview panel ✅

**Why:** We added three caches in the last sprint (PreprocessedImage, FetchedPage,
SupplierReputation) plus the pre-existing ScannedProduct and StageCache. Nobody
knows what the hit rates are. Hit-rate is the single biggest cost lever — if
PreprocessedImage hits at 5% we're paying ~$0.001 × every-image every scan, if
it hits at 80% the spend is one-fifth.

**Impact:** Visibility into where caching pays off and where it doesn't. Lets us
size the Neon DB realistically and spot pathological keys (e.g. URL parameters
busting the page cache).

**Effort:** ~150 LoC across 3 files. ~2 hours.

**Files to change:**

| File | Change |
|------|--------|
| `app/api/monitoring/cache/route.ts` (new) | GET endpoint returning `{ table, rows, hits, totalSize, oldestRow, ttlDays }[]` |
| `components/monitoring/cache-stats.tsx` (new) | Card grid showing each table |
| `app/monitoring/page.tsx` | Mount `<CacheStats />` between StatusBoard and LastScanPanel |

**Visual:**

```
┌─────────────────────────────────────────────────┐
│ Cache Performance · last 30 days                │
├─────────────────────────────────────────────────┤
│ ScannedProduct      • 1,204 rows · 18 MB · 14d  │
│ ▆▆▆▆▆▆▆▇▇▇▇▇▇▇   72% hit · 3,847 hits         │
├─────────────────────────────────────────────────┤
│ FetchedPage         • 982 rows  · 26 MB · 14d  │
│ ▆▆▆▆▆▆▆▆▆▆▆▇▇▇   88% hit · 6,202 hits         │
├─────────────────────────────────────────────────┤
│ PreprocessedImage   • 612 rows  · 41 MB · 30d  │
│ ▆▆▆▆▆▇▇          41% hit · 1,108 hits         │
├─────────────────────────────────────────────────┤
│ StageCache          • 8,471 rows · 4 MB  · 14d │
│ ▆▆▆▆▆▆▆▆▆▆▆▇▇▇▇  91% hit · 24,610 hits        │
└─────────────────────────────────────────────────┘
```

**Acceptance criteria:**
- [ ] Endpoint protected by `x-monitoring-secret` (same as other monitoring routes)
- [ ] Hit rate computed as `sum(hits) / (sum(hits) + sum(misses))` over the last 30 days
- [ ] Storage size uses `pg_total_relation_size()` per table
- [ ] Panel auto-refreshes every 60 s (heavier than service probes — 30 s is wasteful)

---

### Stage 17 — Live animated pipeline view during scan ✅

**Why:** Today the user stares at a skeleton during a 20-second scan and has no
idea what's happening. We already emit progress events via `analyzeProductUrl(...,
{ onProgress })`. Wire those into a real-time stage tracker showing what's running
*right now*, what's done, what's queued. Doubles as marketing — the pipeline
*looks* sophisticated because it *is*.

**Impact:** Perceived latency drops sharply (people tolerate 20 s when they can see
progress). Doubles as social-shareable demo material — TikTok-friendly.

**Effort:** ~300 LoC across 4 files. ~5 hours.

**Files to change:**

| File | Change |
|------|--------|
| `lib/analyze/client.ts` | Extend `AnalyzeProgress` to include `stage`, `phase`, `meta` (currently only `step` + `progress`) |
| `app/api/analyze/route.ts` | Emit structured progress events via SSE — one per stage transition |
| `components/live-pipeline-view.tsx` (new) | Vertical timeline with shimmering active stage, completed stages collapse to a checkmark |
| `components/search-hub.tsx` | Replace `<AnalysisSkeleton />` with `<LivePipelineView />` when `phase === "analyzing"` |

**Event taxonomy:**

```typescript
type LiveStage =
  | "cache-lookup"
  | "fetch-page"
  | "extract-product"
  | "translate-title"      // optional, IL/non-Latin
  | "preprocess-image"
  | "identify-product"
  | "verify-dropship"
  | "search-aliexpress"
  | "match-variant"
  | "rank-candidates"
  | "validate-affiliate"
  | "persist-result";
```

**Acceptance criteria:**
- [ ] Each stage transitions through `queued → active → done` with a smooth animation
- [ ] Active stage shows a sub-message (e.g. "fetching via Crawlbase…")
- [ ] Cache HIT on a stage shows a lightning bolt + skip-to-done in <100 ms
- [ ] On error, the failing stage turns red with the error message inline
- [ ] Same component is reusable inside `/monitoring` for replaying the last scan

---

### Stage 18 — Apply pending migration + verifyCategoryProductIds seed ⬜

**Why:** Carried over from Sprint 8. The `20260619124730_add_fetched_page_and_analysis_cache`
migration file exists in `prisma/migrations/` but hasn't been pushed to Neon.
Without it, `fetchProductPage()` and the analysis cache writes will throw at
runtime. Also: `CATEGORY_MAP[*].verificationProductId` is still `undefined` for
all 5 verticals, so `npm run verify:categories` reports SKIPPED for everything.

**Effort:** 15 minutes + 1 hour to find 5 stable AE product IDs.

**Steps:**
1. `npx prisma migrate deploy` against Neon prod DB
2. Identify one stable, high-volume AE product per vertical (shower steamer,
   slippers, jewelry, phone case, candle) — pick something with `lastest_volume > 1000`
3. Populate `verificationProductId` in `lib/aliexpress/category-map.ts`
4. Run `npm run verify:categories` locally — confirm all 5 pass
5. Trigger the monthly GitHub Actions workflow once manually to validate

**Acceptance criteria:**
- [ ] `npx prisma migrate status` reports the migration as applied
- [ ] All 5 entries in `CATEGORY_MAP` have a populated `verificationProductId`
- [ ] GitHub Actions `verify-category-ids` run is green

---

## Sprint 10 — Product surface & growth (this week)

**Started:** 2026-06-19  
**Theme:** the engine works. Now make it findable, shareable, and sticky.

**Why this sprint, why now.** Sprints 1–9 built a sophisticated detection +
matching engine: dual-arm scraping, variant-axis remapping, image-AI confidence
folding, vision cache, live SSE pipeline. None of that helps if a first-time
visitor lands on a blank input and bounces in 4 seconds. Sprint 10 closes the
gap between the engine and the user — onboarding, retention, virality, social
proof. Zero new AI calls (Gemini quota was just exhausted; this is deliberately
front-end heavy).

**Goal metrics (for the next review):**
- First-scan rate on new visitors: ≥ 60% (today: estimated ~20%, lots of bounces)
- Returning users in 7 days: ≥ 15% (today: zero — no retention surface)
- Scans-per-share: at least 1 in 10 results clicks the share button
- Time-to-first-scan on a cold visitor: under 8 seconds (today: requires the
  user to have a URL ready — no scaffolding)

### Stage 19 — Onboarding: example URL chips ✅

**Why:** A new visitor with no URL in mind bounces. We need a one-click path
from "landing page" to "results screen". A row of 3–4 real example chips below
the search input gives them somewhere to click.

**Impact:** Removes the cold-start problem. Lets us also demo the product
for screenshots and TikTok captures from a live URL we control.

**Files to change:**

| File | Change |
|------|--------|
| `lib/examples.ts` (new) | Static list of `{ label, url, savingsHint }[]` — 3-4 entries across verticals |
| `components/search-hub.tsx` | Render a chip row below the disclaimer when `phase === "idle"`. Clicking a chip pre-fills + auto-submits |

**Copy spec:**
```
Try one:
[Shower steamers $14 → $1.20]  [Slippers $39 → $4.80]  [Phone case $24 → $2]
```

**Acceptance:**
- [ ] Chips render only in idle state, animate-in with the rest of the hero
- [ ] Each chip is keyboard-focusable, has aria-label "Try the X example"
- [ ] Clicking a chip pre-fills the input AND auto-runs the scan
- [ ] On mobile, chips wrap onto multiple lines without horizontal scroll

---

### Stage 20 — Anonymous scan history ✅

**Why:** Today every scan vaporises on refresh. There's no come-back hook.
Without auth we can still persist locally — and that's enough to let a user
flip between two scans they ran an hour apart.

**Impact:** A retention surface that costs zero backend complexity. People who
ran a successful scan see a chip next to the logo: "Recent scans (3)". Open
the sheet → re-launch any of them in one click (cache will hit, so it's free).

**Files to change:**

| File | Change |
|------|--------|
| `lib/scan-history.ts` (new) | `getHistory()`, `appendScan()`, `clearHistory()` — localStorage-backed, capped at 25 entries |
| `components/recent-scans.tsx` (new) | Sheet/drawer rendered from the nav. Shows thumbnail · title · savings · timestamp |
| `components/nav.tsx` | Add a "Recent" pill button that opens the sheet; shows count badge |
| `components/search-hub.tsx` | On successful scan, call `appendScan({ url, title, image, savingsPercent, completedAt })` |

**Storage shape:**
```ts
interface ScanHistoryEntry {
  id: string;          // crypto.randomUUID()
  url: string;
  title: string;
  imageUrl: string | null;
  savingsPercent: number | null;
  completedAt: string; // ISO
}
```

**Acceptance:**
- [ ] Persists across refresh; capped at 25 entries (oldest evicted)
- [ ] "Recent" button hidden when history is empty
- [ ] Drawer has a "Clear history" link at the bottom
- [ ] Clicking an entry re-submits the URL (cache HIT path)

---

### Stage 21 — Dynamic OG share images + share button ✅

**Why:** Today a scan result is a private page — no shareable artifact. If
someone wants to brag about saving $30 on shower steamers, they screenshot.
A proper OG card means every shared link previews as a value-prop image on
WhatsApp, Twitter, LinkedIn, iMessage.

**Impact:** Compounding virality. Every shared result becomes a marketing
asset. Cheap to build: Next.js ImageResponse can render it on the edge.

**Files to change:**

| File | Change |
|------|--------|
| `app/api/og/scan/route.tsx` (new) | `ImageResponse` returning a 1200×630 card with title, savings %, brand mark |
| `app/scan/[id]/page.tsx` (new) | Server-rendered scan result page (looks up `ScannedProduct` by id); sets `openGraph.images` to the OG route |
| `components/share-button.tsx` (new) | "Share result" button → Web Share API if available, else copy-to-clipboard with toast |
| `components/analysis-results.tsx` | Mount `<ShareButton />` next to the CTA |

**OG card layout:**
```
┌──────────────────────────────────────────────┐
│  BUSTED                                       │
│                                              │
│  [product img]   They're busted.             │
│                  Save 87%                    │
│                  $24 → $3.10                 │
└──────────────────────────────────────────────┘
```

**Acceptance:**
- [ ] `/api/og/scan?title=X&savings=87&image=...` returns a valid 1200×630 PNG
- [ ] `/scan/[id]` is publicly shareable and renders the same data
- [ ] Share button uses navigator.share when available, falls back to clipboard
- [ ] WhatsApp / Twitter unfurl previews show the new card

---

### Stage 22 — Live trust counter widget ✅

**Why:** Social proof. "3,847 stores busted this week · $124k saved" turns a
landing page into a live feed. Real numbers, fetched cheap.

**Impact:** First-time visitors see the product is real and being used.
Conversion to "first scan" should lift noticeably.

**Files to change:**

| File | Change |
|------|--------|
| `app/api/stats/totals/route.ts` (new) | Returns `{ scansThisWeek, totalSavingsUsd, refreshedAt }`. `next: { revalidate: 3600 }` |
| `components/trust-counter.tsx` (new) | Animated counter chip; uses `useEffect` to count from 0 → N over 1.2s |
| `components/search-hub.tsx` | Render the chip above the STATS row |

**SQL:**
```sql
-- scansThisWeek
SELECT COUNT(*) FROM "ScannedProduct" WHERE "createdAt" > NOW() - INTERVAL '7 days';

-- totalSavingsUsd (sum of estimatedMarkupPercent applied to estimatedStorePriceUsd in aiPrediction)
-- For Sprint 10 we'll approximate: count × $18 average savings until we wire up the calc.
```

**Acceptance:**
- [ ] Endpoint cached server-side for 1h via Next.js revalidate
- [ ] Counter animates from 0 on mount, respects prefers-reduced-motion
- [ ] Falls back to a static "Busted is live" pill if API fails

---

### Stage 23 — PWA manifest + share-target + clipboard paste ✅

**Why:** On mobile, the typical flow is: see a sketchy product on TikTok → tap
share → pick a target. If Busted is a share target, we own that flow. Add a
"Paste from clipboard" affordance for desktop users coming in fresh.

**Impact:** Native-app feel without writing a native app. One-tap scan from
any Shopify checkout.

**Files to change:**

| File | Change |
|------|--------|
| `app/manifest.ts` (new) | Next.js metadata route exporting the webmanifest with `share_target` |
| `app/page.tsx` | Read `?share=...` and `?url=...` from URL on mount; if present, pre-fill + auto-run |
| `components/search-hub.tsx` | Add a clipboard icon button inside the input; clicking it calls `navigator.clipboard.readText()` |
| `app/layout.tsx` | Add `<link rel="manifest" href="/manifest.webmanifest">` (Next.js auto-handles) |

**share_target stanza:**
```json
{
  "action": "/",
  "method": "GET",
  "params": { "title": "title", "text": "share", "url": "url" }
}
```

**Acceptance:**
- [ ] iOS Share → "Add to Home Screen" works
- [ ] Sharing a URL to the installed PWA opens the homepage with the URL pre-filled and auto-running
- [ ] Clipboard button only renders when `navigator.clipboard.readText` exists
- [ ] Pre-fill via `?url=...` works in any browser (no PWA install required)

---

### Stage 24 — Empty state polish + value-prop refresh ✅

**Why:** With Sprint 10 we accumulate visible surface. Time to make sure the
hero copy still reads cleanly, the bento grid feels purposeful, and a small
"Why this exists" accordion lives at the bottom for the curious-but-not-sold
visitor.

**Impact:** Marginal but compounding. Cleaner copy, sharper value-prop, fewer
half-finished sentences.

**Files to change:**

| File | Change |
|------|--------|
| `components/value-prop-faq.tsx` (new) | 3-item accordion: "How does Busted know?", "Is this legal?", "Why AliExpress?" |
| `components/search-hub.tsx` | Mount the FAQ in idle state, below the how-it-works grid |
| `lib/brand.ts` | Add `FAQ_ITEMS` so copy lives in one place |

**Acceptance:**
- [ ] FAQ uses Radix Accordion (already in shadcn/ui)
- [ ] Only renders in idle state
- [ ] Each answer is one short paragraph, no jargon
- [ ] Last item visible without scroll on a 13" laptop

---

## Sprint 11 — Measurement, distribution, durability (this week)

**Started:** 2026-06-20  
**Theme:** stop building blind. Wire telemetry, capture clicks, claim search,
catch errors, plant the seed of the real distribution channel.

**Why this sprint, why now.** Sprint 10 gave us shareable surface but every
result vanishes on refresh, we have no analytics to measure what works, no
record of affiliate clicks (so no business attribution), no SEO presence,
no error visibility, and no path off the website itself. Sprint 11 fixes the
measurement layer (so future bets are informed) and plants the seed of the
extension (the actual scalable distribution channel).

**Goal metrics:**
- 100% of completed scans now write a telemetry row
- 100% of affiliate clicks pass through the tracked redirect
- Sitemap submitted to Search Console with all permalink URLs
- Client errors visible in the DB within 60s of occurring
- Extension installable locally in unpacked mode

### Stage 25 — Scan permalinks `/scan/[id]` ✅

**Why:** Today every result lives at `/?url=...` and re-runs the pipeline on
visit. A real permalink (`/scan/<id>`) lets us cache the unfurl card forever,
makes WhatsApp/Twitter previews actually work, and gives the SEO crawler real
indexable pages.

**Impact:** Sharing actually compounds. Every shared scan becomes a permanent
landing page with the right OG card.

**Files to change:**

| File | Change |
|------|--------|
| `app/scan/[id]/page.tsx` (new) | Server component; looks up ScannedProduct by id; passes data to AnalysisResults |
| `app/scan/[id]/loading.tsx` (new) | Skeleton |
| `lib/cache/lookup-by-id.ts` (new) | `getScannedProductById(id)` helper |
| `components/share-button.tsx` | Prefer permalink when `scanId` is known |
| `components/analysis-results.tsx` | Plumb scanId through to ShareButton |
| `app/api/analyze/route.ts` | Surface the persisted ScannedProduct.id in the response so the client can build the permalink |

**Acceptance:**
- [ ] `GET /scan/<id>` returns 200 with the rendered comparison
- [ ] `generateMetadata` builds `openGraph.images = [/api/og/scan?...]` with real data
- [ ] WhatsApp + Twitter unfurl shows the OG card
- [ ] 404 page when id doesn't exist
- [ ] No new prisma migration required (reuses ScannedProduct)

---

### Stage 26 — First-party analytics ✅

**Why:** We don't measure anything. Bounce rate, scan completion rate, click-
through to affiliate, time-on-page — all opaque. We can't optimize what we
don't see. Off-the-shelf analytics (GA, Plausible) work but add a network
dep and a privacy-policy obligation; a first-party endpoint is cheaper and
keeps the data ours.

**Impact:** Real funnel data within a week. Every Sprint 12+ decision is
grounded in evidence.

**Files to change:**

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `TelemetryEvent` model |
| `app/api/track/route.ts` (new) | POST endpoint; validates event name; writes row |
| `lib/track.ts` (new) | Tiny client tracker; sessionId via sessionStorage; sendBeacon when available |
| `components/search-hub.tsx` | Fire scan_start / scan_complete / example_click / history_click |
| `components/share-button.tsx` | Fire share_click |
| `app/layout.tsx` | Fire page_view on mount (client component wrapper) |

**Event taxonomy:**
```
page_view       { path }
scan_start      { url, source: "manual"|"example"|"history"|"share_target" }
scan_complete   { url, savingsPercent, fromCache, durationMs }
scan_error      { url, errorCode }
example_click   { url }
history_click   { url }
share_click     { scanId, target: "native"|"clipboard" }
faq_open        { question }
```

**Acceptance:**
- [ ] Schema added; user runs migrate deploy
- [ ] sessionId persists for the session, no PII, no IP
- [ ] sendBeacon used on unload so navigation events survive
- [ ] Row count in TelemetryEvent grows as expected during a manual scan

---

### Stage 27 — Affiliate click tracking ✅

**Why:** We currently link straight to the AliExpress affiliate URL. We have
no idea how many people click. Without the click event we can't compute CTR
or attribute revenue when the Admitad postback eventually lands.

**Impact:** Foundation of revenue attribution. Required for any future "how
much money flowed through Busted?" answer.

**Files to change:**

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `AffiliateClick` model (scanId, target, createdAt) |
| `app/api/clicks/route.ts` (new) | POST endpoint that logs a click given { scanId, target } |
| `components/analysis-results.tsx` | onClick on the affiliate CTA fires a click POST (no await, fire-and-forget) |

**Note:** the CTA still navigates directly to AliExpress — we don't insert
ourselves as a redirect because that adds latency and breaks "right-click,
open in new tab". The tracker is a beacon POST in parallel.

**Acceptance:**
- [ ] Schema added
- [ ] Click → AffiliateClick row appears
- [ ] No latency hit on the CTA
- [ ] Works under right-click → open-in-new-tab (Pointer events both fire)

---

### Stage 28 — SEO foundations ✅

**Why:** Organic search is the cheapest growth channel for an
ecommerce-adjacent product. Today we have no sitemap, no robots.txt, no
canonical, no organization markup. A 30-minute investment captures every
future scan permalink in Google's index.

**Impact:** Compounding organic traffic. Each scan permalink becomes a long-
tail landing page for "X dropship" searches.

**Files to change:**

| File | Change |
|------|--------|
| `app/sitemap.ts` (new) | Metadata route; includes `/`, `/monitoring` (excluded), and recent scan permalinks (last 1000) |
| `app/robots.ts` (new) | Allow all; disallow `/api`, `/dev-monitor`, `/monitoring`; reference sitemap |
| `app/layout.tsx` | Add JSON-LD Organization schema; default OG image; canonical link generator |
| `public/og-default.png` (new) | Static 1200×630 fallback OG card |

**Acceptance:**
- [ ] `GET /sitemap.xml` returns valid XML
- [ ] `GET /robots.txt` references the sitemap
- [ ] View source on `/` shows `<script type="application/ld+json">` with Organization
- [ ] Default OG card renders on every page that doesn't set its own

---

### Stage 29 — Error boundary + client error capture ✅

**Why:** A JS exception in production is invisible today. The user sees
white screen; we hear nothing. A friendly error fallback + a `/api/errors`
endpoint that captures `window.onerror` and `unhandledrejection` gives us
visibility without a paid SaaS.

**Impact:** Errors are caught and surfaced; no more silent failures.

**Files to change:**

| File | Change |
|------|--------|
| `app/error.tsx` (new) | Friendly fallback with "Try again" + auto-report |
| `app/global-error.tsx` (new) | Same idea, root level |
| `prisma/schema.prisma` | Add `ClientError` model (message, stack, url, ua, createdAt) |
| `app/api/errors/route.ts` (new) | POST endpoint, rate-limited per session |
| `lib/error-reporter.ts` (new) | window.onerror + unhandledrejection → /api/errors via beacon |
| `app/layout.tsx` | Mount reporter via a small client component |

**Acceptance:**
- [ ] `throw new Error("test")` in a component shows the friendly page, not white
- [ ] ClientError row appears within 60s
- [ ] Stack traces are truncated to 4 KB to avoid bloat
- [ ] Rate-limited so a runaway error doesn't fill the table

---

### Stage 30 — Chrome extension scaffold (MV3) ✅

**Why:** Every successful product in this category — Honey, Capital One
Shopping, Rakuten, Karma — is fundamentally a browser extension. Users don't
visit a "compare prices" site every time they shop; they want the comparison
to appear *while* they shop. This sprint just plants the seed: Manifest V3
shell + a content script that detects Shopify product pages and shows a
floating "Bust this" pill.

**Impact:** Long-arc bet. Sprint 12+ will grow this into an inline price
overlay and one-click scan. Today: an installable proof.

**Files to change:**

| File | Change |
|------|--------|
| `extension/manifest.json` (new) | MV3 manifest; declares content script for `<all_urls>`, host_permissions |
| `extension/content.ts` (new) | Detects `application/ld+json` Product schema; injects `.busted-pill` |
| `extension/popup.html` (new) | Minimal popup with "Open Busted" + "Bust this page" |
| `extension/icons/` (new) | 16/48/128 icons (reuse `/icon.png`) |
| `extension/README.md` (new) | How to install unpacked + roadmap |
| `extension/styles.css` (new) | Pill styles, dark-mode safe, z-index 2147483647 |

**Acceptance:**
- [ ] `chrome://extensions` → Load unpacked → builds without manifest errors
- [ ] Visiting any Shopify product page shows a floating "Bust this" pill bottom-right
- [ ] Clicking the pill opens `https://busted.app/?url=<current_url>&utm_source=ext`
- [ ] No console errors on non-product pages

---

## Sprint 12 — Resilience & Extension v0.2 (this week)

**Started:** 2026-06-20  
**Theme:** make the product reliable enough for first real users; turn the
extension scaffold into something users see value from on every Shopify page.

**Why this sprint, why now.** The live test in `localhost` exposed concrete
brittleness: when Gemini's free-tier quota hit zero, every scan returned
"Analysis failed" — no degradation, no fallback. The example chips on the
homepage point at dead URLs. The category map covers 5 verticals; the test
showed shoes (a massive category) producing a vocab miss. The extension ships
a generic pill that doesn't convey the actual savings. Sprint 12 turns each of
those into "boring, reliable, useful."

**Goal metrics:**
- A scan with AI completely unavailable still shows the product card (today: white error screen)
- Demo example chips always link to live, fresh, high-confidence scans
- Category-vocab miss rate ≤ 30% on real traffic (today: every "shoes" / "kitchen" / "bottle" misses)
- Extension pill shows the *actual* savings number on any page we've previously scanned

### Stage 31 — Graceful AI degradation ✅

**Why:** Today a Gemini outage breaks the whole pipeline. Live test:
`gemini-2.0-flash` returned 429 → scrape succeeded but the API returned
`status: "error"` with no scrape data → UI showed the generic error banner.
First real users hitting any rate-limit window would bounce.

**Impact:** A degraded experience instead of a broken one. The user sees the
scraped product card with an amber "AI verdict unavailable — try again" note
and a retry button. Crawlbase + AliExpress traffic still earns us data.

**Files to change:**

| File | Change |
|------|--------|
| `lib/types/analyze.ts` | New `AnalyzePartialResponse` (status: "partial") with scrape data + `degradedReason: "ai_unavailable"` |
| `app/api/analyze/route.ts` | Catch the AI service failure; if scrape succeeded, return a partial response. Do NOT persist (cache stays MISS so a retry can re-attempt) |
| `lib/analyze/client.ts` | Forward partial as a normal resolution (not a throw); types updated |
| `lib/analyze/map-response.ts` | Map partial → `{ mode: "partial", storeOnly: StoreProduct, degradedReason }` |
| `components/partial-result.tsx` (new) | Amber-bordered card: product image + title + price + retry button |
| `components/search-hub.tsx` | When `phase === "complete"` and `result.mode === "partial"`, render `<PartialResult />` |
| `components/analytics-mount.tsx` | Fire `scan_partial` telemetry event |

**Acceptance:**
- [ ] With Gemini quota = 0, scanning Allbirds returns 200 with `status: "partial"`
- [ ] UI shows the product card + amber banner + "Retry scan" button
- [ ] Telemetry: `scan_partial` event written with `props.reason`
- [ ] Cache stays MISS (retry doesn't hit a poisoned cache row)

---

### Stage 32 — Multi-key Gemini failover ✅

**Why:** A single API key is a single point of failure. Today's free-tier key
limits us to 20–1500 req/day depending on model. Holding multiple keys (free
tier or otherwise) and rotating them lifts the effective limit linearly.

**Impact:** Resilience to per-key quota exhaustion. A `429` on key N moves
traffic to key N+1 within milliseconds; the exhausted key gets a 6-hour
cooldown before retry.

**Files to change:**

| File | Change |
|------|--------|
| `lib/ai/client.ts` | Parse `GOOGLE_AI_API_KEYS` (comma-separated) as well as the legacy `GOOGLE_AI_API_KEY`. Round-robin selection; per-key in-memory cooldown map |
| `.env.example` | Document `GOOGLE_AI_API_KEYS=key1,key2,key3` |

**Behaviour:**
- Pre-cooldown probe: skip any key currently in cooldown (last 429/503 < 6h ago)
- On 429/503: mark key as cooled, retry with next key, repeat until exhausted
- Total attempts = `keys.length × modelChain.length` (bounded)

**Acceptance:**
- [ ] One bad key + one good key → caller never sees the bad key's error
- [ ] All keys cooled → throw the existing "Google AI API error" with a useful summary
- [ ] Legacy single-key env still works (backwards compatible)
- [ ] No persistent state — purely in-memory, resets on cold start

---

### Stage 33 — Self-healing demo examples ✅

**Why:** Live test: 2 of 3 hardcoded example URLs are dead (calmo & casetify
return 404). New visitors who click those see "Analysis failed" — the worst
possible first impression.

**Impact:** Examples always point at scans we know succeed because we just
ran them. As cached scans roll over (TTL: 14d), examples roll over too. Zero
manual maintenance.

**Files to change:**

| File | Change |
|------|--------|
| `app/api/examples/featured/route.ts` (new) | Returns top 3 scans from last 30 days with `aliexpressData != null` AND savings > 50% AND no error in events |
| `lib/examples.ts` | Keep the static list as fallback only; add `fetchFeaturedExamples()` async loader |
| `components/search-hub.tsx` | Fetch featured on mount; merge with static fallback |

**Selection query:**
```typescript
prisma.scannedProduct.findMany({
  where: {
    aliexpressData: { not: Prisma.JsonNull },
    aiPrediction: { not: undefined },
    lastScrapedAt: { gt: thirtyDaysAgo },
  },
  orderBy: { lastScrapedAt: "desc" },
  take: 20, // sample pool — we pick the best 3 client-side
});
```

**Acceptance:**
- [ ] `/api/examples/featured` returns valid JSON in < 200 ms
- [ ] When DB has zero qualifying scans, static fallback list is shown
- [ ] Cached: `next: { revalidate: 3600 }`
- [ ] Each chip's URL is verified live before display (HEAD cache on the server)

---

### Stage 34 — Expand category map (+5 verticals) ✅

**Why:** Live test logged `[category-map] No vocab entry for "shoes"`. Shoes
alone are ~15% of dropship traffic. Adding 5 high-frequency verticals roughly
doubles the addressable surface for category-narrowed searches.

**Impact:** Each new vertical gets: category-ID-filtered AE search · price
band · negative keywords · variant axis mapping where applicable. Each lifts
match precision from ~50% to ~80% in that vertical.

**Verticals to add:**

| Vertical | Synonyms | Notes |
|---|---|---|
| `shoes` | shoe, sneaker, sneakers, slip-on, lounger, runner, trainer | broad; tight price band needed |
| `water bottle` | bottle, tumbler, thermos, flask, hydration | tumbler vs vacuum-flask distinction matters |
| `dog harness` | harness, leash, collar, pet harness, dog vest | seasonal demand spike pattern |
| `kitchen gadget` | peeler, slicer, grater, gadget, scraper, cutter | huge category; pick a few sub-verticals |
| `beauty tool` | facial roller, massager, gua sha, derma roller | high-margin dropship favourite |

**Files to change:**
- `lib/aliexpress/category-map.ts` — add 5 entries with categoryIds (one per vertical, found via a quick AE API probe)

**Acceptance:**
- [ ] `npm run verify:categories` passes for all 5 new verticals (after IDs populated)
- [ ] A "shoes" scan logs no `categoryVocabMiss` warn
- [ ] Match confidence on Allbirds wool lounger lifts from 55% → ≥ 70%

---

### Stage 35 — Test + polish scan permalink ✅

**Why:** Built last sprint, never opened. Need to verify it loads, the OG card
renders, and the share button + history drawer wire-through works end-to-end.

**Files to change:**

| File | Change |
|------|--------|
| `components/recent-scans.tsx` | Add a "View permalink" link on entries that carry `scanId` |
| `lib/scan-history.ts` | Persist `scanId` alongside the existing fields |
| `components/search-hub.tsx` | Pass `scanId` into `appendScan()` |
| `app/scan/[id]/page.tsx` | Verify; fix any rendering bugs |

**Acceptance:**
- [ ] Open `/scan/<id>` for a real cached scan → renders the comparison
- [ ] `view-source:` shows the OG meta with `/api/og/scan?...` URL
- [ ] History drawer entries that have `scanId` show a "View" affordance
- [ ] Share button on `/scan/<id>` builds the permalink URL (no `?url=`)

---

### Stage 36 — Extension v0.2: inline price pill ✅

**Why:** v0.1 ships a generic "Bust this product" pill. v0.2 makes the pill
actually carry the value-prop: when we've previously scanned the current URL,
show "AliExpress: $X · save Y%" right in the pill so the user sees the number
without clicking through.

**Impact:** First time the extension delivers value *on the page itself*. Sets
us up for v0.3 (background scans for unseen URLs, notifications for big finds).

**Files to change:**

| File | Change |
|------|--------|
| `app/api/extension/quick-lookup/route.ts` (new) | `GET ?url=...` returns cached scan data ONLY (never triggers a scrape). CORS headers for `chrome-extension://` origins |
| `extension/manifest.json` | Add `host_permissions` for `https://buy-pass-silk.vercel.app/*` |
| `extension/content.js` | After detecting a product page, fetch `/api/extension/quick-lookup`. If hit → render rich pill with savings %, supplier price, "Open Busted" affordance. If miss → keep v0.1 generic pill |
| `extension/content.css` | New rich-pill layout: two lines (price arrow + savings) |
| `extension/README.md` | Document new quick-lookup endpoint |

**Quick-lookup response shape:**
```typescript
{ found: false } |
{
  found: true;
  scanId: string;
  storeTitle: string;
  storePriceUsd: number;
  aliPriceUsd: number;
  savingsPercent: number;
  permalink: string; // /scan/<id>
}
```

**Acceptance:**
- [ ] Reload the extension; visit a product page previously scanned → rich pill appears with the real savings number
- [ ] Visit a product page never scanned → generic pill (v0.1 behaviour)
- [ ] Quick-lookup endpoint never invokes the scrape pipeline (no Crawlbase calls, no AI calls)
- [ ] CORS: response includes `Access-Control-Allow-Origin: *` and OPTIONS preflight 204
- [ ] Pill respects existing exclude_matches list

---

## Completed ✅

| Stage | Description | Commit |
|-------|-------------|--------|
| 1 | Run Prisma migration (`add-preprocessed-image-cache`) | — (manual) |
| 2 | Pin `GOOGLE_AI_IMAGE_MODEL` env var in Vercel | — (Vercel UI) |
| 3 | Live-test calmo.co.il through new pipeline | — (manual) |
| P5 fix | Fix `app_signature` smartmatch bug; wire locale + preprocess + category filter | `44fdb6f` |
| P7 | Build `preprocessForSmartMatch` + `PreprocessedImage` cache | `44fdb6f` |
| P7 | Build `lib/aliexpress/locale.ts` (35-TLD resolver) | `44fdb6f` |
| P7 | Build `lib/aliexpress/category-map.ts` (5-vertical seed table) | `44fdb6f` |
| P6 | Variant-aware matching: `sku.ts`, `match-variant.ts`, `match-confidence.ts` | prev |
| P5 | SmartMatch two-arm dispatch (base64 preferred, URL fallback) | `44fdb6f` |
| 12 | JSON-LD structured product extraction | `bac5776` |
| 11 | Per-store affiliate-link reputation scoring | `4f49057` |
| 10 | Hebrew/non-Latin title translation pre-pass | `17f89eb` |
| 9 | Image cleanup quality scorer + light-prompt retry | `436827f` |
| 8 | Monthly AE category-ID verification job | `3986f6d` |
| 7 | SmartMatch + preprocess outcome tracking | `4e3486a` |
| 6 | Category coverage-gap logging | `f52492b` |
| 5 | Variant-axis remapping (color→scent) | `f52492b` |
| 4 | Geo-aware keyword arms | `f52492b` |
| S8.5 | Dual-arm fetcher + 14-day HTML cache + vision-analysis cache | `d74988e` |

---

## Key file map

| Concern | File |
|---------|------|
| AE API calls (keyword + smartmatch) | `lib/aliexpress/api-client.ts` |
| Main supplier-find orchestrator | `lib/aliexpress/find-supplier.ts` |
| Variant dimension scoring | `lib/aliexpress/match-variant.ts` |
| Confidence + weighting | `lib/aliexpress/match-confidence.ts` |
| SKU fetch + in-memory cache | `lib/aliexpress/sku.ts` |
| Category IDs + keyword arms | `lib/aliexpress/category-map.ts` |
| TLD → locale resolution | `lib/aliexpress/locale.ts` |
| Gemini Vision preprocess | `lib/ai/preprocess-image.ts` |
| Preprocess DB cache | `lib/ai/preprocess-cache.ts` |
| Keyword extraction | `lib/aliexpress/keywords.ts` |
| Variant signal extraction | `lib/scraping/extract-variant.ts` |
