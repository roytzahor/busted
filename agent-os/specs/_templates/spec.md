---
id: "NNNN"
title: "<behaviour in one line>"
status: draft
risk: low
owner: "<who drives it>"
created: YYYY-MM-DD
updated: YYYY-MM-DD
standards: []
superseded_by: ""
---

# NNNN — <Title>

## Problem

<What is wrong or missing today, for whom, with evidence (file:line, a number,
a real URL). One paragraph. No solution here.>

## Goals

- <outcome, observable from outside the code>

## Non-goals

- <what this spec deliberately does not do, so scope cannot creep>

## Requirements

<!-- EARS form: "When <trigger>, the system shall <response>." /
     "The system shall <invariant>." / "If <unwanted condition>, then the
     system shall <response>." One behaviour per line. -->

- **REQ-1** — When <trigger>, the system shall <response>.

## Acceptance criteria

<!-- Every AC has exactly one `Verify:` line: test <path> | eval <command> |
     build | manual <how>. Prefer test. Tag the proving test with
     `@spec NNNN/AC-n`. -->

### AC-1 — <short name>

Given <state>, when <action>, then <observable result>.
Covers: REQ-1
Verify: test __tests__/<file>.test.ts

## Open questions

<!-- Mark each unresolved item `[NEEDS CLARIFICATION] …`. The spec cannot
     leave draft while any remain. Product, legal and money calls go to the
     human; everything else the author decides and records below. -->

- none

## Decisions

- <decision> — <why, and what was rejected>

## Metrics

<How we will know in production that this worked — an event, a query, an eval
number. "n/a" is allowed for pure-correctness specs; say why.>
