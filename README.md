<div align="center">
  <img src="public/logo.svg" alt="Busted" width="200" />
  <br /><br />
  <p><strong>Paste a product URL. Busted scrapes it, scores it with AI, and finds the same item on AliExpress — so you can skip the dropship markup.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma" alt="Prisma" />
    <img src="https://img.shields.io/badge/AI-Gemini_Flash-orange?logo=google" alt="Gemini Flash" />
  </p>
</div>

---

## What it does

Many products sold on Instagram, Shopify, and independent stores are sourced wholesale from AliExpress and marked up 3–10×. Busted lets you:

1. **Paste any retail product URL** — Shopify, WooCommerce, or any independent store
2. **Get an AI-scored dropship verdict** — Gemini Flash returns one of four explicit verdicts: `dropship`, `legit`, `insufficient_evidence`, or `not_a_product`. It refuses to predict on blog posts, homepages, and sparse scrapes instead of guessing
3. **See the original AliExpress supplier — only when confident** — match scoring on title, price ratio, seller trust, image similarity, and variant attributes; if the best candidate scores below 0.4 the supplier slot is left empty with a "no confident match" message
4. **Buy direct** — Busted generates an affiliate link so you get the savings and the hosting covers itself

Results are cached for 7 days, so repeat lookups are instant.

## Architecture

```
User
 │
 └─► POST /api/analyze
        │
        ├─1─ Validate URL
        ├─2─ Check 7-day cache (Prisma / Neon Postgres)
        ├─3─ Scrape page ──► Dual-arm: Crawlbase JS-render (primary)
        │                └──────────── Firecrawl markdown (fallback)
        │                └──────────── Playwright headless (last resort)
        ├─4─ Extract product attributes
        │       ├── JSON-LD structured data (Shopify / WooCommerce schema.org)
        │       ├── Shopify window.ShopifyAnalytics.meta (variant extraction)
        │       ├── Non-Latin title translation (Hebrew/Arabic/CJK → Gemini Flash)
        │       └── Markdown / OG-tag fallback
        ├─5─ AI verdict ──► verifyDropshipLikelihood()   (Gemini)
        │                  → dropship | legit | insufficient_evidence | not_a_product
        │                  → reasoningSignals[] + missingSignals[]
        │                  └─ skips supplier search on weak verdict
        ├─6─ AliExpress supplier search (multi-arm)
        │       ├── OCR model-number arm (if Gemini Vision found serial codes)
        │       ├── Material/spec keyword arm (TPU, 450ml, Type-C …)
        │       ├── AI functional keyword arms (identity-grounded)
        │       ├── Title keyword arm
        │       ├── Category keyword arm (geo-aware: IL/ILS, US/USD …)
        │       ├── SmartMatch image arm (Gemini-cleaned base64 → AliExpress visual search)
        │       └── Negative keyword filter (category vocab + material-derived)
        ├─7─ Candidate ranking
        │       ├── Text match confidence (title + price + seller trust)
        │       ├── Affiliate-link reputation penalty (>80% failure rate → 0.7×)
        │       ├── Batch image rerank (Gemini Vision, top 12 in one call)
        │       ├── Deep image verification (same product + same function?)
        │       └── Variant axis matching (color→scent remapping etc.)
        ├─8─ Generate affiliate link (AliExpress API or Admitad)
        └─9─ Persist result to cache
```

