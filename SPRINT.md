# Busted — Pipeline Improvement Sprint

**Started:** 2026-06-19  
**Branch:** main  
**Owner:** Roy Tzahor  

Tracks stages 4–12 of the AliExpress supplier-matching pipeline upgrade.
Stages 1–3 (Prisma migration, env var pin, live calmo test) were completed 2026-06-19.

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

### Stage 4 — Geo-aware keyword arms (`searchAliExpressProducts`) ⬜

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

### Stage 5 — Variant-axis remapping (shower steamers + analogs) ⬜

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

### Stage 6 — Category coverage-gap logging ⬜

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

### Stage 7 — SmartMatch outcome tracking ⬜

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

### Stage 8 — AE category-ID verification job ⬜

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

### Stage 9 — Source-image inpaint quality scorer ⬜

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

### Stage 10 — Hebrew → English title translation pre-pass ⬜

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

### Stage 11 — Per-store affiliate-link reputation ⬜

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

### Stage 12 — JSON-LD variant extraction (replace Markdown regex) ⬜

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
