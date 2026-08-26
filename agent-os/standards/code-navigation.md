# Query The Graph Before You Grep

This repo is indexed into **codebase-memory** (MCP server `codebase-memory-mcp`,
project `Users-tzahore-github-busted`). A `trace_path` call costs a few hundred
tokens where the equivalent grep sweep costs tens of thousands.

The index **maintains itself** — a background daemon watches the repo with a
git-aware watcher and re-indexes on change. Do not run `index_repository` as
routine hygiene; only when `index_status` reports stale or missing, or after a
large external change (branch switch with a huge diff, dependency bump).

## Pick by question shape — do not query all three

| Question | Tool |
|---|---|
| "who calls X" / "what breaks if I change X" | codebase-memory `trace_path` |
| "what is X" / "how does X work" / "where do I start" | `graft ask "<q>" .` |
| broad architecture prose / wiki | graphify, on demand only |

- `trace_path(direction="inbound")` — callers and blast radius (**transitive**)
- `trace_path(direction="outbound")` — dependencies
- `search_graph(query="…")` — find by name or intent
- `get_code_snippet(qualified_name=…)` — exact source
- `detect_changes()` — map the working diff to its blast radius; run it before
  touching `DropshipPrediction`, `computeMatchConfidence`,
  `MATCH_CONFIDENCE_MIN`, or the analyze route

## Coverage is best-effort, never proof

Call `check_index_coverage` on the paths behind any negative or exhaustive claim
("nothing calls X", "this is dead code"). `index_status` flags
`lib/index/embeddings.ts` and `scripts/index/cluster-products.ts` as
`parse_partial` — grep those directly rather than trusting a graph miss.
Absence from the flagged list is not a guarantee either.

## graphify is deprecated here

Its call edges are heuristic and were **measurably wrong** on this repo: asked
for the callers of `computeMatchConfidence` it missed both production callers
(`lib/aliexpress/find-supplier.ts`, `lib/supplier/router.ts`) and reported the
edges it did find in the wrong direction. Never use it for call-graph, caller,
or impact questions.

## Refresh commands

```bash
npm run graph:cbm          # re-index codebase-memory (rarely needed)
npm run graph:graft        # structural graft cache, $0, no key
npm run graph:graft:deep   # adds the LLM "meaning" tier
npm run graph:all          # all three
```

`graft/` is a gitignored regenerable cache. Its deep tier runs on
`gemini-flash-latest`, **not** the pipeline's pinned `GOOGLE_AI_MODEL` — the
eval harness needs the pipeline model pinned; graft does not.
