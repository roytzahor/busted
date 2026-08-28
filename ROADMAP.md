# Busted — Product Roadmap & Strategic Manifest

> This file is the durable source of truth for product direction. Sessions reset;
> this document does not. Update it when a phase completes or a thesis changes —
> never let it drift from what the code actually does.

## Core Thesis: "Smoke alarm, not weather forecast"

Busted wins by **speaking rarely and being right when it speaks**. Coupon
extensions trained users to dismiss popups by firing on every checkout. We do
the opposite: silence is the default, and a verdict shown is a verdict we can
defend. **Trust is the product; precision is the moat.**

Three convictions:

1. **Precision over recall — always.** A false "busted" verdict on a legit
   store is the most damaging failure mode (already encoded in
   `applyClamps()`, `MATCH_CONFIDENCE_MIN`, and the image-AI `sameFunction`
   clamp). The UI must never be more confident than the engine.
2. **Presence over destination.** The verdict must appear at the moment of
   purchase intent (browser extension), not in a paste-a-URL detective tool.
   The web app becomes the landing / share / SEO surface.
3. **Every scan is a permanent asset.** Dropshipping is a power-law catalog —
   thousands of stores sell the same few thousand SKUs. Index by canonical
   product, and marginal scan cost trends toward zero.

**Anti-strategy (inviolable):** we never sell anything to merchants that
touches the verdict. No paid badges, no pay-to-remove. That's the Yelp trap;
it liquidates the trust asset everything else is built on.

## The Three Pillars

1. **UX Breakthrough** — passive extension badge, confidence-tiered visual
   language, shareable "Busted Card", cumulative savings ledger, community
   match verification.
2. **Intelligence & Performance** — tiered inference cascade (Tier 0
   deterministic → Tier 1 text AI → Tier 2 multimodal), canonical product
   index with vector lookup (Phase 2), landed-cost honesty engine, eval-as-CI.
3. **Growth & Monetization** — affiliate (aligned incentives: we earn only
   when the user saves) → programmatic SEO ("is {store} legit" pages from the
   scan DB) → Merchant Transparency Index API → premium consumer tier.

## Confidence Tiers (Presence contract)

Server-side mapping in `lib/analyze/presence-tier.ts`, surfaced as
`presenceTier` on `AnalyzeResponse`. The extension renders **exactly** what
the server says — the mapping lives next to the clamps, never in UI code.

| Tier | Condition | UI |
|---|---|---|
| `flame` | verdict `dropship` AND confidence ≥ 0.7 | 🔥 The Flame — full bust panel |
| `amber` | verdict `dropship` AND confidence ≥ 0.5 | Amber pulse — "dropship signals detected" |
| `silent` | everything else (legit / insufficient / not_a_product / collection_page / no prediction / errors) | Absolute silence |

Errors and degraded responses are always `silent` — we never alarm on failure.

## Tiered Inference Cascade

- **Tier 0 — deterministic, $0, <50ms** (`lib/tier0/store-fingerprint.ts`):
  dropship fulfillment-app footprints + shipping-policy text patterns.
  Short-circuits the AI verdict call inside the dropship-verdict service when
  evidence is overwhelming (multi-signal rule — precision-first). Kill switch:
  `TIER0_FINGERPRINT_ENABLED=false`.
- **Tier 1 — text AI**: `verifyDropshipLikelihood()` (current flow).
- **Tier 2 — multimodal**: vision identity + image match, gated by the
  existing cost gate / ambiguity band.

Every tier reports which tier decided (service events + eval report) so gates
are tightened with data, not vibes.

## Phase Roadmap

### Phase 1 — Trust & Presence (current) — "Never wrong, always there"
1. ✅ Eval baseline enforced: run `npm run eval -- --skip-ai` before/after any
   verdict-path change (47 fixtures; baseline 100% verdict, 87% supplier).
2. ✅ Tier-0 store fingerprint gate (this milestone).
3. ✅ Chrome extension MV3 scaffold (`extension/`) — passive badge + popup,
   confidence-tiered UI (this milestone).
4. ✅ Busted Card: OG image existed (sprint 12) — added Share button on
   `/scan/[id]` (`components/share-bust-button.tsx`). Savings ledger lives in
   the extension (chrome.storage.local, flame results only, once per scanId).
5. ✅ Instant badge, no scrape: quick-lookup v2 (`/api/extension/quick-lookup`)
   returns `presenceTier` from cached per-URL scans; extension badges
   passively on every page load. Domain-level fallback added: when there's
   no usable per-URL scan (miss, unparseable, or past the 14-day cache TTL),
   falls back to the store's aggregate tier (`computeDomainTier()` in
   `lib/store/report.ts`) — only a "flagged" store (≥4 decisive scans, ≥60%
   dropship) produces a signal, capped at `amber` (never `flame`, since it's
   inferred from other products on the store, not a verdict on this one).
   A `dropship` verdict only counts toward "decisive" if its own
   `presenceTier` is not `silent` — we never aggregate a verdict we would
   have kept quiet about into a public accusation.
