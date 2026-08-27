# codebase-memory (primary code graph)

This repo is indexed into the `codebase-memory-mcp` knowledge graph as project
`Users-tzahore-github-busted`. Query it BEFORE grepping or reading source files
for any structural question — callers, callees, impact radius, where something
lives, what a module does.

- `trace_path(direction="inbound")` — who calls X (transitive)
- `trace_path(direction="outbound")` — what X depends on
- `search_graph(query="…")` — find code by name or intent
- `get_code_snippet(qualified_name=…)` — read exact source
- `detect_changes()` — blast radius of the working diff
- `check_index_coverage(...)` — REQUIRED before any "nothing calls X" claim

The index self-updates via a background git-aware watcher. Do not re-index as
routine hygiene; only when `index_status` reports stale/missing.

Full rules, coverage caveats and the known `parse_partial` files: see the
"Codebase Navigation" section of the root `CLAUDE.md`.

# graphify (deprecated here)

Kept only for on-demand wiki/concept generation via `/graphify`. Its call edges
are heuristic and were measurably wrong on this repo. Never use it for
call-graph, caller, or impact questions.

# lessons
Read `.claude/lessons.md` before starting non-trivial work. Append a one-line lesson whenever the user corrects you or an invariant surprises you.
