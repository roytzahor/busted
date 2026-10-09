---
spec: "0001"
updated: 2026-10-09
---

# 0001 — Plan

## Approach

Build on `agent-os/` instead of beside it. Specs live in `agent-os/specs/`
(the folder `/agent-os:shape-spec` already targets); the policy is a new
injectable standards folder `sdd/` (workflow + constitution); the commands are
`.claude/commands/sdd/*` so they register as `/sdd:*`.

Enforcement is a dependency-free TypeScript linter (`scripts/sdd/spec-lint.ts`)
with pure parse/lint functions and thin fs loaders. Two consumers:
`scripts/sdd/check-specs.ts` (CLI, prints the AC → test matrix) and
`__tests__/sdd-specs.test.ts` (repo-wide gate inside `npm test`). CI's existing
`eval.yml` gains `npm test` — which it was not running at all — and
`npm run sdd:check`.

The constitution routes to the existing standards (one article → one owner)
rather than restating them, per `context/single-source`.

A read-only `spec-auditor` subagent on a cheaper model gives `/sdd:verify` an
independent, cold read of spec vs diff.

## Constitution check

| Article | Result | Notes |
|---|---|---|
| I. Precision over recall | n/a | tooling only, nothing user-visible |
| II. Enforced in code | pass | every lifecycle rule in the workflow standard is a linter rule with a test; the standard says so and says adding a rule means adding code |
| III. Affiliate neutrality | n/a | |
| IV. Measured, not asserted | pass | the gate's own behaviour is proven by 15 unit tests; repo gate runs on the real tree |
| V. Enhancements never break a scan | n/a | no runtime code |
| VI. Public accusation gated | n/a | |
| VII. One fact, one owner | pass | constitution articles point to owning standards; CLAUDE.md gets a routing row, not a copy |
| VIII. Design is derived | n/a | |
| IX. Smallest correct change | pass | reuses agent-os layout and the existing CI job; no new dependency |

## Files touched

| File | Change |
|---|---|
| `agent-os/standards/sdd/workflow.md` | new — lifecycle, when a spec is required, AC/verify contract |
| `agent-os/standards/sdd/constitution.md` | new — nine articles, each routed to its owning standard |
| `agent-os/standards/index.yml` | index the two new standards |
| `agent-os/specs/README.md`, `_templates/*` | new — orientation and templates |
| `scripts/sdd/spec-lint.ts`, `check-specs.ts`, `new-spec.ts` | new — linter, CLI, scaffolder |
| `__tests__/sdd-spec-lint.test.ts`, `__tests__/sdd-specs.test.ts` | new — rule tests and the repo gate |
| `.claude/commands/sdd/*.md` | new — the six commands |
| `.claude/agents/spec-auditor.md` | new — read-only auditor on a cheaper model |
| `.claude/commands/agent-os/shape-spec.md` | point at `/sdd:specify` so there is one way to write a spec |
| `.github/workflows/eval.yml` | run `npm test` and `npm run sdd:check` |
| `package.json` | `sdd:check`, `sdd:new` scripts |
| `CLAUDE.md`, `agent-os/README.md`, `agent-os/tools/catalog.md` | routing rows |

## Data and contracts

none — no runtime code, no schema, no cached shape.

## Risks and kill switch

Risk: the gate blocks unrelated PRs if a spec is left in a bad state. That is
the intended behaviour (a spec claiming a status its evidence does not support
is a real defect), and the error message names the spec and the fix. No runtime
kill switch is needed — nothing ships to users.

## Verification plan

| AC | Gate | Notes |
|---|---|---|
| AC-1 … AC-6 | `npx vitest run __tests__/sdd-spec-lint.test.ts` | each rule has a pass and a fail case |
| AC-7 | `npm test` (repo gate) + CI yaml diff | |
| AC-8 | manual: scaffold into a scratch copy; list commands | recorded in the log |
