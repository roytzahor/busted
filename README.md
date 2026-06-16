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
3. **See the original AliExpress supplier — only when confident** — match scoring on title, price ratio, and seller trust; if the best candidate scores below 0.4 we tell you "no confident match" instead of showing a wrong product
4. **Buy direct** — Busted generates an affiliate link so you get the savings and we cover the hosting

Results are cached for 7 days, so repeat lookups are instant.

## Architecture

```
User
 │
 └─► POST /api/analyze
        │
        ├─1─ Validate URL
        ├─2─ Check 7-day cache (Prisma / Neon Postgres)
        ├─3─ Scrape page ──► Firecrawl (primary)
        │                └─► Playwright (fallback)
        ├─4─ Extract product attributes (title, price, image, store)
        ├─5─ AI verdict ──► verifyDropshipLikelihood()   (Gemini)
        │                  → dropship | legit | insufficient_evidence | not_a_product
        │                  → reasoningSignals[] + missingSignals[]
        │                  └─ skips supplier search if verdict is weak
        ├─6─ AliExpress search ──► API client
        │                      └─► scrape fallback
        │                      → text match-confidence (title + price + trust)
        │                      → image AI re-rank on top 3 (same product? same FUNCTION?)
        │                      → soft-skips below threshold (no wrong supplier shown)
        ├─7─ Generate affiliate link (AliExpress API or Admitad)
        └─8─ Persist result to cache
```

