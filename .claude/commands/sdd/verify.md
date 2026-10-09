---
description: Prove a spec is done — run gates, audit diff against acceptance criteria, mark verified
argument-hint: "<spec id>"
---

# /sdd:verify

Verify spec **$ARGUMENTS**. Nothing is "done" that has not been observed.

1. **Gates** (`agent-os/standards/eval/gates`), in order, stopping on the first red:
   `npm run lint` → `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` →
   `npm test` → `npm run build` (never while `next dev` runs) →
   `npm run eval -- --skip-ai` for anything on the verdict/matcher path.
   `risk: high` with an accuracy claim: the live eval named in the plan
   (`npm run eval:model` needs credentials — if unavailable, say so in the log;
   never fabricate a number).
2. **Every AC proven by its own kind:**
   - `test` → the tagged test exists in the named file and passes.
   - `eval` / `manual` / `build` → a dated, observed line in
     `tasks.md` `## Verification log` (command → result).
3. **Independent audit.** Spawn the `spec-auditor` agent with the spec id and
   the diff range. It reads spec + diff cold and reports uncovered ACs, scope
   creep, and constitution violations. Fix what it finds or record why not.
4. Set `status: verified`, bump `updated:`, run `npm run sdd:check` (full
   output — paste the spec's traceability rows into the PR body).
5. After merge to `main`, set `status: shipped` in a follow-up commit or the
   merge itself.

PR body: link the spec, list ACs with how each was proven, list anything found
and deliberately not fixed (`git/branching-and-commits`).
