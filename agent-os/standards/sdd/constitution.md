# The Constitution: What Every Plan Is Checked Against

Every `plan.md` carries a **Constitution check** table with one row per article
below, each marked `pass`, `n/a`, or `violation` — and a `violation` must carry
a written justification or the spec cannot leave `draft` (`sdd:check` enforces
this). The articles are short on purpose: each names the standard that **owns**
the rule and its reasons. This file routes; the standards state
(`context/single-source`). If an article and its owner disagree, the owner wins
and this file is fixed.

The north star these protect: **identify the product correctly, and when we
offer a cheaper source, make it the same product, at an honest price, with the
commission disclosed at the moment of the click.** Each article below is a way
that goal has already been, or could easily be, betrayed.

## I. Precision over recall

Silence is the default. A claim shown to a user — a verdict, a "same product"
match, a savings number — is one we can defend. A wrong match on a legit store
costs more trust than a hundred missed busts earn.
Owner: `trust/presence-tier-contract`, `supplier/match-thresholds`.

## II. Enforced in code, not asked in a prompt

A humility rule that exists only in a prompt is not enforced. Every such rule
has a clamp in `applyClamps()` or an equivalent code gate, moved in the same
commit.
Owner: `ai/verdict-clamps`, `ai/verdict-field-zeroing`.

## III. Nothing anyone pays for changes what a user sees

Commission never enters ranking. Disclosure sits inside the CTA container, above
the button. Every affiliate anchor is `rel="sponsored"`. No affiliate link
without a concrete price delta.
Owner: `trust/affiliate-neutrality`.

## IV. Measured, not asserted

A change to a threshold, prompt, model, or matcher ships with a before/after
number from the eval, and the plan names which eval and what it cannot measure.
"Should be better" is not a measurement.
Owner: `eval/gates`, `supplier/match-thresholds`.

## V. Enhancements never break a scan

Image match, cross-network fallback, learning priors, and any new enrichment
stage return `null` on failure. New risky behaviour sits behind a runtime kill
switch, and the disabled path stays intact.
Owner: `change-discipline`, `scraping/provider-chain`.

## VI. Naming a real business publicly is gated

Anything that aggregates verdicts onto an indexed page about a named store
follows the public-accusation gates.
Owner: `trust/public-accusation`.

## VII. One fact, one owner

Model ids come from `lib/ai/models.ts`, errors go through
`lib/api/error-utils.ts`, class names through `cn()`, cached shapes stay
back-compatible. No parallel paths.
Owner: `context/single-source`, `ai/cache-backcompat`.

## VIII. Design is derived, not decorated

Visual intensity follows `presenceTier`; `silent` renders nothing decorated.
Dark is the only mode. Colours are measured on the surface they sit on.
Owner: `design/tokens`, `design/motion`, `trust/presence-tier-contract`.

## IX. Smallest correct change, reuse before create

Search for the concept before building it — this repo has usually built it
already. Solve the stated problem; nothing more.
Owner: `change-discipline`, `.claude/lessons.md`.

## Amending

Adding or changing an article is itself a spec (`risk: high`), because every
future plan is checked against it. Never weaken an article to let one plan pass —
justify the violation in that plan instead, where a reviewer can see it.
