# Agent OS

Reviewable engineering standards for Busted. The point is that load-bearing
invariants live in small, diffable files instead of prose buried in `CLAUDE.md`
— so they can be cited in review, injected into context on demand, and changed
deliberately.

## Layout

```
agent-os/
  standards/          # injectable via /agent-os:inject-standards
    index.yml         # folder → file → one-line description
    *.md              # "root" folder — cross-cutting workflow
    ai/               # verdict schema, clamps, cache back-compat
    trust/            # the presence contract and its public consequences
    supplier/         # match thresholds and failing closed
    design/           # tokens, contrast method, motion
    eval/             # which gates to run, and what they don't prove
    scraping/         # provider chain, error surfacing
    extension/        # render verbatim, fail closed
  product/context.md  # thesis, phases, open strategic questions
  tools/catalog.md    # what's installed and when to reach for it
```

`root` is a reserved keyword for `.md` files directly in `standards/`. Do not
create a folder named `root`.

## Using it

```
/agent-os:inject-standards                  # auto-suggest from context
/agent-os:inject-standards trust            # everything in trust/
/agent-os:inject-standards trust/presence-tier-contract
/agent-os:index-standards                   # rebuild index.yml after edits
/agent-os:discover-standards                # interview the code, draft new ones
```

Only `standards/` is injectable. `product/` and `tools/` are orientation — read
them directly.

## Which standards matter for what

| Touching | Read first |
|---|---|
| `lib/ai/` prompts or clamps | `ai/verdict-clamps`, `ai/derived-fields`, `eval/gates` |
| anything a user sees | `trust/presence-tier-contract`, `design/tokens` |
| `/store/[domain]` or anything public | `trust/public-accusation` |
| supplier matching or thresholds | `supplier/match-thresholds`, `eval/gates` |
| affiliate links or CTAs | `trust/affiliate-neutrality` |
| `extension/` | `extension/render-verbatim` |
| scrapers or error paths | `scraping/provider-chain` |
| any nontrivial change | `change-discipline`, `code-navigation` |

## Adding a standard

Write it, then run `/agent-os:index-standards` so `inject-standards` can find
it. Keep each file to invariants with reasons — a standard that only restates
what the code obviously does is noise, and a rule with no rationale gets
relaxed by the next person who finds it inconvenient.
