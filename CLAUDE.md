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
npm run build        # production build — the only full type-check (see below)
npm run start:prod   # production start
npm run lint         # ESLint
npm test             # vitest run (unit tests)
npm run test:watch   # vitest watch

# `npx tsc --noEmit` is INCREMENTAL via tsconfig.tsbuildinfo and will pass on a
# broken tree by skipping unchanged files. Delete that file first, or trust only
# `npm run build`. Never run a build while `next dev` is running — both write
# .next and the build fails with a misleading ENOENT on pages-manifest.json.

npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run db:push      # prisma db push

# Eval harness (pipeline accuracy testing)
npm run eval                       # replay all fixtures, print confusion matrix
npm run eval -- --skip-ai          # use cached ai-response.json (no API spend)
npm run eval -- --filter <slug>    # only fixtures whose id matches <slug>
npm run eval:capture -- <id> <url> <category>   # capture a live fixture
npm run eval:list                  # show fixtures grouped by category
npm run eval:retrieval             # ANN recall — live embedding calls, NOT CI-gated
npm run eval:match-headroom        # score every candidate with the real scorer
npm run eval:harvest               # 👍/👎 feedback → draft fixture candidates
npm run eval:model                 # benchmark models against the corpus

# Code graphs (see agent-os/standards/code-navigation.md)
npm run graph:cbm          # re-index codebase-memory (rarely needed — daemon watches)
npm run graph:graft        # structural graft cache ($0, no key)
npm run graph:graft:deep   # + LLM "meaning" tier
npm run graph:all          # all graphs
```

## Engineering Standards (`agent-os/`)

Load-bearing invariants live as small, diffable files in `agent-os/standards/`
rather than only as prose here. Pull them into context on demand:

```
/agent-os:inject-standards trust        # everything in trust/
/agent-os:inject-standards trust/presence-tier-contract
/agent-os:index-standards               # rebuild index.yml after adding files
```

| Touching | Read first |
|---|---|
| `lib/ai/` prompts or clamps | `ai/verdict-clamps`, `ai/derived-fields`, `eval/gates` |
| anything a user sees | `trust/presence-tier-contract`, `design/tokens` |
| `/store/[domain]` or anything public | `trust/public-accusation` |
| supplier matching or thresholds | `supplier/match-thresholds` |
| affiliate links or CTAs | `trust/affiliate-neutrality` |
| `extension/` | `extension/render-verbatim` |
| scrapers or error paths | `scraping/provider-chain` |
| committing on a shared tree | `git/branching-and-commits` |
| any nontrivial change | `change-discipline`, `code-navigation` |

`agent-os/product/context.md` holds the thesis and the open strategic
questions; `agent-os/tools/catalog.md` is the tooling and skills catalog.

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
verdict: "dropship" | "legit" | "insufficient_evidence" | "not_a_product" | "collection_page"
isLikelyDropship: boolean             // derived from verdict (always `verdict === "dropship"`), kept for back-compat
confidence: number                    // 0..1
productCategory: string
reasoning: string
reasoningSignals: string[]            // concrete evidence from the scrape — MUST be non-empty for dropship/legit
missingSignals: string[]              // what would have raised confidence
redFlags: string[]
aliexpressKeywords: string[]
styleTokens: string[]                 // browse-mode only — populated ONLY for collection_page
materialPriors: string[]              // browse-mode only — populated ONLY for collection_page
estimatedStorePriceUsd / estimatedSupplierPriceUsd / estimatedMarkupPercent
```

**Humility rules** (enforced in code via `applyClamps()` even if the model violates them):
- Empty `reasoningSignals` + verdict `dropship`/`legit` → demoted to `insufficient_evidence`, confidence clamped to ≤ 0.4
- Fewer than 3 scrape attributes (title >5 chars, price, description >50 chars, image) → confidence on dropship/legit clamped to ≤ `SPARSE_EVIDENCE_CONFIDENCE_CEILING`
- Verdict `insufficient_evidence` → confidence clamped to `[0.2, 0.5]`
- Verdict `not_a_product` → price estimates, `aliexpressKeywords`, `styleTokens` and `materialPriors` all zeroed; supplier search disabled in route handler
- Verdict `collection_page` → confidence floored at 0.7; prices and `aliexpressKeywords` cleared, but `styleTokens`/`materialPriors` **kept** (the browse path builds its query from category + those tokens)
- Every other verdict → `styleTokens`/`materialPriors` cleared, so browse-mode tokens never leak into the product path

`applyClamps()` code comments cite the prompt's rule numbers (`rule 2/3/7/10/11`) — renumbering the prompt means updating those comments.

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

## Codebase Navigation (codebase-memory)

This project is indexed into the **codebase-memory** knowledge graph (MCP server
`codebase-memory-mcp`, project name `Users-tzahore-github-busted`). It is the
default way to answer structural questions about this repo — a `trace_path` call
costs a few hundred tokens where the equivalent grep sweep costs tens of
thousands.

**The index maintains itself.** A background daemon watches the repo with a
git-aware watcher and re-indexes on change. Do not run `index_repository` as
routine hygiene after edits — only when `index_status` shows the project stale
or missing, or after a large external change (branch switch with a huge diff,
dependency bump, bulk codegen).

Rules:
- For "who calls X", "what breaks if I change X", "where is X", "what does this
  module do" — query the graph BEFORE grepping or reading source files.
- `trace_path(function_name=…, direction="inbound")` for callers and blast
  radius; `direction="outbound"` for dependencies. It returns the **transitive**
  chain, not just direct call sites.
- `search_graph(query="…")` to find code by name or intent;
  `get_code_snippet(qualified_name=…)` to read the exact source once found.
