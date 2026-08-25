## Project

**Busted** — a Next.js product analysis tool. Enter a product URL; it scrapes the page, runs AI-powered dropship verification and supplier marketplace analysis, finds AliExpress alternatives, and converts the link to an affiliate link.

Brand name in code: "Busted" (SVG aria-label). Repo name is "BuyPass".

## Tech Stack

- **Framework**: Next.js (App Router, TypeScript)
- **UI**: Tailwind CSS + Radix UI + shadcn/ui (`components/ui/`). All className merging goes through `cn()` in `lib/utils.ts` — the most-connected node in the graph (63 edges).
- **Database**: Prisma + Neon Postgres. Schema is managed via `prisma/`. Client is `@prisma/client`.
- **AI**: `lib/ai/client.ts` provides a unified `AIClient` that wraps Google Generative AI (`@google/generative-ai`). Two AI modules: `dropship-verifier.ts` and `supplier-marketplace-analysis.ts`.
- **Scraping**: Crawlbase JS-render (primary) → Firecrawl markdown (fallback) → Playwright headless (last resort). Order is dynamic: `lib/learning/priors.ts` hoists a domain's `preferredProvider` and drops `skipProvider` at runtime. Entry point: `scrapeProductUrl()` in `lib/scraping/router.ts`.
- **Affiliate**: Admitad integration in `lib/affiliate/` (`convert-link.ts`, `validate-link.ts`).
- **AliExpress**: OAuth + product search in `lib/aliexpress/`. API client + scrape fallback.

## Key Dev Commands

```bash
npm run dev          # development server
npm run dev:turbo    # dev with Turbo
npm run dev:clean    # clean dev
npm run build        # production build
npm run start:prod   # production start
npm run lint         # ESLint

npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run db:push      # prisma db push

# Eval harness (pipeline accuracy testing)
npm run eval                       # replay all fixtures, print confusion matrix
npm run eval -- --skip-ai          # use cached ai-response.json (no API spend)
npm run eval -- --filter <slug>    # only fixtures whose id matches <slug>
npm run eval:capture -- <id> <url> <category>   # capture a live fixture
npm run eval:list                  # show fixtures grouped by category
```

## Architecture

The single main API route is `app/api/analyze/route.ts` (`POST()`). It orchestrates:

1. **Validate** URL → `validateProductUrl()` (`lib/analyze/client.ts`)
2. **Cache check** → `findValidCachedProduct()` (`lib/cache/product-cache.ts`)
3. **Scrape** → `scrapeProductUrl()` → Firecrawl → Playwright fallback
4. **Extract** → `extractProductAttributes()` (`lib/scraping/extract-product.ts`)
5. **AI analysis** → `verifyDropshipLikelihood()` + `buildSupplierMarketplacePrediction()`
   - Returns a `verdict` enum: `"dropship" | "legit" | "insufficient_evidence" | "not_a_product"`
   - If verdict is `not_a_product` or `insufficient_evidence`, step 6 is **skipped** (no supplier search runs).
6. **Supplier search** → `findAliExpressSupplier()` if enabled — runs match-confidence scoring on the top 5 candidates; rejects with `ALIEXPRESS_NO_CONFIDENT_MATCH` (soft skip) when best score < 0.4
7. **Affiliate** → `convertToAffiliateLink()` (Admitad)
8. **Persist** → `persistScannedProduct()` (`lib/cache/persist-product.ts`)

Secondary route: `app/api/dev-test/route.ts` (dev-only health probes, guarded by `isDevMonitorAllowed()`).

## AI Verdict Schema

`DropshipPrediction` (in `lib/ai/dropship-verifier.ts`) is the contract between the AI layer and everything downstream:

```ts
verdict: "dropship" | "legit" | "insufficient_evidence" | "not_a_product"
isLikelyDropship: boolean             // derived from verdict, kept for back-compat
confidence: number                    // 0..1
reasoningSignals: string[]            // concrete evidence from the scrape — MUST be non-empty for dropship/legit
missingSignals: string[]              // what would have raised confidence
redFlags: string[]
estimatedStorePriceUsd / estimatedSupplierPriceUsd / estimatedMarkupPercent
```

