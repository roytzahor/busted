# Tooling Catalog

What is installed, what it is for, and when to reach for it. Not injectable via
`/inject-standards` — this is orientation. The injectable rules live in
`agent-os/standards/code-navigation.md`.

## Code intelligence

| Tool | Use for | Notes |
|---|---|---|
| **codebase-memory** (MCP) | callers, callees, blast radius, "where is X" | Self-updating daemon. Authoritative for call edges. |
| **graft** (`graft ask`) | "what is X", "how does X work" | `graft/` is a gitignored regenerable cache |
| **graphify** | wiki generation on demand only | **Deprecated here** — call edges measurably wrong |

Cost ordering and the rule for how far up the ladder to climb:
`standards/context/token-economy`.

A `PreToolUse` hook in `.claude/settings.json` nudges toward the graph on
grep-family Bash commands. It used to mandate **graphify** — the tool this repo
documents as wrong — and a second hook fired on every source and `.md` read.
Both were removed or rewritten on 2026-09-14. If you add a hook that injects
context, count what it costs per firing and how often it fires.

## Skills

| Skill | Use when |
|---|---|
| `/verify` | before committing any nontrivial change |
| `/code-review` | reviewing the working diff before a PR |
| `/security-review` | anything touching auth, input parsing, secrets, network, SQL |
| `/simplify` | cleanup pass — reuse, dead weight, efficiency |
| `/claude-api` | anything touching Anthropic API/SDK — never answer from memory |
| `impeccable` | UI design, critique, audit, polish |
| `strategy-red-team` | stress-testing a plan or roadmap before reality does |
| `business-model` / `monetization-strategy` / `product-strategy` | revenue and positioning work |

`impeccable` (pbakaus, 62.5K★) ships 59 deterministic anti-slop detector rules
plus live browser iteration. Its static engine covers ~14 of them — treat its
findings as a floor, not a clean bill.

The four PM skills are from `phuryn/pm-skills` (25.6K★). `impeccable`, the PM
skills and `strategy-red-team` are installed per-machine, not in the repo, so
cloud sessions do not have them. (A 2026-10-09 attempt to add `impeccable` at
project scope via `npx impeccable install` was refused by the cloud sandbox,
because its launcher downloads a platform binary from GitHub releases. Run it
locally if you want it at project scope.)

## Project plugins (`.claude/settings.json` → `enabledPlugins`)

Declared at project scope from Anthropic's official marketplace
(`anthropics/claude-plugins-official`), so every session in this repo is
offered them. That covers local sessions, cloud sessions and teammates.

| Plugin | Use when | Why it earns its slot here |
|---|---|---|
| `frontend-design` | any UI build or redesign | pushes past generic AI layouts. Pair it with `DESIGN.md`, because The Ledger's rules win where the two differ |
| `pr-review-toolkit` | before opening a PR | `silent-failure-hunter` targets our riskiest pattern: enhancement stages must return `null`, never throw *and* never swallow silently. `pr-test-analyzer` checks whether `@spec`-tagged tests are real proof |

Rejected:

- `feature-dev`: its `/feature-dev` loop duplicates `/sdd:*`, and two front doors for one workflow breaks single-source.
- `security-guidance`: an edit-time hook that calls a model on every change, a per-firing cost of the kind lessons 2026-09-14 warns about. `/security-review` covers the same ground on demand.
- `typescript-lsp`: needs a global `typescript-language-server`, and codebase-memory already answers structural questions locally.

Also available on claude.ai accounts with the Anthropic **Design** plugin:
`design:design-critique`, `design:accessibility-review`, `design:ux-copy`,
`design:design-system`. Use `ux-copy` for verdict and disclosure microcopy,
since every word on the CTA is a trust claim.

## Spec-driven development

| Command | Does |
|---|---|
| `/sdd:specify "<idea>"` | write the spec: requirements and acceptance criteria, no code |
| `/sdd:plan NNNN` | plan, constitution check, then approve |
| `/sdd:tasks NNNN` | ordered, test-first task list |
| `/sdd:implement NNNN` | build it task by task, keeping spec and code in sync |
| `/sdd:verify NNNN` | gates, then `spec-auditor`, then mark verified |
| `/sdd:status` | the board |
| `npm run sdd:new` / `sdd:check` | scaffold the next spec / lint everything and print the AC → test matrix |

Policy: `standards/sdd/workflow`; plan gate: `standards/sdd/constitution`.

## Agent-OS commands

| Command | Does |
|---|---|
| `/agent-os:discover-standards` | interview the codebase, draft new standards |
| `/agent-os:index-standards` | rebuild `index.yml` after adding/removing files |
| `/agent-os:inject-standards [folder]` | pull relevant standards into context |
| `/agent-os:plan-product` | product-level planning |
| `/agent-os:shape-spec` | interactive shaping interview; output must land in the `/sdd` format |

## Project agents

- `model-accuracy-engineer` — owns the eval benchmark, prompts, and model
  selection. Refuses to ship a model or prompt change without a before/after
  eval on real fixtures. Use it for anything in `lib/ai/` or a threshold change.
- `spec-auditor` (sonnet, read-only) — reads a spec and a diff cold, reports
  unproven ACs, weak tests, scope creep, constitution counterexamples. Called
  by `/sdd:verify`; cheap enough to run on every spec PR.

## Model registry

`lib/ai/models.ts` is the **single source of truth** for every model id. No
module may hardcode one. Every accessor reads `process.env` at **call time**,
not import time, because `scripts/eval/model-benchmark.ts` mutates
`GOOGLE_AI_MODEL` after imports have run. Do not "optimize" them into consts.

```bash
npm run eval:model      # benchmark models against the fixture corpus
```