A secondary route at `POST /api/dev-test` runs live health probes (AI, scraper, database, affiliate) and is only accessible in development via `isDevMonitorAllowed()`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) — App Router, Server Components |
| Language | TypeScript 5.8, strict mode |
| UI | Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com) + Radix UI |
| Database | [Neon](https://neon.tech) serverless Postgres via [Prisma 6](https://prisma.io) |
| AI | Google Gemini Flash (`@google/generative-ai`) |
| Scraping | [Firecrawl](https://firecrawl.dev) · Playwright (fallback) |
| Affiliate | AliExpress Open Platform API · Admitad (fallback) |
| Icons | [Lucide React](https://lucide.dev) |
| Design | Cinematic dark mode · Glassmorphism · Bento grid |

## Project structure

```
app/
  api/analyze/route.ts     # Main analysis pipeline (POST)
  api/dev-test/route.ts    # Health probes (dev only)
  dev-monitor/             # Live diagnostics dashboard
  layout.tsx / page.tsx    # Root layout + home page
components/
  search-hub.tsx           # URL input + result orchestration
  analysis-results.tsx     # Price comparison bento card
  analysis-tabs.tsx        # Product / Pipeline tab switcher
  dropship-analysis-results.tsx
  pipeline-waterfall.tsx
  ui/                      # shadcn/ui primitives
lib/
  ai/                      # AIClient, dropship verifier, marketplace analysis
  aliexpress/              # OAuth, API client, ranking, scrape fallback
  affiliate/               # Admitad link conversion
  analyze/                 # Client-side helpers, pipeline waterfall
  cache/                   # Product cache read/write
  scraping/                # Firecrawl, Playwright, attribute extraction
  dev-monitor/             # Service probe types and runners
  types/                   # Shared TypeScript types
prisma/
  schema.prisma            # ScannedProduct + User + SearchHistory models
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

### Other

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_AI_MODEL` | `gemini-3.5-flash` | Gemini model to use |
| `SCRAPER_TIMEOUT_MS` | `30000` | Max ms to wait for a scrape |
| `PLAYWRIGHT_FALLBACK_ENABLED` | `false` | Enable Playwright fallback scraper |
| `IMAGE_MATCH_ENABLED` | `true` | Set to `false` to skip vision-based supplier match verification (emergency kill switch) |
| `NEXT_PUBLIC_APP_URL` | — | Your public deployment URL |

## Database

This project uses [Neon](https://neon.tech) serverless Postgres. The schema tracks:

- **`ScannedProduct`** — cached analysis results with a 7-day TTL, keyed by normalised URL
- **`User`** — authenticated users with cumulative savings tracking
- **`SearchHistory`** — per-user scan history

```bash
# Apply schema changes to your database
npm run db:push

# Run migrations (production)
npm run db:migrate

# Regenerate Prisma client after schema edits
npm run db:generate
```

## Dev commands

```bash
npm run dev           # Start development server (http://localhost:3000)
npm run dev:turbo     # Start with Turbopack (faster HMR)
npm run dev:clean     # Wipe .next cache and restart
npm run build         # Production build
npm run start:prod    # Build + start production server
npm run lint          # Run ESLint
```

## Accuracy & evaluation

The pipeline has three accuracy-critical stages — scraping, the AI verdict, and the AliExpress match — and a small mistake in any one of them can show a confidently wrong supplier to a customer. Busted ships with a fixture-replay harness so every prompt or threshold change is measurable, not vibes.

### AI verdict guardrails

`verifyDropshipLikelihood()` returns one of four verdicts:

| Verdict | Meaning | Downstream effect |
|---|---|---|
| `dropship` | Strong evidence of supplier-marketplace markup | Run AliExpress search |
| `legit` | Recognised brand / proprietary product | No supplier search (no markup to expose) |
| `insufficient_evidence` | Page is a product but scrape is too sparse to judge | **Skip supplier search** |
| `not_a_product` | Blog post, homepage, category page, 404 | **Skip supplier search** |

Hard rules enforced in code (the model can't lie its way past them):

- Every `dropship`/`legit` verdict must cite ≥1 concrete `reasoningSignal` from the scrape — empty array auto-demotes to `insufficient_evidence`
- Confidence is clamped to ≤ 0.5 when fewer than 3 of `{title >5 chars, price, description >50 chars, image}` are present
- `insufficient_evidence` confidence is always clamped to `[0.2, 0.5]`

### AliExpress match confidence

For each AliExpress candidate, `computeMatchConfidence()` scores:

- **Title overlap** (Jaccard token similarity) — 55% weight
- **Price ratio sanity** — 30% weight. `< 1.0×` = no markup, `> 50×` = absurd → rejected
- **Seller trust** (orders + rating) — 15% weight

If the top candidate scores below `MATCH_CONFIDENCE_MIN = 0.4`, the supplier slot is **emptied with a "no confident match" message** rather than showing a wrong product. Medium-quality matches (0.4–0.65) render a "verify before buying" warning panel with the matching reasons.

### Image-based match verification (Gemini Vision)

Text similarity alone misses a real failure mode: two products can share keywords ("Corona bottle cap…") but actually do different things — one pops the cap manually, the other launches it like a toy. To catch this, the top 3 text-ranked candidates are sent to Gemini Vision in **one multimodal call** alongside the scraped product image:

- The model is asked: *"which candidate is the same product with the same function?"*
- It returns per-candidate `sameProduct`, `sameFunction`, and a 0–1 score with one-sentence reasoning
- If `sameFunction=false` on the best match, the score is hard-clamped to ≤ 0.35 → soft-skipped
- If no candidate qualifies (`bestScore < 0.5`), the whole supplier match is rejected

When image AI runs, weights become: **image 55% · title 25% · price 12% · trust 8%**.

Image AI is **automatically skipped** when:
- The scraped product has no image
- Text confidence is already ≥ 0.85 (no need to spend the call)
- `IMAGE_MATCH_ENABLED=false` is set in `.env` (kill switch)

Cost: ~$0.0001 per call. Latency: ~2–4s. On high-quality matches the UI shows an "Image-verified" badge; on uncertain matches it shows the model's reasoning verbatim ("Image AI saw: …") with a ⚠ "different function detected" warning when applicable.

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

The runner prints:

1. **Confusion matrix** — truth vs predicted verdict
2. **Confidence calibration** — per-bucket accuracy (overconfidence shows up here)
3. **Supplier precision/recall** — false positives (wrong supplier on legit/non-product pages) are flagged as the worst failure mode
4. **Per-fixture failures** — exactly which fixtures broke and why

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

### Suggested workflow

1. Edit `tests/fixtures/seed-urls.json` and swap the `TODO` entries for real URLs you want to test
2. For each URL: `npm run eval:capture -- <slug> <url> <category>`
3. Open the generated `tests/fixtures/products/<slug>/truth.json` and confirm the labels (the capture script auto-stubs, but you must verify)
4. `npm run eval -- --skip-ai` to get a baseline confusion matrix
5. Every prompt or threshold change should be evaluated against this baseline — if the matrix gets worse, revert

Three synthetic fixtures ship with the repo so `npm run eval -- --skip-ai` works immediately after `npm install`, before you've captured anything live.

## Dev monitor

The `/dev-monitor` page (development only) shows live health probes for every external service — AI, scraper, database, and affiliate API. Each probe reports latency, status, and a JSON trace. Access it at [http://localhost:3000/dev-monitor](http://localhost:3000/dev-monitor).

> [!WARNING]
> The dev monitor route is gated by `isDevMonitorAllowed()` and returns 403 in production. Do not expose it publicly.

## Deployment

The simplest path is [Vercel](https://vercel.com):

1. Push the repo to GitHub
2. Import it in Vercel and set all environment variables from the table above
3. Add your Vercel URL as `ALIEXPRESS_CALLBACK_URL` (e.g. `https://your-app.vercel.app/api/aliexpress/callback`)
4. Vercel runs `prisma generate` automatically via the `postinstall` script

The app has no server-side state beyond the database, so it runs cleanly on serverless edge functions.
