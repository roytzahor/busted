---
spec: "NNNN"
updated: YYYY-MM-DD
---

# NNNN — Plan

## Approach

<How the behaviour in spec.md gets built, in a few paragraphs. Name the
existing code it extends — search first (`sdd/constitution` IX).>

## Constitution check

<!-- One row per article in agent-os/standards/sdd/constitution.md.
     Result: pass | n/a | violation. A violation needs a justification in the
     Notes column or sdd:check fails the spec out of draft. -->

| Article | Result | Notes |
|---|---|---|
| I. Precision over recall | n/a | |
| II. Enforced in code | n/a | |
| III. Affiliate neutrality | n/a | |
| IV. Measured, not asserted | n/a | |
| V. Enhancements never break a scan | n/a | |
| VI. Public accusation gated | n/a | |
| VII. One fact, one owner | n/a | |
| VIII. Design is derived | n/a | |
| IX. Smallest correct change | pass | |

## Files touched

| File | Change |
|---|---|
| `path` | what and why |

## Data and contracts

<Type changes, API response shape, cached-shape back-compat
(`ai/cache-backcompat`), migrations. "none" if none.>

## Risks and kill switch

<What could go wrong in production and how it is turned off at runtime without
a deploy. `risk: high` specs must name a switch or say why none is possible.>

## Verification plan

| AC | Gate | Notes |
|---|---|---|
| AC-1 | `npm test` | |
