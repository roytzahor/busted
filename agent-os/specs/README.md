# Specs

Every behaviour change starts here. A spec states **what** must be true and
**how we will know**; the plan says how it is built; the tasks say in what
order. The rules and the reasons: `agent-os/standards/sdd/workflow.md`. What
every plan is checked against: `agent-os/standards/sdd/constitution.md`.

## The loop

```
/sdd:specify "<idea>"   → NNNN-slug/spec.md        status: draft
/sdd:plan NNNN          → NNNN-slug/plan.md        status: approved
/sdd:tasks NNNN         → NNNN-slug/tasks.md       status: in-progress
/sdd:implement NNNN     → tests (tagged) + code
/sdd:verify NNNN        → gates + spec-auditor     status: verified
merge to main                                      status: shipped
/sdd:status             → the board
```

```bash
npm run sdd:new -- honest-offer "Title" --risk high   # scaffold next id
npm run sdd:check                                     # lint + AC→test matrix
```

`npm test` and CI run the same checks, so a spec cannot claim a status its
evidence does not support.

## Tagging tests

```ts
// @spec 0002/AC-3
it("never renders the CTA without a concrete price delta", () => { … });
```

## Index

| Spec | Status | Risk | Behaviour |
|---|---|---|---|
| [0001](0001-sdd-framework/spec.md) | shipped | medium | Specs are the source of truth, and CI checks them |
| [0002](0002-honest-offer/spec.md) | shipped | high | Honest alternative offer: no invented numbers, no unearned claims, disclosure at every CTA |
| [0003](0003-store-price-evidence/spec.md) | shipped | high | Store price from the page's structured data, measured against hand-labelled truth |
| [0004](0004-ledger-offer-sheet/spec.md) | shipped | high | The offer reads as The Ledger: verdict and evidence first, observed prices on the bar, the money link last |
| [0005](0005-verdict-input-on-evidence/spec.md) | draft — blocked on live-eval credentials | high | The verdict prompt and the matcher read evidence, not guesses |
| [0006](0006-provider-fallback-and-model-choice/spec.md) | draft: blocked on credentials | high | A second AI provider as fallback; the primary model chosen by cost per correct verdict |
| [0007](0007-design-direction-v2/spec.md) | draft: blocked on the owner's taste | medium | Find out what is wrong with the design, show alternatives, apply design skills |

## State and queue (2026-10-09)

**Shipped to `main`** (PRs #25–#27): the SDD framework and its CI gate (0001),
the honest offer (0002), store price from evidence (0003), the Ledger offer
(0004). Every spec passed an independent `spec-auditor` run, and every one
failed its first.

**Queue, in order. Each is blocked on something only the owner can supply:**

| # | Spec | Blocked on | Unblocks |
|---|---|---|---|
| 1 | 0007 design direction | the owner says what they dislike (the options are in the spec) | a design rebuild, safely |
| 2 | 0006 provider fallback + model choice | keys in the environment's settings as variables, never in chat: `GOOGLE_AI_API_KEY`, an OpenAI key, an Anthropic key | the 7/90 outage fix, a measured model choice, the 3.7 → 3.8 upgrade (3.7 retires 2027-01-28 on Vertex; the introductory price doubles 2027-01-01) |
| 3 | 0005 verdict and matcher inputs on evidence | the same live keys, plus AliExpress and Crawlbase hosts unblocked in the egress policy | the verdict prompt reading the true price; no invented seller rating (4.6) |

**Known, unspecced, smaller:**
- Stored supplier data has no best-effort flag, so stored-scan surfaces cannot exclude those matches.
- The home "totals" counter sums model estimates across all verdicts.
- `ShareButton` has a dev-only hydration mismatch (`data-og-preview` reads `window` during render).
- Phase 6 leftovers in `DESIGN.md`: the pipeline log, the OG card, store pages, and deleting `.glass` / `.glow-*` / `.shine-top` from `globals.css` once nothing uses them.
- Phase 2.5 growth work in `ROADMAP.md` is untouched: referral abuse-mitigation, the Gold Path write-gate, and one manual distribution seed.

Keep this table in step with the folders — `/sdd:status` reads the folders,
this table is for humans browsing on GitHub.
