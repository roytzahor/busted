---
spec: "0001"
updated: 2026-10-09
---

# 0001 — Tasks

- [x] T1 (AC-1…AC-6) — rule tests in `__tests__/sdd-spec-lint.test.ts`, tagged
- [x] T2 (AC-1…AC-6) — `scripts/sdd/spec-lint.ts`
- [x] T3 (AC-7) — repo gate `__tests__/sdd-specs.test.ts`; CLI `check-specs.ts`
- [x] T4 (AC-8) — scaffolder, templates, six `/sdd:*` commands, `spec-auditor`
- [x] T5 — standards `sdd/workflow` + `sdd/constitution`, index, routing rows
- [x] T6 (AC-7) — CI runs `npm test` and `sdd:check`
- [x] T7 — gates: lint, clean tsc, `npm test`, `sdd:check`; record below

## Verification log

- 2026-10-09 — `npx vitest run __tests__/sdd-spec-lint.test.ts __tests__/sdd-specs.test.ts` → 2 files, 16 tests passed
- 2026-10-09 — `npm run sdd:check` → 1 spec, 10 tags, 0 errors; AC-1…AC-7 each tagged in their named file
- 2026-10-09 — negative check (scratch copy): unchecking T7 in 0001 → `sdd:check` exit 1, "status is verified but 1 of 7 tasks are unchecked"
- 2026-10-09 — AC-8 (scratch copy): `sdd:new -- honest-offer "Honest offer" --risk high` → created `0002-honest-offer/spec.md` with id 0002, risk high, today's dates; the fresh draft lints clean. `.claude/commands/sdd/` lists implement, plan, specify, status, tasks, verify; the session registered all six as `/sdd:*`
