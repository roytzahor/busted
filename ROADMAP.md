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

### Phase 3 — The Flywheel — "Scans into enterprise value"
Merchant Transparency Index API (BNPL/issuer design partner), premium
consumer tier, geo expansion, public "Busted 100" leaderboard.

**Exit criteria:** revenue three-legged (affiliate / data / premium), no leg
> 60%.

## Flywheel

```
 more scans ──► richer canonical index ──► faster / more accurate verdicts
     ▲                                              │
     │                                              ▼
 zero-CAC acquisition ◄── shareable busts + SEO pages + savings ledger
```
