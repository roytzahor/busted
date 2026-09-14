## Project

**Busted** — a Next.js product analysis tool. Enter a product URL; it scrapes
the page, runs AI-powered dropship verification and supplier marketplace
analysis, finds AliExpress alternatives, and converts the link to an affiliate
link.

Brand name in code: "Busted" (SVG aria-label). Repo name is "BuyPass".

**This file routes; `agent-os/standards/` states.** It is loaded into every
session, so it holds pointers, not copies — see `context/single-source`. When
this file and a standard disagree, the standard wins and this file gets fixed.

## Tech Stack

- **Framework**: Next.js (App Router, TypeScript)
- **UI**: Tailwind + Radix + shadcn/ui (`components/ui/`). All className merging
  goes through `cn()` in `lib/utils.ts`.
- **Database**: Prisma + Neon Postgres (`prisma/`, `@prisma/client`)
- **AI**: `lib/ai/client.ts` wraps Google Generative AI. Model ids come from
  `lib/ai/models.ts` — the single source of truth; no module hardcodes one.
- **Scraping**: Crawlbase JS-render → Firecrawl → Playwright. Order is dynamic
  per domain via `lib/learning/priors.ts`. Entry: `scrapeProductUrl()`.
- **Affiliate**: Admitad in `lib/affiliate/`
- **AliExpress**: OAuth + product search in `lib/aliexpress/`

## Key Dev Commands

```bash
npm run dev          # dev server (also dev:turbo, dev:clean)
npm run build        # production build — the ONLY full type-check
npm run lint         # ESLint
npm test             # vitest run
npm run db:migrate   # prisma migrate dev (also db:generate, db:push)
npm run eval -- --skip-ai   # replay fixtures, no API spend
```

Two traps that have each cost a session: `npx tsc --noEmit` is incremental via
`tsconfig.tsbuildinfo` and **passes on a broken tree**; and never build while
`next dev` is running. Full command ladder and what each gate does not prove:
`/agent-os:inject-standards eval/gates`.

## Engineering Standards (`agent-os/`)

Load-bearing invariants live as small, diffable files in `agent-os/standards/`
rather than as prose here. Pull them in on demand:

```
/agent-os:inject-standards trust        # everything in trust/
/agent-os:inject-standards trust/presence-tier-contract
/agent-os:index-standards               # rebuild index.yml after adding files
```

| Touching | Read first |
|---|---|
| `lib/ai/` prompts or clamps | `ai/verdict-clamps`, `ai/derived-fields`, `ai/verdict-field-zeroing`, `eval/gates` |
| anything a user sees | `trust/presence-tier-contract`, `design/tokens` |
| `/store/[domain]` or anything public | `trust/public-accusation` |
| supplier matching or thresholds | `supplier/match-thresholds` |
| affiliate links or CTAs | `trust/affiliate-neutrality` |
| `extension/` | `extension/render-verbatim` |
| scrapers or error paths | `scraping/provider-chain` |
| the eval corpus or fixtures | `eval/fixtures`, `eval/gates` |
| CSS, tokens, motion, surfaces | `design/tokens`, `design/motion`, `design/surfaces` |
| the cache shape | `ai/cache-backcompat` |
| committing on a shared tree | `git/branching-and-commits` |
| any nontrivial change | `change-discipline`, `code-navigation`, `context/token-economy` |

`agent-os/product/context.md` holds the thesis and open strategic questions;
`agent-os/product/key-files.md` is the full file map; `agent-os/tools/catalog.md`
is the tooling and skills catalog.

## Working Efficiently

Context is a budget. The full method is in `standards/context/` — four files:

| Standard | Covers |
|---|---|
| `context/token-economy` | the retrieval cost ladder; climb only as far as the question needs |
| `context/caveman` | the compressed register for agent-facing text, and where it is forbidden |
| `context/delegation` | when a subagent pays for its cold start, and what its prompt must carry |
| `context/single-source` | one fact, one owner — why this file routes instead of restating |

The short version: **query the graph before you grep** (`code-navigation`),
read parts of files rather than whole ones, batch independent calls, and never
compress a rationale out of a standard.

## Architecture

`app/api/analyze/route.ts` (`POST()`) is the single main route. It orchestrates:

1. **Validate** → `validateProductUrl()` (`lib/analyze/client.ts`)
2. **Cache check** → `findValidCachedProduct()` (`lib/cache/product-cache.ts`)
3. **Scrape** → `scrapeProductUrl()` (`lib/scraping/router.ts`)
4. **Extract** → `extractProductAttributes()` (`lib/scraping/extract-product.ts`)
5. **AI analysis** → `verifyDropshipLikelihood()` +
   `buildSupplierMarketplacePrediction()`. Verdicts `not_a_product`,
   `insufficient_evidence` and `collection_page` **skip** step 6.
