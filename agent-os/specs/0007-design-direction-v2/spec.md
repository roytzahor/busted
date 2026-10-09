---
id: "0007"
title: "Design direction v2: find out what is wrong, explore alternatives in the browser, and apply design skills"
status: draft
risk: medium
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [design/tokens, design/motion, design/surfaces, trust/presence-tier-contract, sdd/constitution]
superseded_by: ""
---

# 0007 — Design direction v2

## Problem

On 2026-10-09 the owner said they do not much like the current design ("The
Ledger": dark textured room, manila paper evidence, monospace labels, a
to-scale markup bar). They did not say what they dislike. Specs 0002–0004 made
the result screen honest and structurally faithful to `DESIGN.md`, so the
remaining gap is **taste**, which an agent cannot infer from a code review.

Two facts constrain the answer:
- The trust rules are not styling. Verdict before money link, no sticky CTA,
  silent renders nothing decorated, tier carried by more than hue
  (`DESIGN.md` §8, §2.3). Any new direction keeps them.
- The owner's brief: "simple, works well, and beautiful"; the freedom to change
  designs, technologies and methods.

## Goals

- Learn, from the owner, what is wrong, in one cheap round.
- Show 2–3 real alternatives in a browser, on the same four offer shapes,
  before building any.
- Install design skills that raise the floor for every later UI change.

## Non-goals

- Re-litigating the trust rules.
- A full rebuild before the owner has chosen a direction.

## Requirements

- **REQ-1** — The system shall present the owner with concrete options for
  what is wrong, and shall not choose a direction on their behalf.
- **REQ-2** — Each alternative direction shall render the same four offer shapes
  (confirmed, likely, amber, closest) at 390 and 1280 px, LTR and RTL, from the
  design preview page, with the §8 trust rules intact.
- **REQ-3** — Design skills shall be enabled where a session can use them, and
  recorded in `agent-os/tools/catalog.md` with the reason each was chosen and
  rejected.
- **REQ-4** — The chosen direction shall land as its own spec, with tokens
  measured for contrast on the surface they sit on (`design/tokens`).

## Acceptance criteria

### AC-1 — the owner has said what is wrong

Given the options presented, when the owner answers, then the answer is
recorded in this spec's Decisions, and `[NEEDS CLARIFICATION]` is cleared.
Covers: REQ-1
Verify: manual the owner's answer, quoted in Decisions

### AC-2 — alternatives are comparable

Given the preview page, when screenshotted, then each alternative shows the four
shapes at both widths and directions, and screenshots are committed to
`visuals/`.
Covers: REQ-2
Verify: manual Playwright screenshots of /dev-monitor/design?only=offers&dir=rtl, per direction

### AC-3 — the trust rules survive any direction

Given any alternative, when its render tests run, then the same DOM-order,
retired-surface, disclosure and silent-boundary assertions from spec 0004 pass
unchanged.
Covers: REQ-2
Verify: test __tests__/ledger-offer.test.tsx

### AC-4 — skills are recorded

Given the catalog, then it lists each enabled design skill and each rejected
one with a reason.
Covers: REQ-3
Verify: manual read agent-os/tools/catalog.md

### AC-5 — the chosen direction is its own spec

Given the owner's pick, then a new spec exists whose acceptance criteria include
a contrast measurement for every new token on the surface it sits on (linear
RGB, in gamut, per `design/tokens`), and 0007 is marked `superseded` by it.
Covers: REQ-4
Verify: manual the follow-up spec's contrast table

## Open questions

- [NEEDS CLARIFICATION] What is wrong with the current design? The owner
  decides: this is taste, and it is theirs. Suggested options for them to
  pick from, any number:
  - too dark or heavy
  - too "document / paper": feels like a ledger, not a product
  - hard to scan quickly: too much text and mono type
  - the landing page, not the result screen
  - not Hebrew/RTL-first enough
  - something specific: a screenshot of what they prefer

## Decisions

- **Ask once, then show.** One question from a list is cheaper than building
  a direction nobody wanted, and screenshots of three alternatives are cheaper
  than a rebuild.
- **Design skills found on 2026-10-09** (from the claude.ai plugin directory;
  none installed by the agent, which cannot self-install user-level plugins):

  | Plugin | Publisher tier | Why / why not |
  |---|---|---|
  | **Design** (critique, accessibility-review, ux-copy, design-system, handoff) | Anthropic | **Recommend.** Critique and a11y are the gap; ux-copy matters because every word near the CTA is a trust claim |
  | **audit-suite** (incl. make-interfaces-feel-better, web-animation-design, web-design-guidelines, emil-design-engineering) | community | **Recommend.** `DESIGN.md` already cites `make-interfaces-feel-better`; contained, no hooks |
  | **ux-ui-audit** | community | **Recommend.** Browser probes for contrast, tap targets and focus rings, plus an RTL/Arabic engine; Busted ships Hebrew |
  | **UXKIN** (no-ui-slop + MCP) | community | Maybe. Looks at real app screens before building; remote MCP is a new dependency |
  | **design-skills** (10 frameworks) | community | Maybe. Overlaps Design and audit-suite |
  | designs-drift | community, privileged | **Reject.** A PostToolUse hook on every UI write for "121 brands": the per-firing cost lessons 2026-09-14 warns about, and it would lock a system that is under review |
  | Codesign, Rayden UI, euxlab | community | **Reject.** Print/video tooling, a different design system, enterprise research flow |

  Already enabled in the repo: `frontend-design` (official marketplace).
  `impeccable` could not be installed at project scope from the cloud sandbox
  (its launcher downloads a binary); the owner can run `npx impeccable
  install` locally.

## Metrics

- Owner's verdict on the shown alternatives (picked, or "none").
- Contrast measurements for the chosen tokens, recorded per `design/tokens`.