- `detect_changes()` maps the working diff to its blast radius — run it before
  touching anything load-bearing (`DropshipPrediction`, `computeMatchConfidence`,
  `MATCH_CONFIDENCE_MIN`, the analyze route).
- `get_architecture(aspects=["clusters"])` for orientation on unfamiliar areas.

**Coverage is best-effort, never proof.** Call `check_index_coverage` on the
paths behind any negative or exhaustive claim ("nothing calls X", "this is dead
code"). `index_status` currently flags `lib/index/embeddings.ts` (L131, L142)
and `scripts/index/cluster-products.ts` (L93) as `parse_partial` — constructs in
those ranges may be missing from the graph, so grep them directly rather than
trusting a graph miss. Absence from the flagged list is not a guarantee either.

`.env`, `node_modules`, `.next` and `graphify-out/` are excluded by design.

**graft is the third layer — concepts and prose, not call graphs.** `graft/` is a
gitignored local cache built from `npm run graph:graft` (structural, $0, no key)
plus `npm run graph:graft:deep` (adds an LLM "meaning" tier: a one-line summary
for every symbol). Use `graft ask "<question>" .` when the question is
*conceptual* ("how does presence tier get computed", "what does this module do")
and you want ranked symbols with `file:line` plus a plain-English summary.
Use `graft skeleton <file>` for a signatures-only view of one file's API surface.

Precedence — pick by question shape, do not query all three:
- **"who calls X" / "what breaks if I change X"** → codebase-memory `trace_path`.
  Authoritative for call edges.
- **"what is X" / "how does X work" / "where do I start"** → `graft ask`.
- **broad architecture prose / wiki** → graphify, on demand only.

`npm run graph:all` refreshes every graph at once. The deep tier runs on
`gemini-flash-latest` via `scripts/graft-deep.sh`, **not** the pipeline's pinned
`GOOGLE_AI_MODEL` — `graft/` is a regenerable cache so tracking the newest flash
is safe there, while the eval harness needs the pipeline model pinned.
`gemini-2.5-flash` produces summaries graft cannot parse; `gemini-2.5-pro` 404s
on the OpenAI-compat endpoint.

**graphify is deprecated for this repo.** It is kept only for `/graphify` wiki
generation on demand. It is not maintained by a watcher (it needs a manual
`graphify update .`), and its call edges are heuristic: asked for the callers of
`computeMatchConfidence` it missed both production callers
(`lib/aliexpress/find-supplier.ts`, `lib/supplier/router.ts`) and reported the
edges it did find in the wrong direction. Never use it for call-graph or
impact questions.

## Design Language

**Style**: migrating to **"The Ledger"** — dark textured room + opaque manila paper evidence, with a to-scale **markup bar** as the signature element. Full spec and rationale in **`DESIGN.md`**; read it before any UI work. Phases 1–3 (tokens, grain, blobs removed; `Paper`/`Stamp` primitives; tier-driven `VerdictSheet`) plus the motion pass have landed; the glass/bento surfaces below still exist and are being replaced phase by phase. The earlier "The Teardown" direction and its tear-to-reveal animation were **cancelled before being built** — see `DESIGN.md` §0.2.

**Dark mode is default** — `<html>` always has the `dark` class. Never remove it or add a light mode toggle without explicit user instruction.

### Color Tokens (dark mode)
Authoritative values live in `app/globals.css` — this table mirrors it, so update both together.

| Role | Value | Usage |
|------|-------|-------|
| Background | `oklch(0.11 0.014 48)` | The room — deep, near-neutral warm dark |
| Paper | `oklch(0.855 0.032 82)` | Opaque **manila** evidence stock. Consumed via `<Paper>`, never applied directly. NOT bone — `oklch(0.94 0.012 85)` was tried and read as a flashbang against the room, and as light mode leaking into a dark-only product |
| Paper ink | `oklch(0.24 0.03 55)` | Text on paper — 10.6:1 |
| Paper muted | `oklch(0.44 0.03 60)` | Secondary text on paper — 5.0:1. Use this, never `text-muted-foreground`, inside `<Paper>` |
| Paper rule | `oklch(0.24 0.03 55 / 0.2)` | Hairlines on paper |
| Paper money | `oklch(0.42 0.10 155)` | Savings green **on paper** — 5.2:1. `--success` scores 1.7:1 on manila and is invisible there. Chroma pinned into sRGB — 0.16 was out of gamut and being clamped |
| Primary/fire | `oklch(0.72 0.17 50)` | Amber-orange — brand, `flame` tier |
| Amber tier | `oklch(0.80 0.13 78)` | `amber` tier — must stay distinct from fire |
| Stamp | `oklch(0.55 0.22 27)` | **BUSTED stamp only** — never for errors. Chroma pinned into sRGB; 3.8:1 room / 3.5:1 paper |
| Success/relief | `oklch(0.68 0.14 155)` | Green — the user's win (savings, real link). Room only; on paper use Paper money |
| Destructive | `oklch(0.65 0.2 25)` | Red — errors and destructive actions |
| Border | `oklch(1 0.02 55 / 10%)` | Hairline white borders |

**Room tokens are not paper tokens.** Assume every room colour fails on paper
until measured, and measure by converting oklch to *linear* RGB and feeding the
WCAG luminance formula directly — running the sRGB transfer function over
already-linear values double-converts and fabricates failures.

**Design intensity is derived from `presenceTier`, never chosen**: `flame` → solid markup bar, count-up, stamp; `amber` → same sheet, ghosted bar, no stamp and no count-up; `silent` → one muted line, no card. Decorating the `silent` state defeats the purpose of having tiers. The tier must never be carried by hue alone — `--primary` and `--amber-tier` measure 1.38:1 (`DESIGN.md` §2.3).

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
