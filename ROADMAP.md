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
4. ☐ Busted Card (shareable verdict artifact) + savings ledger.
5. ◐ Instant badge, no scrape: quick-lookup v2 returns `presenceTier` from
   cached per-URL scans; extension badges passively on every page load.
   Domain-level (store-wide) verdicts still open.
6. ☐ Grow fixtures toward 300 via synthetic seeder + captures; precision gate
   in CI.

**Exit criteria:** shown-verdict precision ≥ 95% on eval, extension usable
end-to-end against local pipeline, first shareable card.

### Phase 2 — The Index — "From pipeline to lookup"
Catalog crawler → multimodal embeddings (pgvector on Neon) → ANN lookup
replaces keyword search as primary path (keyword search demoted to
flag-gated fallback). Canonical product clustering across
AliExpress/eBay/Temu. Landed-cost engine (US + IL + EU). Community
verification buttons → auto-fixture pipeline. Programmatic SEO store pages.

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