**Humility rules** (enforced in code via `applyClamps()` even if the model violates them):
- Empty `reasoningSignals` + verdict `dropship`/`legit` → demoted to `insufficient_evidence`, confidence clamped to ≤ 0.4
- Fewer than 3 scrape attributes (title >5 chars, price, description >50 chars, image) → confidence on dropship/legit clamped to ≤ 0.5
- Verdict `insufficient_evidence` → confidence clamped to `[0.2, 0.5]`
- Verdict `not_a_product` → all price estimates zeroed; supplier search disabled in route handler

The cache parser (`lib/types/cache.ts`) accepts both the new shape and legacy boolean-only entries (derives `verdict` from `isLikelyDropship`).

## AliExpress Match Confidence

`lib/aliexpress/match-confidence.ts` exports `computeMatchConfidence(scrapedAttrs, storePriceUsd, candidate)`. Returns:

```ts
score: number              // 0..1
quality: "high" | "medium" | "low" | "none"
titleOverlap: number       // Jaccard on normalized tokens
priceRatio: number | null
priceVerdict: "plausible_markup" | "no_markup" | "absurd" | "unknown"
reasons: string[]          // human-readable explanation
```

**Base weights (text-only):** title overlap 55% · price ratio sanity 30% · seller trust (orders + rating) 15%.

**Folded weights (when image AI runs):** image 55% · title 25% · price 12% · trust 8%. If image AI flags `sameFunction=false`, the score is hard-clamped to ≤ 0.35 regardless of text similarity. This is the "manual bottle cap opener vs cap launcher" guard.

`findAliExpressSupplier()` (`lib/aliexpress/find-supplier.ts`) re-ranks the top 5 trust-ranked candidates by match score, runs image AI on the top 3 (see below), and returns the highest. If best score < `MATCH_CONFIDENCE_MIN` (0.4), it throws `ALIEXPRESS_NO_CONFIDENT_MATCH` — the route handler converts this to a soft skip rather than an error.

### Image-based match verification

`lib/ai/image-match.ts` exports `compareProductImagesWithAI({ sourceTitle, sourceImageUrl, candidates })`. It:

1. Fetches the source product image + up to 3 candidate images in parallel (8s timeout, 4MB cap each)
2. Sends them all in **one multimodal Gemini call** asking "which candidate is the same product with the same function?"
3. Returns `{ bestCandidateId, bestScore, scores[], rejectionReason }` — `bestCandidateId=null` when no candidate qualifies
4. Gracefully returns `null` on any fetch/API failure — never breaks the pipeline

Image AI runs on the top 3 text-ranked candidates UNLESS:
- The scraped product has no `mainImageUrl`
- The top text score is already ≥ 0.85 (text already very confident — skip the cost)
- `IMAGE_MATCH_ENABLED=false` is set (kill switch)

If image AI returns `bestCandidateId=null` OR `bestScore < IMAGE_MATCH_MIN` (0.5), the whole supplier match is rejected with `ALIEXPRESS_NO_CONFIDENT_MATCH` — soft-skipped by the route, no wrong supplier shown.

Image AI cost: ~$0.0001 per call (4 images × ~258 tokens). Latency: ~2-4s.

The response surfaces `supplierMatchConfidence`, `supplierMatchQuality`, `supplierMatchReasons`, `supplierImageMatchScore`, `supplierImageMatchSameFunction`, and `supplierImageMatchReasoning` so the UI can render an "Image-verified" badge on high-quality matches and a "Image AI saw: …" panel with a ⚠ "different function detected" warning when applicable.

## Eval Harness

Offline fixture-replay framework at `tests/eval/` and `scripts/eval/`. Lets us measure precision/recall and confidence calibration across prompt/threshold changes without burning API credits.

