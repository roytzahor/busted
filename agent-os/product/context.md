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

- **Phase 1 — Trust & Presence** (current): eval gate, Tier-0 fingerprint,
  MV3 extension, Busted Card, instant badge. Exit: shown-verdict precision
  ≥ 95%.
- **Phase 2 — The Index**: pgvector ANN, canonical clustering, landed-cost,
  programmatic SEO store pages, Verified Product Map. Exit: median supplier
  match < 500ms, supplier accuracy ≥ 90%.
- **Phase 3 — The Flywheel**: Merchant Transparency Index, premium tier,
  "Busted 100". Exit: revenue three-legged, no leg > 60%.

## Open strategic questions

These came out of a red-team review and are **not yet resolved** — do not treat
the roadmap's revenue plan as settled:

1. **Precision ≥ 95% is unmeasured.** The eval's verdict accuracy is partly
   tautological. Cheapest test: 100 hand-labeled live URLs, ~$1, four hours.
2. **Affiliate economics are negative per cold scan** in the base case, and
   break-even needs a very high cache hit rate. Instrument supplier-link CTR
   before building more monetization.
3. **Users may respond to a bust by abandoning, not redirecting** — which earns
   nothing. If so, the business monetizes avoidance (data, brand protection),
   not redirection.
4. **The "Busted 100" leaderboard is the highest-severity artifact in the
   plan.** See `standards/trust/public-accusation`.