6. **Supplier search** → `findAliExpressSupplier()` if enabled — soft-skips with
   `ALIEXPRESS_NO_CONFIDENT_MATCH` below `MATCH_CONFIDENCE_MIN`
7. **Affiliate** → `convertToAffiliateLink()` (Admitad)
8. **Persist** → `persistScannedProduct()` (`lib/cache/persist-product.ts`)

Production callers wrap the inner AI function: the route calls
`lib/services/dropship-verdict`'s `verify()` (Tier-0 + vision identifier), never
`verifyDropshipLikelihood()` directly. Any script measuring "what the user sees"
must call the same wrapper.

Secondary route: `app/api/dev-test/route.ts` (dev-only, `isDevMonitorAllowed()`).

## AI Verdict Schema

`DropshipPrediction` (`lib/ai/dropship-verifier.ts`) is the contract between the
AI layer and everything downstream:

```ts
verdict: "dropship" | "legit" | "insufficient_evidence" | "not_a_product" | "collection_page"
isLikelyDropship: boolean   // derived — always `verdict === "dropship"`
confidence: number          // 0..1
productCategory: string
reasoning: string
reasoningSignals: string[]  // MUST be non-empty for dropship/legit
missingSignals: string[]
redFlags: string[]
aliexpressKeywords: string[]
styleTokens: string[]       // collection_page ONLY
materialPriors: string[]    // collection_page ONLY
estimatedStorePriceUsd / estimatedSupplierPriceUsd / estimatedMarkupPercent
```

The humility rules are enforced in code by `applyClamps()`, not just asked for
in the prompt — **a prompt-only rule is not enforced**. The clamp table, the
per-verdict field zeroing, and the cache back-compat obligation live in
`ai/verdict-clamps`, `ai/verdict-field-zeroing` and `ai/cache-backcompat`.
Read them before touching the prompt.

## Codebase Navigation

Indexed into **codebase-memory** (MCP `codebase-memory-mcp`, project
`Users-tzahore-github-busted`). The index self-updates via a background watcher
— do not re-index as hygiene.

- "who calls X" / "what breaks if I change X" → `trace_path`
- "what is X" / "how does X work" → `graft ask "<q>" .`
- negative or exhaustive claims → `check_index_coverage` first, always

**graphify is deprecated here.** Its call edges are heuristic and were
measurably wrong on this repo. Never use it for call-graph or impact questions.

Full rules, coverage caveats, and refresh commands: `code-navigation`.

## Design Language

**"The Ledger"** — dark textured room + opaque manila paper evidence, with a
to-scale markup bar as the signature element. Full spec and rationale in
**`DESIGN.md`**; read it before any UI work.

**Dark mode is the only mode** — `<html>` always carries `dark`. Never add a
light-mode toggle without explicit instruction.

**Design intensity is derived from `presenceTier`, never chosen.** Decorating
`silent` defeats the point of having tiers.

Tokens and the contrast-measurement method → `design/tokens`. Motion and the
`animate-in` trap → `design/motion`. The legacy glass/bento surfaces still on
screen → `design/surfaces`.

## Conventions

- `cn()` for all className merges — never concatenate class strings.
- All API errors go through `lib/api/error-utils.ts`. Don't invent a parallel path.
- Classify caught errors by type/code, never by matching a provider's free-text
  message; compare against imported constants, not inline string literals.
- Dev-only routes gated by `isDevMonitorAllowed()`; supplier search by
  `isSupplierSearchEnabled()`.
- **Never widen AI confidence without updating clamps** (`ai/verdict-clamps`).
- **Never change a match threshold without `npm run eval` before and after**
  (`supplier/match-thresholds`). A threshold change with no eval number attached
  is not reviewable.
- **Enhancement stages never throw.** Image match, cross-network fallback and
  learning-priors getters return `null` on failure — they can help a scan, never
  break it.
- **Kill switches gate at runtime; leave the disabled path intact.**
  `IMAGE_MATCH_ENABLED`, `TIER0_FINGERPRINT_ENABLED`, `MULTI_SUPPLIER_ENABLED`,
  `PREPROCESS_ENABLED`, `VECTOR_INDEX_ENABLED`, `PLAYWRIGHT_FALLBACK_ENABLED`.
- **`presenceTier` is the only UI confidence contract** — computed server-side,
  rendered verbatim, missing/error means silent. Wrap decorated subtrees in
  `<SilentBoundary>` (`trust/presence-tier-contract`).
- New eval fixtures need a **hand-edited** `truth.json` (`eval/fixtures`).

## Lessons

Read `.claude/lessons.md` before non-trivial work. Append a one-line lesson
whenever a correction lands or an invariant surprises you.
