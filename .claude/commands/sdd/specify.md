---
description: Turn a feature idea or problem into a spec (WHAT and WHY) in agent-os/specs/
argument-hint: "<what to build or fix, in plain words>"
---

# /sdd:specify

Write the **spec** for: $ARGUMENTS

A spec says what the system must do and how we will know — never how it is
built. Policy: `agent-os/standards/sdd/workflow.md`. Read it first if you have
not this session.

## Steps

1. **Search before specifying.** This repo has usually built it already
   (`.claude/lessons.md` 2026-07-07). Check `agent-os/specs/` for an existing or
   superseded spec, then grep/graph the concept name across `lib/`, `components/`,
   `app/`. If a spec already covers it, amend that spec instead of making a new one.
2. **Gather evidence for the Problem section.** file:line, a real URL, a number
   from the eval or the DB. A problem with no evidence is a hunch — say so.
3. **Scaffold:** `npm run sdd:new -- <kebab-slug> "<Title>" --risk <low|medium|high>`.
   `high` = verdict path, supplier matcher, thresholds, affiliate/CTA, public pages.
4. **Fill `spec.md`:**
   - Requirements in EARS form, one behaviour per `**REQ-n**`.
   - One `### AC-n` per observable outcome: Given/When/Then, `Covers: REQ-…`,
     exactly one `Verify:` line. Prefer `test <path>`; `eval` for accuracy
     claims; `manual` only for what no test can see.
   - Non-goals that actually fence scope.
   - `standards:` frontmatter lists the standards the behaviour touches
     (`agent-os/standards/index.yml`).
5. **Unknowns.** Decide everything you can and record it under `## Decisions`
   with the rejected alternative. Mark only genuine unknowns
   `[NEEDS CLARIFICATION] …`. Product direction, legal exposure, and money
   (pricing, paid services, commission terms) are the human's — ask with
   `AskUserQuestion`, one question with concrete options. Everything else is
   yours to decide.
6. **Self-review for testability.** For each AC ask: could a test fail if the
   behaviour broke? If not, rewrite it. Every REQ covered by ≥1 AC.
7. `npm run sdd:check -- --quiet` — zero errors.

Leave `status: draft`. Next: `/sdd:plan NNNN`.
