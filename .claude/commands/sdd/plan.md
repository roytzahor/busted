---
description: Write the technical plan (HOW) for a spec and run the constitution check
argument-hint: "<spec id, e.g. 0002>"
---

# /sdd:plan

Plan spec **$ARGUMENTS** (`agent-os/specs/$ARGUMENTS-*/`).

## Steps

1. Read the spec. If anything in it is ambiguous enough to change the design,
   fix the spec first (bump `updated:`), don't paper over it in the plan.
2. **Load the standards** named in the spec's `standards:` frontmatter, plus
   `sdd/constitution` (`/agent-os:inject-standards sdd/constitution …`).
3. **Map the code.** Who calls what you will change (codebase-memory
   `trace_path` if available, otherwise targeted grep), and which tests already
   cover it. For a large or unfamiliar area, a read-only Explore subagent on a
   cheaper model pays for itself (`context/delegation`) — give it the exact
   questions and ask for file:line facts.
4. **Write `plan.md`** from `agent-os/specs/_templates/plan.md`:
   - Approach that extends existing code; name what is reused.
   - **Constitution check**: one row per article I–IX, `pass` / `n/a` /
     `violation` + justification. Be honest — a justified violation is
     reviewable; a hidden one is not.
   - Files touched, data/contract changes (cached shape → `ai/cache-backcompat`),
     risks, the runtime kill switch for anything risky.
   - Verification plan: every AC → the gate that proves it. `risk: high` names
     the before/after eval and what that eval cannot measure (`eval/gates`).
5. **Approve.** If no `[NEEDS CLARIFICATION]` remains and no open question is a
   product/legal/money call, set the spec `status: approved`. Otherwise leave it
   `draft` and ask the human.
6. `npm run sdd:check -- --quiet` — zero errors.

Next: `/sdd:tasks $ARGUMENTS`.
