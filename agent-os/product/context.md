# Product Context

`ROADMAP.md` at the repo root is the durable source of truth. This file is the
short orientation; when they disagree, ROADMAP wins and this should be fixed.

## Thesis

**"Smoke alarm, not weather forecast."** Busted wins by speaking rarely and
being right when it speaks. Coupon extensions trained users to dismiss popups by
firing on every checkout; we do the opposite. Silence is the default, and a
verdict shown is a verdict we can defend.

**Trust is the product. Precision is the moat.**

Three convictions:

1. **Precision over recall, always.** A false "busted" on a legit store is the
   most damaging failure mode.
2. **Presence over destination.** The verdict belongs at the moment of purchase
   intent (the extension), not in a paste-a-URL tool.
3. **Every scan is a permanent asset.** Dropshipping is a power-law catalog —
   index by canonical product and marginal scan cost trends to zero.

**Anti-strategy:** never sell anything to merchants that touches the verdict.
See `standards/trust/affiliate-neutrality` for the mechanism-based restatement.

## Phases

- **Phase 1 — Trust & Presence**: eval gate, Tier-0 fingerprint, MV3
  extension, Busted Card, instant badge. Exit: shown-verdict precision
  ≥ 95%. Measured 100% on a 52-fixture corpus (2026-08-26) — but that
  corpus is mostly synthetic (only ~13 real fixtures), and live-model
  verdict accuracy on the real subset is 92.3% (`npm run eval:model`), a
  different and smaller-sample number than the offline `--skip-ai` replay's
  100% (which re-tests the clamps against cached AI responses, not the live
  model). **Verified 2026-08-28** via a 90-URL live validation outside the
  fixture corpus: shown-verdict precision 100%, zero false accusations (see
  open question #1). Phase 1's exit is now met, not just provisional.
- **Phase 2 — The Index**: pgvector ANN, canonical clustering, landed-cost,
  programmatic SEO store pages, Verified Product Map. Exit: median supplier
  match < 500ms, supplier accuracy ≥ 90%. Supplier accuracy measured 100%
  (2026-08-27, tokenizer/stemming fix) — same real-corpus-size caveat as
  above. Median latency not yet measured. `VECTOR_INDEX_ENABLED` still off.
- **Phase 2.5 — Open The Door** (new, 2026-08-28): the product has 30 total
  scans ever, zero organic traffic — a discovery problem, not an accuracy
  problem. Finish the already-scoped-but-unshipped Ledger design work
  (landing, OG card, analysis-results), ship a growth loop (referral +
  feedback bonus scans, both with abuse mitigations that don't exist yet),
  run the real-URL validation, seed initial distribution. See `ROADMAP.md`
  for the full plan including the two prerequisite fixes (referral
  self-farming, Gold Path write-gate) found during red-team review.
- **Phase 3 — The Flywheel**: Busted Pro subscription (new, gated on
  K-factor > 0.15 or 500 real scans — see `ROADMAP.md`), Merchant
  Transparency Index, geo expansion, "Busted 100". Exit: revenue
  three-legged, no leg > 60%.

## Open strategic questions

These came out of red-team review (original + 2026-08-28 follow-up) and are
**not yet resolved** — do not treat the roadmap's revenue plan as settled:

1. **Resolved 2026-08-28.** Ran the 100-hand-labeled-live-URL validation
   (`scripts/eval/live-url-validation.ts`, 90 fresh URLs, results in
   `tests/eval/live-validation/2026-08-28-90-urls.json`) — never executed
   before this. **Shown-verdict precision: 29/29 = 100%**, zero false
   accusations across 33 major real brands (Nike, Allbirds, Patagonia,
   Casper, Sephora, Yeti, Hydro Flask, Away, Bombas, Theragun, Crocs,
   Fjällräven, Solo Stove, a real Shopify-hosted brand chosen specifically to
   test that the platform itself isn't a false signal) plus dropship-pattern
   stores and non-product/collection pages. Raw verdict accuracy read 80% on
   first pass; hand-reviewing every mismatch against actual scraped content
   found 16/18 were my labeling errors (stale store state, multi-product
   homepages mislabeled as single-product, one real brand I didn't
   recognize), correcting to **87/88 = 98.9%** (one genuinely ambiguous case
   excluded, one plausible subtle-dropship miss counted against the model).
   This clears the bar that was blocking Busted Pro billing (Phase 3).
2. **Affiliate economics are negative per cold scan** in the base case, and
   break-even needs a very high cache hit rate. Instrument supplier-link CTR
   before building more monetization. Still unmeasured: 5 affiliate clicks,
   ever.
3. **Users may respond to a bust by abandoning, not redirecting** — which earns
   nothing. If so, the business monetizes avoidance (data, brand protection),
   not redirection.
4. **The "Busted 100" leaderboard is the highest-severity artifact in the
   plan.** See `standards/trust/public-accusation`.
5. **(New, 2026-08-28) The referral mechanic as specified is trivially
   game-able without real accounts.** A forgeable session ID means
   self-referral (fake "friends" via fresh sessions) is a 5-line script,
   verified during planning. It doesn't just leak scans — it makes K-factor,
   the metric the mechanic exists to produce, unmeasurable. Must ship with
   a fingerprint-based abuse dedupe from day one, not as a fast-follow.
6. **(New, 2026-08-28) `recordVerifiedMatch()` writes a `user_feedback`
   mapping to the Gold Path with no corroboration check today** —
   confirmed by reading `lib/cache/verified-map.ts` directly. This is a
   pre-existing latent risk independent of any reward; attaching a bonus
   scan to the 👍 click makes exploiting it (accidentally or not) more
   likely, not newly possible. Needs a corroboration gate before the
   feedback-bonus mechanic ships.
7. **(New, 2026-08-28) Referral has a cold-start problem no mechanic design
   fixes**: zero existing users means nobody to refer from. Needs one
   manual, bounded distribution seed (not a paid-acquisition commitment)
   before the loop has anything to compound.
