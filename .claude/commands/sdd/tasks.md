---
description: Break an approved spec's plan into an ordered, test-first task list
argument-hint: "<spec id>"
---

# /sdd:tasks

Write `tasks.md` for spec **$ARGUMENTS** from `agent-os/specs/_templates/tasks.md`.

Rules:

- The spec must be `approved`. If it is not, stop and run `/sdd:plan`.
- Order so the tree stays green after every task. Tests for an AC come
  **before** the code that satisfies it (`T1 (AC-2) — failing test tagged
  // @spec NNNN/AC-2`, then `T2 (AC-2) — implement`).
- Each task names the ACs it serves. Every AC appears in at least one task.
- Mark `[P]` on tasks with no file overlap with the previous one — those can go
  to a parallel subagent.
- Last tasks are always: run the gates in `agent-os/standards/eval/gates`
  appropriate to the risk, and record results in `## Verification log`.
- One commit per coherent task group, subject-grouped
  (`git/branching-and-commits`).

Then set the spec `status: in-progress` and run `npm run sdd:check -- --quiet`.

Next: `/sdd:implement $ARGUMENTS`.
