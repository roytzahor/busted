# Context Is A Budget, Not A Bucket

Every token in the window was paid for and crowds out something else. The cost
that matters is not the answer's length — it is the **retrieval** that produced
it. A question answered from the graph and a question answered by a grep sweep
produce the same sentence at a 30x difference in cost.

## The cost ladder — climb only as far as the question needs

Measured on this repo, cheapest first:

| Rung | Typical cost | Answers |
|---|---|---|
| Already in context | 0 | anything established this session |
| `trace_path` / `search_graph` | ~0.2–1 KB | who calls X, blast radius, where X lives |
| `graft ask` | ~1–2 KB | what X is, how X works |
| `Read` with `offset`/`limit` | ~1–3 KB | one known section of one known file |
| `Read` whole file | 3–30 KB | a file you will edit end to end |
| `Grep` with a narrow path scope | 2–10 KB | literal strings, non-code text |
| Repo-wide grep sweep | 20–80 KB | almost nothing worth that price |
| Subagent | 5–20 KB + cold start | see `context/delegation` |

The measured case behind this table: asked for the callers of
`computeMatchConfidence`, `trace_path` returned all 15 with the transitive chain
up to the analyze route in **~700 bytes**. graphify spent **2.6 KB** and missed
both production callers. Cheaper *and* right is the normal outcome, not a
trade-off — see `code-navigation` for which graph answers which question shape.

## Rules

1. **Never start at the top of the ladder.** A repo-wide grep is an admission
   that you did not know what you were looking for. Find the name first, then
   read the one place it lives.
2. **Narrow, then widen.** Scope every `Grep` to a directory. If a scoped search
   fails twice, the term is wrong — fix the term, do not widen the blast radius.
3. **Read parts of files.** `Read` with `offset`/`limit` when you need one
   function out of a 1500-line file. Read whole files only when you will edit
   them broadly.
4. **Do not re-read a file you just edited.** `Edit` fails loudly if the match
   missed, so a confirming read buys nothing.
5. **Batch independent calls.** Two reads with no dependency between them go in
   one block. Serializing them costs a whole extra turn of overhead.
6. **Don't pay twice for always-on context.** `CLAUDE.md` is loaded into every
   session before any work starts. A fact that also lives in a standard is
   billed on every session that never needed it — see `context/single-source`.
7. **Cap the output too.** Do not echo a file you just wrote, paste a diff the
   user can see, or restate a plan you are about to execute.

## What not to optimize

Token economy is a constraint on *retrieval*, never on *correctness*.

- Do not skip reading a file you are about to edit to save tokens. The
  read-before-write rule in `change-discipline` outranks this entire file.
- Do not skip the gates in `eval/gates` because a build is expensive.
- Do not guess an API to avoid opening a file. One wrong guess costs more than
  every read it avoided.
- Do not compress a rationale out of a standard. See `context/caveman` for
  where compression is correct and where it destroys the thing being stored.

When the two collide, verification wins and you spend the tokens.
