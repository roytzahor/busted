# How A Change Gets Made Here

## Order of operations

1. **Read before you write.** Never edit a file you have not read; never "fix"
   a failure you have not located precisely.
2. **Smallest correct change.** Solve the stated problem. A 5-line diff that
   fixes the bug beats a 50-line diff that also improves things.
3. **Match the codebase, not your taste.** Mirror existing naming, error
   handling, comment density and layout.
4. **Verify, then report.** Run the gates in `eval/gates`. If tests fail, say so
   with the output. Never report success you have not observed.

## Comments

Explain **constraints the code cannot show** ("must run before X because Y"),
never narration of the next line. Every threshold and every clamp in this repo
carries the reason it exists — keep that up, because the reasons are what stop
the next person relaxing them.

No dead code, no commented-out blocks, no `TODO` without an owner or issue.

## Feature flags and kill switches

Leave the disabled path intact. Never delete a guarded path because the flag is
off.

| Switch | Default | Kills |
|---|---|---|
| `IMAGE_MATCH_ENABLED` | on | image-based match verification |
| `TIER0_FINGERPRINT_ENABLED` | on | Tier-0 deterministic gate |
| `PREPROCESS_ENABLED` | `false` | Tier-2 image preprocessing |
| `VECTOR_INDEX_ENABLED` | `false` | pgvector ANN candidate arm |
| `PLAYWRIGHT_FALLBACK_ENABLED` | `false` | Playwright scrape arm |

## Types and errors

No `any`/`unknown` escapes to silence a checker — fix the type or document why
it is impossible. Errors go through `lib/api/error-utils.ts`; do not invent a
parallel path.

## Contract changes

Changing `DropshipPrediction` shape means updating `parseCachedAiPrediction()`
in `lib/types/cache.ts` for back-compat with older cached entries. See
`ai/cache-backcompat`.

## Concurrency warning

More than one agent session may be editing this tree. Before a long refactor,
check `git status` and `git log --oneline -5` — work has been committed
underneath an in-flight session before.

## Lessons

Read `.claude/lessons.md` before non-trivial work. Append a one-line lesson
whenever a correction lands or an invariant surprises you. Format:
`- [YYYY-MM-DD] [scope] When <trigger>, do <behavior> — because <reason>.`