A secondary route at `POST /api/dev-test` runs live health probes (AI, scraper, database, affiliate) and is only accessible in development via `isDevMonitorAllowed()`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) — App Router, Server Components |
| Language | TypeScript 5.8, strict mode |
| UI | Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com) + Radix UI |
| Database | [Neon](https://neon.tech) serverless Postgres via [Prisma 6](https://prisma.io) |
| AI | Google Gemini Flash — verdict, image cleanup, OCR/material analysis, translation, vision rerank |
| Scraping | Crawlbase (JS render, primary) · [Firecrawl](https://firecrawl.dev) · Playwright (fallback) |
| AliExpress | Open Platform API (keyword + SmartMatch + SKU detail) · scrape fallback |
| Affiliate | AliExpress Open Platform API · Admitad (fallback) |
| Icons | [Lucide React](https://lucide.dev) |
| Design | Cinematic dark mode · Glassmorphism · Bento grid |

## Project structure

```
app/
  api/analyze/route.ts       # Main analysis pipeline (POST)
  api/dev-test/route.ts      # Health probes (dev only)
  dev-monitor/               # Live diagnostics dashboard
  layout.tsx / page.tsx      # Root layout + home page
components/
  search-hub.tsx             # URL input + result orchestration
  analysis-results.tsx       # Price comparison bento card
  analysis-tabs.tsx          # Product / Pipeline tab switcher
  pipeline-waterfall.tsx
  ui/                        # shadcn/ui primitives
lib/
  ai/
    preprocess-image.ts      # Gemini image cleanup + OCR/material analysis (single round-trip)
    translate-title.ts       # Non-Latin title → English (Hebrew, Arabic, CJK, Korean)
    image-match.ts           # Deep per-candidate visual verification
    image-rerank.ts          # Batch rerank (top 12 in one Gemini call)
    dropship-verifier.ts
  aliexpress/
    find-supplier.ts         # Multi-arm supplier search orchestrator
    category-map.ts          # Geo-aware vocab, variant axis mappings, negative keywords
    reputation.ts            # Per-store affiliate-link failure tracking
    match-variant.ts         # Variant axis remapping (color→scent etc.)
    api-client.ts            # AliExpress MTOP API + SmartMatch
  scraper/
    fetch-product.ts         # Dual-arm fetcher: Crawlbase primary / Firecrawl fallback
  scraping/
    router.ts                # Scrape pipeline + translation pre-pass
    extract-jsonld.ts        # Schema.org JSON-LD product + offer extraction
    firecrawl.ts             # Firecrawl markdown + HTML
    playwright-fallback.ts
  affiliate/                 # Admitad link conversion + validation
  analyze/                   # Client-side helpers, pipeline waterfall
  cache/                     # Product cache read/write
  services/                  # Service-layer orchestration + stage cache
  dev-monitor/               # Service probe types and runners
  types/                     # Shared TypeScript types
prisma/
  schema.prisma              # ScannedProduct · PreprocessedImage · SupplierReputation
scripts/
  verify-category-ids.ts     # Monthly AliExpress category-ID verification
.github/
  workflows/
    verify-category-ids.yml  # Monthly GHA cron; opens issue on mismatch
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | LTS recommended |
| npm | ≥ 10 | Bundled with Node 20 |
| Git | any | |
| A Neon Postgres database | — | Free tier works |
| A Firecrawl API key | — | Free tier works for testing |
| A Google AI API key | — | Gemini Flash is free-tier eligible |

## Setup

### macOS

```bash
# 1. Install Node.js via Homebrew (if not already installed)
brew install node@20

# 2. Clone the repo
git clone https://github.com/<your-username>/busted.git
cd busted

# 3. Install dependencies
npm install

# 4. Configure environment variables
cp .env.example .env.local
# Open .env.local and fill in the required keys (see below)

# 5. Push the database schema
npm run db:push

# 6. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Windows

```powershell
# 1. Install Node.js (if not already installed)
winget install OpenJS.NodeJS.LTS

# Restart your terminal, then:

# 2. Clone the repo
git clone https://github.com/<your-username>/busted.git
cd busted

# 3. Install dependencies
npm install

# 4. Configure environment variables
copy .env.example .env.local
# Open .env.local in your editor and fill in the required keys (see below)

# 5. Push the database schema
npm run db:push

# 6. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> [!NOTE]
> The `dev:clean` and `start:prod` scripts use shell syntax (`rm -rf`). On Windows, run them inside Git Bash or WSL, or use PowerShell equivalents.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values below.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooled URL recommended) |
| `GOOGLE_AI_API_KEY` | Google AI Studio API key for Gemini Flash |
| `FIRECRAWL_API_KEY` | Firecrawl API key for web scraping |

### Scraping (optional — adds Crawlbase primary arm)

| Variable | Description |
|---|---|
| `CRAWLBASE_TOKEN` | Crawlbase API token for JS-rendered HTML scraping |

> [!TIP]
> When `CRAWLBASE_TOKEN` is set, Busted fetches a fully JS-rendered page first and extracts structured Shopify variant data (JSON-LD + `window.ShopifyAnalytics.meta`) before falling through to Firecrawl. This catches single-page stores that render product details entirely in JavaScript.

### AliExpress supplier search (optional but recommended)

| Variable | Description |
|---|---|
| `ALIEXPRESS_APP_KEY` | AliExpress Open Platform app key |
| `ALIEXPRESS_APP_SECRET` | AliExpress Open Platform app secret |
| `ALIEXPRESS_TRACKING_ID` | Your AliExpress affiliate tracking ID |
| `ALIEXPRESS_CALLBACK_URL` | OAuth callback URL (auto-derived from `VERCEL_URL` if unset) |

> [!TIP]
> Without the AliExpress keys the supplier search falls back to scraping, which is slower and less accurate. Register a free developer account at [open.aliexpress.com](https://open.aliexpress.com) to get keys.

### Admitad affiliate fallback (optional)

| Variable | Description |
|---|---|
| `ADMITAD_CLIENT_ID` | Admitad OAuth client ID |
| `ADMITAD_CLIENT_SECRET` | Admitad OAuth client secret |
| `ADMITAD_WEBSITE_ID` | Your Admitad website/publisher ID |
| `ADMITAD_ALIEXPRESS_CAMPAIGN_ID` | The Admitad campaign ID for AliExpress |

Set `AFFILIATE_PROVIDER=admitad` to force Admitad, or leave as `auto` to prefer the AliExpress API.

### AI model overrides (optional)

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_AI_MODEL` | `gemini-2.0-flash` | Gemini model for verdict + analysis |
| `GOOGLE_AI_IMAGE_MODEL` | `gemini-3-flash-image` | Gemini model for image preprocessing |
| `GOOGLE_AI_VISION_MODEL` | `gemini-2.0-flash` | Gemini model for cleanup scoring + translation |

### Other

| Variable | Default | Description |
|---|---|---|
| `SCRAPER_TIMEOUT_MS` | `30000` | Max ms to wait for a scrape |
| `PLAYWRIGHT_FALLBACK_ENABLED` | `false` | Enable Playwright fallback scraper |
| `IMAGE_MATCH_ENABLED` | `true` | Set to `false` to skip vision-based supplier match verification |
| `NEXT_PUBLIC_APP_URL` | — | Your public deployment URL |

## Database

This project uses [Neon](https://neon.tech) serverless Postgres. The schema tracks:

- **`ScannedProduct`** — cached analysis results with a 7-day TTL, keyed by normalised URL
- **`PreprocessedImage`** — Gemini-cleaned product images cached by URL + category
- **`SupplierReputation`** — per-product affiliate-link success/failure counters; used to penalise suppliers with broken links
- **`User`** — authenticated users with cumulative savings tracking
- **`SearchHistory`** — per-user scan history

```bash
# Apply schema changes to your database
npm run db:push

# Run migrations (production)
npm run db:migrate

# Regenerate Prisma client after schema edits
npm run db:generate

# Verify AliExpress category IDs are still valid
npm run verify:categories
```

## Dev commands

```bash
npm run dev           # Start development server (http://localhost:3000)
npm run dev:turbo     # Start with Turbopack (faster HMR)
npm run dev:clean     # Wipe .next cache and restart
npm run build         # Production build
npm run start:prod    # Build + start production server
npm run lint          # Run ESLint
npm run verify:categories  # Check AliExpress category ID validity (also runs monthly via GHA)
```

## Accuracy & evaluation

The pipeline has three accuracy-critical stages — scraping, the AI verdict, and the AliExpress match — and a small mistake in any one of them can show a confidently wrong supplier. Busted ships with a fixture-replay harness so every prompt or threshold change is measurable, not vibes.

### AI verdict guardrails

`verifyDropshipLikelihood()` returns one of four verdicts:

| Verdict | Meaning | Downstream effect |
|---|---|---|
| `dropship` | Strong evidence of supplier-marketplace markup | Run AliExpress search |
| `legit` | Recognised brand / proprietary product | No supplier search |
| `insufficient_evidence` | Page is a product but scrape is too sparse | **Skip supplier search** |
| `not_a_product` | Blog post, homepage, category page, 404 | **Skip supplier search** |

Hard rules enforced in code (the model can't override them):

- Every `dropship`/`legit` verdict must cite ≥1 concrete `reasoningSignal` — empty array auto-demotes to `insufficient_evidence`
- Confidence clamped to ≤ 0.5 when fewer than 3 of `{title >5 chars, price, description >50 chars, image}` are present
- `insufficient_evidence` confidence always clamped to `[0.2, 0.5]`

### AliExpress match confidence

`computeMatchConfidence()` scores each candidate on:

- **Title overlap** (Jaccard token similarity) — 55% weight
- **Price ratio sanity** — 30% weight. `< 1.0×` = no markup, `> 50×` = absurd → rejected
- **Seller trust** (orders + rating) — 15% weight

If the top candidate scores below `MATCH_CONFIDENCE_MIN = 0.4`, the supplier slot is emptied with a "no confident match" message. Medium-quality matches (0.4–0.65) render a "verify before buying" warning panel.

### Gemini Vision preprocessing

Before dispatching the image to AliExpress SmartMatch, the product photo is sent to `GOOGLE_AI_IMAGE_MODEL` in a single dual-task round-trip:

1. **Image cleanup** — tight crop, white background, brand removal, artifact removal → cleaned JPEG
2. **Product analysis** — OCR traces (model numbers, serial codes), material tokens (TPU, ABS, S925 Silver), technical specs (450ml, IP67, Type-C) returned as JSON in the same call

The OCR traces and spec terms are injected as additional keyword search arms before the SmartMatch image call, so a product's own model number becomes a high-precision search query.

### Image-based match verification (Gemini Vision)

Text similarity alone misses a real failure mode: two products can share keywords but do different things. To catch this, the top 3 text-ranked candidates are sent to Gemini Vision in **one multimodal call**:

- The model returns per-candidate `sameProduct`, `sameFunction`, and a 0–1 score with one-sentence reasoning
- If `sameFunction=false` on the best match, the score is hard-clamped to ≤ 0.35 → soft-skipped
- If no candidate qualifies (`bestScore < 0.5`), the whole supplier match is rejected

When image AI runs, weights become: **image 55% · title 25% · price 12% · trust 8%**.

Image AI is **automatically skipped** when:
- The scraped product has no image
- Text confidence is already ≥ 0.85
- `IMAGE_MATCH_ENABLED=false` is set (kill switch)

### Affiliate-link reputation

Every time a buyer clicks a supplier link, the outcome (valid / broken) is persisted per `(productId, shipToCountry)`. Suppliers whose links fail more than 80% of the time across ≥5 samples receive a 0.7× confidence penalty, pushing them below competitors in the ranking even if their text score was higher.

### The eval harness

Offline fixtures replay through the AI + match-confidence pipeline using cached scrape JSON, so you can measure precision/recall without hitting Firecrawl, Gemini, or AliExpress.

```bash
npm run eval                                    # full eval; live AI on cached scrapes
npm run eval -- --skip-ai                       # replay cached AI responses — zero API spend
npm run eval -- --filter dropship               # only fixtures whose id contains "dropship"
npm run eval -- --skip-supplier                 # skip supplier matching entirely

npm run eval:capture -- <id> <url> [category]   # run live pipeline, save fixture
npm run eval:list                               # show fixtures grouped by category
```

The runner prints a confusion matrix, confidence calibration, supplier precision/recall, and per-fixture failures.

### Fixture layout

```
tests/
  eval/
    fixture-types.ts            # TS schema
    README.md                   # full workflow + capture-order recommendations
  fixtures/
    seed-urls.json              # ~50-URL seed list across 5 categories
    products/
      <fixture-id>/
        truth.json              # hand-labeled expected verdict + supplier
        scrape.json             # cached Firecrawl output
        ai-response.json        # cached AI response (optional)
        aliexpress.json         # cached AliExpress candidates (optional)
```

Categories: `dropship_obvious`, `dropship_subtle`, `legit_brand`, `not_a_product`, `aliexpress_itself`.

## Dev monitor

The `/dev-monitor` page (development only) shows live health probes for every external service — AI, scraper, database, and affiliate API. Each probe reports latency, status, and a JSON trace. Access it at [http://localhost:3000/dev-monitor](http://localhost:3000/dev-monitor).

> [!WARNING]
> The dev monitor route is gated by `isDevMonitorAllowed()` and returns 403 in production. Do not expose it publicly.

## Category verification

AliExpress occasionally re-numbers category IDs. A monthly GitHub Action (`verify-category-ids.yml`) calls `aliexpress.affiliate.productdetail.get` for a known factory listing in each vertical and checks whether the returned category IDs still match what's in `lib/aliexpress/category-map.ts`. If any mismatch is found, it opens a deduplicated GitHub issue tagged `aliexpress-category + maintenance`. Run it manually with:

```bash
npm run verify:categories
```

## Deployment

The simplest path is [Vercel](https://vercel.com):

1. Push the repo to GitHub
2. Import it in Vercel and set all environment variables from the tables above
3. Add your Vercel URL as `ALIEXPRESS_CALLBACK_URL` (e.g. `https://your-app.vercel.app/api/aliexpress/callback`)
4. Vercel runs `prisma generate` automatically via the `postinstall` script

The app has no server-side state beyond the database, so it runs cleanly on serverless edge functions. All Gemini calls are made server-side; no API keys are exposed to the browser.