6. ✅ Precision gate in CI: `.github/workflows/eval.yml` runs lint + tsc +
   `eval --skip-ai --enforce-cost` on every PR (fails on any fixture failure
   or Tier-0 false fire). Gate now excludes fixtures whose truth.json marks
   them `blockedOnFixtureData` (missing/stale captures, tracked not hidden)
   so genuine regressions still fail the build. Corpus at 51 (added 4 Tier-0
   positives/negatives); growth toward 300 needs live captures (blocked on
   creds).

**Exit criteria:** shown-verdict precision ≥ 95% on eval, extension usable
end-to-end against local pipeline, first shareable card.

### Phase 2 — The Index — "From pipeline to lookup"
1. ◐ Vector index groundwork LIVE: pgvector 0.8 enabled on Neon,
   `ProductEmbedding` table + HNSW cosine index, tracked as migration
   `20260707210542_add_pgvector_product_embedding` (its file was originally
   applied but never committed — backfilled; `prisma migrate status` now
   reports up to date). `lib/index/embeddings.ts` wraps
   `gemini-embedding-001` @ 768 dims (REST, `outputDimensionality`;
   text-embedding-004 is retired). `npm run index:ingest` embeds cached
   scans + matched supplier listings; ANN round-trip verified live.
   ANN path wired into `find-supplier.ts` (`findVectorCandidates()`) —
   folds into the same candidate pool + `MATCH_CONFIDENCE_MIN` gate every
   other arm feeds, never picks a winner itself. Retrieval eval
   (`npm run eval:retrieval`, manual — not CI-gated, makes live embedding
   calls) run against the corpus: 19/19 eligible fixtures, top-1/top-3
   recall 100%, comfortably clears the 60% recommendation bar — safe to
   enable. Kill switch `VECTOR_INDEX_ENABLED` still defaults OFF pending a
   deliberate decision to flip it (corpus is small; recall should keep
   being watched as it grows). Remaining: catalog crawler at scale (a
   separate, larger initiative — building out the supplier catalog data
   itself, not part of the wiring above).
2. ◐ Canonical product clustering LIVE as an offline job: `CanonicalProduct`
   table + `npm run index:cluster` (`scripts/index/cluster-products.ts`).
   Matched retail↔supplier pairs seed clusters; greedy single-linkage merges
   by cosine distance (≤ 0.22 auto, (0.22, 0.45] only with positive image-AI
   confirmation — thresholds calibrated via `--calibrate` on the live corpus,
   re-calibrate as it grows). Precision-first: uncertain rows stay
   unclustered, singletons never persisted, `--dry-run` is $0. 18 clusters
   live on Neon. Remaining: nothing reads clusters yet (candidate-arm /
   analytics use is future work), and cross-network breadth (eBay/Temu
   members) depends on the catalog crawler from item 1.
3. ✅ Landed-cost engine (`lib/pricing/landed-cost.ts`): import VAT per market
   (US/IL/EU/UK) keyed by display currency; duty never invented (note only);
   "≈ $X landed" line on the supplier card.
4. ✅ Community verification: widget + API + MatchFeedback existed (sprint 13);
   added the missing bridge — `npm run eval:harvest` turns right/wrong
   feedback into draft fixture candidates (hand-verified before promotion).
5. ✅ Programmatic SEO store pages: `/store/[domain]` ("Is {domain} legit?"),
   hourly ISR, store-level tier requires ≥4 decisive scans and counts only
   non-`silent` dropship verdicts (smoke-alarm rule genuinely applies at store
   level now), wired into sitemap.xml per scanned domain.
6. ✅ Verified Product Map — the "Gold Path" (`lib/cache/verified-map.ts` +
   `VerifiedProductMap` table): a confirmed retail→supplier mapping bypasses
   the entire scrape + AI + supplier-search pipeline (instant HIT, $0).
   Written two ways: user 👍 "Same product" feedback (which always outranks
   auto-commits), or auto-commit when a match clears `VERIFIED_AUTOCOMMIT_MIN`
   (0.85), is positively image-verified (`sameFunction === true`), not
   best-effort, and AliExpress-network. 👎 "wrong" invalidates the mapping AND
   clears the cached supplier match; the retry escalates (Tier-2 preprocess
   trigger widened to 0.95 — only when `PREPROCESS_ENABLED`, kill switches
   stay absolute). TTL `VERIFIED_MATCH_TTL_DAYS` (180d), enforced at query
   time.