Layout:
- `tests/fixtures/seed-urls.json` — ~50-URL seed list across 5 categories
- `tests/fixtures/products/<id>/` — one folder per fixture: `truth.json`, `scrape.json`, `ai-response.json`, `aliexpress.json`
- `tests/eval/fixture-types.ts` — TS schema for the fixture files
- `lib/eval/fixture-store.ts` — loader (`loadAllFixtures()`, `saveFixture()`)
- `scripts/eval/capture-fixture.ts` — runs the live pipeline once per URL, dumps every stage
- `scripts/eval/run-fixtures.ts` — replays fixtures, prints confusion matrix + confidence calibration + supplier precision/recall + per-fixture failures
- `scripts/eval/list-fixtures.ts` — quick listing helper

When modifying the prompt (`lib/ai/dropship-verifier.ts`) or scoring (`lib/aliexpress/match-confidence.ts`), always run `npm run eval -- --skip-ai` before and after to measure the delta. Empty `reasoningSignals` is a code-side hard fail — the model can't escape it.

## Key Files

| File | Purpose |
|------|---------|
| `lib/utils.ts` | `cn()` — className utility, called everywhere |
| `lib/ai/client.ts` | `AIClient` — unified AI provider wrapper |
| `lib/ai/dropship-verifier.ts` | Dropship likelihood prediction |
| `lib/ai/supplier-marketplace-analysis.ts` | Supplier marketplace classification |
| `lib/scraping/router.ts` | `scrapeProductUrl()` — scraping entry point |
| `lib/scraping/firecrawl.ts` | `scrapeWithFirecrawl()` — primary scraper |
| `lib/scraping/extract-product.ts` | `extractProductAttributes()` — HTML → structured data |
| `lib/affiliate/convert-link.ts` | Admitad affiliate link conversion |
| `lib/aliexpress/api-client.ts` | AliExpress product search |
| `lib/aliexpress/oauth.ts` | AliExpress OAuth + request signing |
| `lib/cache/product-cache.ts` | Product cache lookup |
| `lib/cache/verified-map.ts` | VerifiedProductMap ("Gold Path") — confirmed retail→supplier mappings that bypass the whole pipeline; written by 👍 feedback or high-confidence auto-commit |
| `lib/index/embeddings.ts` | Gemini embeddings + pgvector ANN (`ProductEmbedding`); lookup behind `VECTOR_INDEX_ENABLED` |
| `scripts/index/cluster-products.ts` | `npm run index:cluster` — canonical product clustering (seed pairs → distance merge → image-AI band); `--calibrate` before changing thresholds |
| `lib/cache/persist-product.ts` | Cache write-back |
| `lib/dev-monitor/service-probes.ts` | Health probes (AI, scraper, DB, affiliate) |
| `lib/types/debug.ts` | `AnalyzeDebugInfo` — shared debug type (13 edges) |
| `components/search-hub.tsx` | Main search UI |
| `components/analysis-results.tsx` | Results display (renders match-quality badge + uncertain-match warning) |
| `app/dev-monitor/` | Dev-only monitoring dashboard |
| `lib/aliexpress/match-confidence.ts` | `computeMatchConfidence()` + `foldImageMatchIntoConfidence()` — title/price/trust + image AI scoring for AliExpress candidates |
| `lib/aliexpress/find-supplier.ts` | Wires match-confidence + image AI into the supplier search; soft-skips on `NO_CONFIDENT_MATCH` |
| `lib/ai/image-match.ts` | `compareProductImagesWithAI()` — multimodal Gemini call comparing scraped image vs top AliExpress candidate images |
| `lib/tier0/store-fingerprint.ts` | Tier-0 deterministic dropship fingerprint gate — zero-token verdict for template stores; short-circuits the AI call in the dropship-verdict service |
| `lib/analyze/presence-tier.ts` | `computePresenceTier()` — server-side flame/amber/silent mapping, the extension badge contract |
| `extension/` | Chrome extension MV3 (vanilla JS, no build step) — passive badge + popup; renders `presenceTier` verbatim, silence on error |
| `ROADMAP.md` | Product vision, pillars, phase roadmap — durable across sessions; keep in sync with reality |
| `lib/eval/fixture-store.ts` | Loader for the eval fixture system |
| `tests/eval/fixture-types.ts` | Schema for `truth.json` + cached scrape/AI/AliExpress fixtures |
| `scripts/eval/run-fixtures.ts` | `npm run eval` — confusion matrix + calibration + per-fixture failures |
| `scripts/eval/capture-fixture.ts` | `npm run eval:capture` — captures a live URL into a fixture |

