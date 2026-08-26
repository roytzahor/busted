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

The four PM skills are from `phuryn/pm-skills` (25.6K★).

## Agent-OS commands

| Command | Does |
|---|---|
| `/agent-os:discover-standards` | interview the codebase, draft new standards |
| `/agent-os:index-standards` | rebuild `index.yml` after adding/removing files |
| `/agent-os:inject-standards [folder]` | pull relevant standards into context |
| `/agent-os:plan-product` | product-level planning |
| `/agent-os:shape-spec` | turn an idea into a reviewable spec |

## Project agents

- `model-accuracy-engineer` — owns the eval benchmark, prompts, and model
  selection. Refuses to ship a model or prompt change without a before/after
  eval on real fixtures. Use it for anything in `lib/ai/` or a threshold change.

## Model registry

`lib/ai/models.ts` is the **single source of truth** for every model id. No
module may hardcode one. Every accessor reads `process.env` at **call time**,
not import time, because `scripts/eval/model-benchmark.ts` mutates
`GOOGLE_AI_MODEL` after imports have run. Do not "optimize" them into consts.

```bash
npm run eval:model      # benchmark models against the fixture corpus
```