**Exit criteria:** median supplier-match latency < 500ms, supplier accuracy
≥ 90%, organic search is the #1 acquisition channel.

### Phase 2.5 — Open The Door — "Nobody's found us yet"
Added 2026-08-28. The honest diagnosis: zero-traffic (30 total scans ever,
all internal) is a **discovery problem**, not an accuracy or monetization
problem. This phase exists to fix that before Phase 3's revenue ambitions,
and sequences deliberately — each item is a prerequisite for the one after
it, not a menu.

1. **Finish the design-system debt that predates this phase.** `DESIGN.md`
   already scopes and has not yet shipped: the landing-page rebuild (§5.1 —
   `app/page.tsx`/`search-hub.tsx` still run the gradient/glass/bento
   template the brand's own thesis argues against), the OG share-card finish
   (§5.6 — the only zero-CAC channel that currently exists, still static),
   and the `analysis-results.tsx` → Ledger migration (§4.4/Phase 6 — still
   six gradient clip-text figures). **Ships first.** A referral loop seeded
   before the landing page can convert a referred visitor wastes the growth
   mechanism on a first impression that's already underperforming.
2. **Growth loop v1 — referral + feedback bonus scans**, on top of a free
   daily scan cap. Mechanics:
   - Free tier: 3 scans/day, enforced as a **soft, session+IP fair-use
     limit** — explicitly not marketed as a security boundary, since there
     is no real account system yet (`lib/api/session-attribution.ts`'s
     `sessionId` is forgeable by design). Shown only when hit: one
     plain-text line in `SearchHub`'s idle state, same register as the
     `silent` verdict copy — no counter chip, no persistent badge (a "2/3
     scans left" pill is a decorative element seen on every load, which
     `DESIGN.md`'s own frequency→decision gate forbids). Gated on
     `phase === "idle"` in the state machine, never on `presenceTier`, so
     there is no tier-check to forget and no path for a limit banner to
     render beside or inside a shown verdict.
   - Referral: invite a friend, both get +2 scans when the friend completes
     their first scan, capped +10/day. Built on the existing
     `components/share-button.tsx` (`?ref=<code>` param), not a new
     surface. **Prerequisite before shipping the reward, not after**: with
     only a forgeable session ID, self-referral (fresh session per fake
     "friend") is a 5-line script — verified during planning that this
     works today. Ship with a lightweight abuse dedupe (hashed IP+UA
     fingerprint, rolling window) from day one; the mechanic is worthless as
     a K-factor signal if it can't distinguish real referrals from farming.
   - Feedback bonus: +1 scan (capped +3/day) for submitting genuine 👍/👎
     match feedback, reusing the existing `MatchFeedback` component.
     **Prerequisite before shipping**: verified `recordVerifiedMatch()`
     (`lib/cache/verified-map.ts`) writes a `user_feedback`-sourced mapping
     to the Gold Path with NO corroboration check today — a single 👍
     already overrides everything, reward or not. Attaching a reward to
     that click without a gate turns "get a free scan" into "poison a
     cache every future visitor trusts for 180 days" as the cheapest path.
     Fix before shipping the reward: a `user_feedback` write with no
     independent corroboration (repeat feedback on the same scan, or an
     `auto_high_confidence` mapping already agreeing) drops to a
     lower-trust tier that still needs one more signal before it can evict
     a stronger existing mapping — the reward scan still pays out
     immediately regardless (rewarding genuine engagement, not the write).
   - Explicitly **rejected**: "earn scans by completing an affiliate-linked
     purchase." Makes free-tier currency a function of dropship-redirect
     frequency — a slow incentive gradient toward showing/emphasizing more
     redirects to fund the free tier, adjacent to the exact mechanism
     `standards/trust/affiliate-neutrality` exists to prevent. Also
     currently unverifiable (no Admitad postback wired; "did they order"
     would be inferred from a fakeable client-side click).
3. **Run the 100-hand-labeled-URL validation** — **done 2026-08-28**
   (`scripts/eval/live-url-validation.ts`, data + results in
   `tests/eval/live-validation/2026-08-28-90-urls.json`). 90 fresh live URLs
   (never seen by the pipeline before — no fixture reuse), sourced by
   category (dropship-pattern Shopify stores, 33 major real brands including
   Nike/Allbirds/Patagonia-family/Casper/Sephora/Yeti/Bombas/Theragun/Crocs,
   non-product pages, collection pages), run through the **same service
   chain production uses** (scraper → vision-grounded product identifier →
   Tier-0 fingerprint gate → AI verifier) — a first version of this script
   called the AI verifier directly and was caught in self-review skipping
   Tier-0 and the identifier entirely, which mattered because most of the
   sample is exactly Tier-0's target pattern. 83/90 scraped and verdicted
   (7 excluded on a transient Google AI 503 during a demand spike — a real
   gap worth its own ticket, since there's only one API key configured with
   no fallback provider). **Shown-verdict precision: 28/28 = 100%** — zero
   false accusations across every real brand and edge case reached,
   including a real yoga brand (Liforme) deliberately included on Shopify
   infra to check the host itself isn't a false signal. Raw verdict accuracy
   was 70/83 = 84.3% on first pass; hand-reviewing every mismatch against the
   actual scraped content (not the a-priori label) found 12 of 13 mismatches
   were labeling errors on my side — stores that had closed since being
   sourced, multi-product homepages mislabeled as single-product pages, one
   real brand (Geepas) I didn't recognize, URLs that resolved to a different
   page than the one I'd assumed — leaving a corrected accuracy of
   **82/83 = 98.8%** (one plausible subtle-dropship miss counted against the
   model: a single-SKU novelty store the identifier named correctly but the
   verdict still called `legit`). This is the number Phase 2.5 item 4 was
   gated on; it clears the bar. Full methodology and per-URL adjudication in
   `tests/eval/live-validation/README.md`.
4. **Seed initial distribution.** Referral has a cold-start problem no
   mechanic design fixes: zero existing users means nobody to refer from.
   One bounded, cheap manual push (a relevant community post, a small
   targeted placement) to get the first ~50 real users — not a paid
   acquisition channel commitment, a seed.

**Exit criteria:** landing + OG card + analysis-results shipped in Ledger;
referral K-factor and free-tier cap-hit rate both measured for the first
time; 100-URL validation complete with a documented shown-verdict precision
number outside the synthetic corpus — **done, 100% shown-verdict precision
on 83 live URLs through the real service chain, 2026-08-28** (item 3 above).

### Phase 3 — The Flywheel — "Scans into enterprise value"

**Busted Pro** — added 2026-08-28, gated on a concrete trigger, not an
open-ended "eventually": begins once Phase 2.5's referral loop shows
K-factor > 0.15, OR 500 real scans accumulate, whichever comes first. For a
solo founder, "build real accounts" is exactly the kind of unglamorous
dependency that stalls indefinitely without a dated condition forcing it —
this is that condition.

- **$3.99/mo or $29.99/yr.** 50 scans/day ceiling (a fair-use abuse bound,
  not a usage target — realistic engaged usage is 10-20 scans/month),
  priority processing, a personal savings dashboard (surfaces the existing
  `totalSavingsUsd` on the `User` model). **Never**: anything that changes
  a verdict, a ranking, or which supplier is shown — Pro buys capacity and
  speed, never truth, and is marketed that way explicitly as a trust
  reinforcement, not a legal footnote.
- **Unit economics**, grounded in `scripts/eval/run-fixtures.ts`'s measured
  cost model: a cold scan costs $0.0064-0.007 all-in (scrape + text verdict
  + image stages when triggered); a Gold Path cache hit is $0. Worst-case
  exposure at 50/day sustained is ~$0.35/day; realistic usage costs
  $0.07-0.14/month against $3.99 revenue — 96%+ gross margin at the usage
  pattern that actually occurs. This excludes fixed hosting costs, not yet
  modeled.
- **Requires real accounts** (out of scope for 2.5) — cannot bill without
  reliable identity across sessions. This is the actual reason Pro is
  sequenced after, not a stalling tactic: building Stripe on a forgeable
  session ID means paying customers are the ones least able to keep their
  own entitlement.
- **UI**: appears in exactly two places, never a third — the free-tier cap
  line (§2.5 item 2) as a plain-text link, and one row in the rebuilt
  landing ledger, styled identically to a scan row, not elevated. No pricing
  table, no sticky bar, no exit-intent modal, no post-scan interstitial —
  on a one-price-point product these are enterprise-SaaS theater.

Merchant Transparency Index API (BNPL/issuer design partner), geo expansion,
public "Busted 100" leaderboard remain Phase 3, unchanged, further out —
the leaderboard specifically still carries the severity flagged in
`standards/trust/public-accusation` and is not reopened by this update.

**Exit criteria:** revenue three-legged (affiliate / data / premium), no leg
> 60%.

## Flywheel

```
 more scans ──► richer canonical index ──► faster / more accurate verdicts
     ▲                                              │
     │                                              ▼
 zero-CAC acquisition ◄── shareable busts + SEO pages + savings ledger
```
