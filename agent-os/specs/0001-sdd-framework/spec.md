---
id: "0001"
title: "Spec-driven development: specs are the source of truth, and CI checks them"
status: verified
risk: medium
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [sdd/workflow, sdd/constitution, context/single-source, eval/gates]
superseded_by: ""
---

# 0001 — Spec-driven development framework

## Problem

Behaviour in this repo is specified in prose that nothing checks: `SPRINT.md`
(60KB of stage write-ups), `ROADMAP.md`, PR bodies and lessons. There is a
`/agent-os:shape-spec` command, but it only works in plan mode with a human
answering questions, writes free-form markdown, and `agent-os/specs/` has never
been created — no spec exists. As a result the same component was nearly
rebuilt three times (lessons 2026-07-07), and a user-facing promise such as
"never render an affiliate link without a concrete price delta"
(`trust/affiliate-neutrality`) is stated in a standard but has no test proving
it holds. Agents working autonomously have no way to record *what* a change
promises before writing *how*.

## Goals

- Every behaviour change starts as a spec with numbered requirements and
  acceptance criteria, each naming how it is proven.
- The lifecycle (draft → approved → in-progress → verified → shipped) is gated
  by a checker in `npm test` and CI, not by goodwill.
- An agent can run the loop end-to-end without a human, and knows exactly which
  decisions it must escalate.

## Non-goals

- Replacing `agent-os/standards/` — standards hold invariants; specs hold
  changes. The constitution routes to standards rather than restating them.
- Retro-specifying the 30+ shipped sprint stages. Specs start from today;
  older behaviour gets a spec when it is next changed.
- A YAML dependency or an external SDD tool (spec-kit etc.) — the format is
  small enough that a dependency-free parser keeps the gate portable.

## Requirements

- **REQ-1** — The system shall reject any spec whose acceptance criteria lack a
  parseable `Verify:` line (test | eval | build | manual), or whose required
  sections or frontmatter are missing.
- **REQ-2** — If a spec at or past `approved` still contains a
  `[NEEDS CLARIFICATION]` marker in prose, then the system shall reject it.
- **REQ-3** — When a spec is at or past `approved`, the system shall require a
  `plan.md` whose constitution check covers every article, with a written
  justification for any violation, and shall require every requirement to be
  covered by at least one acceptance criterion.
- **REQ-4** — When a spec is `verified` or `shipped`, the system shall require
  all tasks checked, a dated verification-log entry, and for every `Verify: test`
  criterion a comment-position `@spec NNNN/AC-n` tag inside the named test file.
- **REQ-5** — If a test tags a spec or criterion that does not exist, or two
  specs share an id, then the system shall reject it.
- **REQ-6** — When a spec is `risk: high`, the system shall refuse a plan that
  marks constitution article IV (Measured) `n/a`.
- **REQ-7** — The system shall run these checks over the real `agent-os/specs/`
  tree in `npm test` and in the CI workflow.
- **REQ-8** — The system shall provide slash commands for each lifecycle step
  and a scaffolder that allocates the next free spec id.

## Acceptance criteria

### AC-1 — malformed specs are rejected

Given a spec missing a `Verify:` line, a required section, a valid status, or
with an id not matching its folder, when it is linted, then an error names the
defect; a well-formed draft lints clean.
Covers: REQ-1
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-2 — open questions block approval

Given an `approved` spec with a `[NEEDS CLARIFICATION]` marker in prose, when
linted, then it errors; the same marker inside inline code, or in a draft, does
not.
Covers: REQ-2
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-3 — approval needs a plan and full coverage

Given an `approved` spec with no plan, a plan missing an article, an
unjustified violation, or an uncovered requirement, when linted, then each case
errors; a complete plan with a justified violation passes.
Covers: REQ-3
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-4 — verified means proven

Given a `verified` spec, when a task is unchecked, the log is empty, the named
test file is missing, or the proving tag is absent or sits in a different file,
then it errors; with all of them present it passes.
Covers: REQ-4
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-5 — dangling traceability fails

Given a tag naming a nonexistent spec or AC, or two specs sharing an id, when
all specs are linted, then each is reported as an error.
Covers: REQ-5
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-6 — high-risk work names its measurement

Given a `risk: high` approved spec whose plan marks article IV `n/a`, when
linted, then it errors; the same plan on a low-risk spec passes.
Covers: REQ-6
Verify: test __tests__/sdd-spec-lint.test.ts

### AC-7 — the gate runs on the real tree

Given the repository, when `npm test` runs, then the repo-wide spec gate lints
every spec in `agent-os/specs/` with the real tags and fails on any error; CI
runs `npm test` and `npm run sdd:check`.
Covers: REQ-7
Verify: test __tests__/sdd-specs.test.ts

### AC-8 — the loop is usable

Given a fresh session, when an agent runs `npm run sdd:new -- some-slug`, then
the next free id is scaffolded from the template, and `/sdd:specify`,
`/sdd:plan`, `/sdd:tasks`, `/sdd:implement`, `/sdd:verify`, `/sdd:status` exist.
Covers: REQ-8
Verify: manual run the scaffolder into a scratch copy and list .claude/commands/sdd/

## Open questions

- none

## Decisions

- Sequential `NNNN-slug` ids, not shape-spec's `YYYY-MM-DD-HHMM` — short ids are
  what make `@spec 0002/AC-3` tags writable by hand.
- Tags count only in comment position — a string literal that mentions a tag
  (assertion messages in this spec's own tests) must not count as proof.
- Agents may self-approve except for product, legal and money calls — the user
  asked for full autonomy, and the gate's purpose is a recorded decision, not a
  signature.
- `npm run sdd:new` scaffolds only `spec.md`; plan and tasks come later so an
  empty plan never masquerades as a decided one.
- Rejected: GitHub spec-kit. Its constitution/spec/plan/tasks shape is borrowed,
  but it would add a parallel `.specify/` tree next to `agent-os/`, violating
  one-fact-one-owner, and its checks are prompt-only.

## Metrics

Share of merged PRs touching `app/`, `lib/` or `components/` that reference a
spec id in their body — read from git history at each roadmap review. Target:
every behaviour-changing PR from 0002 onward.