## Codebase Navigation (graphify)

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, much smaller than raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Design Language

**Style**: migrating to **"The Teardown"** — dark textured room + opaque paper evidence. Full spec and rationale in **`DESIGN.md`**; read it before any UI work. Phase 1 (tokens, grain, blob removal) has landed; the glass/bento surfaces below still exist and are being replaced phase by phase.

**Dark mode is default** — `<html>` always has the `dark` class. Never remove it or add a light mode toggle without explicit user instruction.

### Color Tokens (dark mode)
Authoritative values live in `app/globals.css` — this table mirrors it, so update both together.

| Role | Value | Usage |
|------|-------|-------|
| Background | `oklch(0.11 0.014 48)` | The room — deep, near-neutral warm dark |
| Paper | `oklch(0.94 0.012 85)` | Opaque bone evidence surface (`.paper`) |
| Paper ink | `oklch(0.20 0.02 60)` | Text on paper |
| Primary/fire | `oklch(0.74 0.18 52)` | Amber-orange — brand, `flame` tier |
| Amber tier | `oklch(0.80 0.13 78)` | `amber` tier — must stay distinct from fire |
| Stamp | `oklch(0.55 0.24 27)` | **BUSTED stamp only** — never for errors |
| Success/relief | `oklch(0.70 0.15 155)` | Green — the user's win (savings, real link) |
| Destructive | `oklch(0.65 0.2 25)` | Red — errors and destructive actions |
| Border | `oklch(1 0.02 55 / 10%)` | Hairline white borders |

**Design intensity is derived from `presenceTier`, never chosen**: `flame` → full teardown; `amber` → paper dossier, no stamp; `silent` → one muted line, no card. Decorating the `silent` state defeats the purpose of having tiers.

### Glass Effect Pattern
Use these Tailwind classes together for glassmorphism cards:
```
border border-white/8 bg-white/[0.04] backdrop-blur-xl
```
For more opaque surfaces (inside cards): `bg-white/[0.07] backdrop-blur-sm`

Custom `.glass` and `.glass-md` utility classes are defined in `globals.css`.

### Ambient Background
- **Film grain on `body::after`** (`app/globals.css`) — one tiled inline SVG turbulence, no network request, `z-index: 100` so it sits over every app layer (highest in use is the recent-scans drawer at `z-[70]`), `pointer-events: none`.
- **Never animate the grain**, and never reintroduce the ambient blur blobs or the dot grid: the blobs were the strongest "generic AI SaaS" tell and among the most expensive things on the page to paint. Removed from `app/page.tsx`, `app/scan/[id]/page.tsx`, `app/store/[domain]/page.tsx`.

### Typography
- Font: Geist Sans (variable, loaded in `layout.tsx`)
- Headlines: `font-black tracking-tight` with gradient text (`bg-gradient-to-br ... bg-clip-text text-transparent`)
- Primary gradient: `from-primary via-orange-400 to-amber-300`
- Success gradient: `from-success via-emerald-400 to-green-300`
- Body: `text-muted-foreground` at 16px min

### Bento Grid Cards
```
rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm
transition-colors hover:border-white/12 hover:bg-white/[0.05]
```
- Large step numbers as background watermark: `text-8xl font-black text-foreground/[0.04]`
- Icon containers: `rounded-xl border border-white/10 bg-white/5 p-3`

### Button Styles
- Primary CTA: `bg-primary shadow-lg shadow-primary/25 hover:shadow-primary/30`
- Success CTA: `bg-success shadow-lg shadow-success/20 hover:shadow-success/30`
- `.glow-primary` and `.glow-success` utility classes in `globals.css`

