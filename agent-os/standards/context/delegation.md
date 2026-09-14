# A Subagent Starts Cold

Delegation is not free parallelism. A subagent re-derives context this session
already has, and its transcript is discarded — only its final report survives,
and the user never sees that report. Budget it as **the work, plus a cold
start**, not as the work alone.

## When it pays

- **Wide fan-out search.** Many files, many naming conventions, and you want the
  conclusion rather than the file dumps. The `Explore` agent exists for exactly
  this: it reads excerpts, not whole files.
- **Genuinely independent work** that can run while you do something else.
- **A specialist that owns a gate.** `model-accuracy-engineer` owns the eval
  benchmark and refuses to ship a prompt or model change without a before/after
  run. That refusal is the value; do not route around it.

## When it does not

- Anything one `trace_path` or `graft ask` answers. The graph is cheaper than
  the cold start by an order of magnitude.
- Anything depending on what was decided earlier in this conversation — the
  subagent cannot see it, so you would have to restate it, which is the
  expensive path twice.
- A task with "several parts" or "be thorough" in it. Breadth is not a reason to
  spawn; it is a reason to work through the list.

**Do not spawn unless asked**, per this repo's operating rules. When in doubt,
do it inline.

## The prompt contract

A subagent inherits none of this repo's conventions. Its prompt must carry:

1. **The navigation rule** — query codebase-memory before grepping, per
   `code-navigation`. Without this line the subagent greps the repo and burns
   the budget delegation was supposed to save.
2. **Scope bounds** — the directories it may touch, and whether it may write.
3. **Acceptance criteria** — what "done" means, in testable terms.
4. **The output shape** — what its report must contain, since that report is
   the only thing that survives.

Write it in caveman register (`context/caveman`). It is transient,
machine-read, executed once.

## Handling the result

- **Relay what matters.** The final report is not shown to the user. A summary
  that says "the agent finished" communicates nothing.
- **Do not take it at face value.** Subagents report confident, wrong results.
  Verify any claim you are about to act on — especially a negative one
  ("nothing calls this"), which needs `check_index_coverage` before it can be
  repeated.
- **Never predict a pending agent's findings.** If it has not reported, say it
  is still running.
