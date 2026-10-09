# Spec-Driven Development: The Spec Is The Source Of Truth

A change that alters what a user sees, what the verdict says, which supplier is
offered, or how we earn money starts as a **spec** in `agent-os/specs/`, not as
code. The spec states the behaviour; the code and the tests are derived from it
and must agree with it. When they disagree, the spec is fixed first, in the same
change — never left to rot as a description of what we once meant.

This exists because 13+ sprints of prior work lived in `SPRINT.md` prose and
PR bodies, and three separate times a "new" component was nearly rebuilt because
nothing said what the old one promised (`.claude/lessons.md`, 2026-07-07). A
spec with numbered acceptance criteria, each pinned to a test, is a promise the
CI can check.

## When a spec is required

| Change | Spec? |
|---|---|
| New user-visible feature, or a change to one | **yes** |
| Anything on the verdict path, the supplier matcher, thresholds, affiliate links/CTAs, or a public page | **yes** — `risk: high` |
| DB schema / cached-shape change | **yes** |
| Bug fix that restores behaviour an existing spec already promises | no — tag the regression test with that spec's AC |
| Bug fix with no spec behind it, < ~30 lines, with a regression test | no — the test is the spec |
| Pure refactor (no behaviour change), docs, dependency bumps, test-only | no |

When in doubt, write the spec. A short spec costs minutes; an unspecified
behaviour costs a session of archaeology the next time someone touches it.

## Lifecycle

```
draft ──► approved ──► in-progress ──► verified ──► shipped
  │                                                    │
  └──────────────► abandoned          superseded ◄─────┘
```

| Status | Means | Gate to enter (enforced by `npm run sdd:check`) |
|---|---|---|
| `draft` | being written | frontmatter + required sections exist |
| `approved` | behaviour agreed, ready to plan/build | no `[NEEDS CLARIFICATION]` left; `plan.md` exists and its constitution check has no unjustified `violation` |
| `in-progress` | being built | `tasks.md` exists |
| `verified` | built and proven | every task checked; every `Verify: test` AC is referenced by at least one `@spec NNNN/AC-n` tag in a test file |
| `shipped` | merged to `main` | same as verified |
| `superseded` | replaced | `superseded_by` names the replacing spec |
| `abandoned` | dropped | a one-line reason in `## Decisions` |

Who approves: in autonomous sessions the agent may move its own spec to
`approved` once the constitution check passes and no open question is a product,
legal, or money decision. Those three go to the human (`AskUserQuestion`), and
the spec stays `draft` until answered. The point of the gate is that someone
decided, on the record — not that a human typed "lgtm".

## Acceptance criteria are the contract

Every AC carries exactly one `Verify:` line naming **how** it is proven:

| Kind | Meaning | What `verified` requires |
|---|---|---|
| `test <path>` | an automated vitest test | a `@spec NNNN/AC-n` tag in that test |
| `eval <command>` | an eval run with a number | the number recorded in `## Verification log` of `tasks.md` |
| `build` | type/compile/bundle gate | `npm run build` green |
| `manual <how>` | a human/browser check | the observation recorded in the verification log |

Prefer `test`. Use `manual` only for what no test can see (visual polish, a live
third-party integration) — a spec whose ACs are all `manual` has not been
thought through.

Tag tests with the AC they prove, in a comment directly above the test:

```ts
// @spec 0002/AC-3
it("never renders the CTA without a concrete price delta", () => { … });
```

Only comment position counts (`//`, `/*`, or a ` * ` doc line). A string
literal that merely mentions a tag — an assertion message, a fixture — is not
proof. A tag naming an AC that does not exist fails the check — dangling
traceability is worse than none, because it looks like coverage.

## Rules that do not bend

- **Spec first, then code.** If implementation shows the spec is wrong, edit
  the spec (and its `updated:` date) before the code diverges. A PR whose code
  and spec disagree is not reviewable.
- **One spec, one behaviour change.** A spec that grows a second goal mid-build
  gets split, same as a branch (`git/branching-and-commits`).
- **High-risk specs name their kill switch and their eval.** A `risk: high` plan
  without a before/after measurement plan fails the constitution check
  (`sdd/constitution`, article IV).
- **Never delete a shipped spec.** Mark it `superseded` and link forward. The
  history of what we promised is the asset.
- **The checker is the gate, not the prose.** A rule in this file that the
  checker does not enforce is a request; the ones above marked "enforced" are
  wired into `npm test` and CI. Adding a rule here means adding it to
  `scripts/sdd/spec-lint.ts` in the same change.

## Where things live

```
agent-os/specs/
  README.md                 # orientation and the command loop
  _templates/               # spec.md, plan.md, tasks.md
  NNNN-slug/spec.md         # WHAT and WHY — requirements + acceptance criteria
  NNNN-slug/plan.md         # HOW — approach, constitution check, files, risks
  NNNN-slug/tasks.md        # ordered checklist + verification log
```

Commands: `/sdd:specify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` →
`/sdd:verify`; `/sdd:status` for the board. `npm run sdd:new` scaffolds,
`npm run sdd:check` lints and prints the AC → test traceability matrix.