### Animation
Full motion system in `DESIGN.md` §7. The load-bearing details:
- **One house curve**, `cubic-bezier(0.2, 0, 0, 1)`, set in `app/globals.css` by
  overriding the *stock* Tailwind tokens `--ease-out` and
  `--default-transition-timing-function`. Both stock curves ramp in before they
  move; overriding the standard names means `ease-out` and every bare
  `transition-*` inherit the house curve with no call-site change.
- Entry: `animate-in fade-in slide-in-from-bottom-2 ease-out duration-300`
  (fade + 8px rise). **`ease-out` is not optional** — `tw-animate-css` defines
  `--animate-in` with a `var(--tw-ease, ease)` fallback, so an `animate-in`
  with no `ease-*` class silently animates on plain `ease`, which ramps in.
- Transitions: name the properties (`transition-[color,box-shadow]`), 150–300ms.
  Never `transition-all`.
- Press: `active:scale-[0.96]` — never below `0.95`.
- `prefers-reduced-motion` (`globals.css`): entry *animations* jump to their
  final state, but *transitions* are narrowed to opacity/colour rather than
  killed. Zeroing every transition makes meaningful state changes teleport,
  which is the jarring result the transition existed to prevent.
- `animate-pulse` is for skeletons only — never on status text being read.

### Accessibility
- Contrast ≥4.5:1 on all text (`muted-foreground` on dark meets AA)
- All icon-only elements have `aria-hidden="true"`; interactive controls have labels
- Decorative blobs get `aria-hidden="true"`
- No `outline: none` overrides — keep default ring styles

## Conventions

- `cn()` from `lib/utils.ts` for all className merges — never concatenate class strings directly.
- All API errors go through `lib/api/error-utils.ts` (`getSafeErrorMessage`, `resolveErrorCode`, `resolveHttpStatus`, `logPipelineError`).
- Dev-only routes/features are gated by `isDevMonitorAllowed()`.
- AliExpress supplier search is feature-flagged via `isSupplierSearchEnabled()` (`lib/aliexpress/supplier-enabled.ts`).
- Scraping source detection happens in `lib/scraping/detect-source.ts` before routing to the right scraper.
- **Never widen AI confidence without updating clamps**: if you add a new verdict or relax a rule in `dropship-verifier.ts`, the `applyClamps()` function must enforce the same invariants in code.
- **Match-confidence threshold (`MATCH_CONFIDENCE_MIN = 0.4`)**: only change after running `npm run eval` before and after — false positives (wrong supplier shown for legit/non-product pages) are the most damaging failure mode.
- **Image AI never gates the basic flow**: `compareProductImagesWithAI()` returns `null` on any failure and the supplier search falls back to the text-only score. Don't add `throw` paths inside the image-match module.
- **`IMAGE_MATCH_ENABLED=false`** in env is the emergency kill switch — leave the code path intact even when disabled.
- **`TIER0_FINGERPRINT_ENABLED=false`** kills the Tier-0 fingerprint gate (`lib/tier0/store-fingerprint.ts`). Tier-0 fires only on multi-signal deterministic evidence and runs in the production verdict path — `npm run eval` fails on any Tier-0 false fire (non-dropship fixture firing), so changing its patterns requires a green eval.
- **`presenceTier` is the only UI confidence contract**: flame/amber/silent is computed server-side in `lib/analyze/presence-tier.ts`. Clients (extension, web) must render it verbatim and treat missing/error as silent — never re-derive tiers from confidence client-side.
- When changing `DropshipPrediction` shape, update `parseCachedAiPrediction()` in `lib/types/cache.ts` to keep back-compat for older cached entries.
- New eval fixtures must include a hand-edited `truth.json` — never trust the auto-stubbed one from `eval:capture`.

## Lessons

Read `.claude/lessons.md` before non-trivial work. Append a one-line lesson whenever something goes wrong or an invariant surprises you.
