# One Fact, One Owner

Duplicated documentation costs twice and drifts once. In an always-on file the
cost is charged to **every session**, including the ones that never touch the
subject.

## The layers, and what each is for

| Layer | Loaded | Contains |
|---|---|---|
| `~/.claude/CLAUDE.md` | every session, every repo | cross-project workflow only |
| `CLAUDE.md` | every session | **routing** — what this repo is, where things are, which standard owns what |
| `agent-os/standards/**` | on demand | the invariants themselves, with reasons |
| `agent-os/product/`, `agent-os/tools/` | read directly | orientation, file map, catalog |
| `DESIGN.md`, `ROADMAP.md` | read directly | the long-form specs |

**`CLAUDE.md` routes; standards state.** If a fact is a load-bearing invariant
it belongs in a standard, and `CLAUDE.md` gets a pointer. If it fits in a
pointer, it was never worth the always-on slot.

## The rule

When you are about to write a fact into `CLAUDE.md`, check whether a standard
already states it. If one does, write the pointer instead. If none does but it
is an invariant, write the standard and then the pointer.

This was not hypothetical: `CLAUDE.md` once carried the full colour-token table,
the full clamp table, the full match-confidence weights and the full navigation
rules, all of which `design/tokens`, `ai/verdict-clamps`,
`supplier/match-thresholds` and `code-navigation` already owned — about 6.8k
tokens loaded before any work began, most of it a second copy.

## Deliberate mirrors

A few duplications are worth keeping. Mark them, both ways, so an edit to one
is known to require the other:

| Mirror | Source of truth |
|---|---|
| colour token table in `design/tokens` | `app/globals.css` |
| clamp rules in the prompt ↔ `applyClamps()` | neither — they must move together (`ai/verdict-clamps`) |
| phases in `product/context` | `ROADMAP.md` |

An unmarked mirror is a bug. A marked one is a contract.

## When copies disagree

The **standard wins** and the copy gets fixed in the same change — never the
other way round, and never by deleting the standard's reason to match a
shorter copy.
