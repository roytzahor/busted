# Caveman Register — Compress Instructions, Never Reasons

**Caveman** is a writing register for agent-facing text: strip everything that
carries no instruction. Articles, copulas, hedges, transitions, and restatement
of the question go. Identifiers, numbers, paths and negations stay verbatim.

It typically removes 40–60% of a prompt with no loss of executable meaning. It
is not a style preference and it is not for everything — applied to the wrong
text it silently destroys the thing being stored.

## Before / after

```
Before (46 words)
  I'd like you to take a look at the match confidence module and see if you
  can figure out why the threshold check seems to be letting some low-scoring
  candidates through. Once you've found it, please go ahead and write a test
  that covers the case.

After (17 words)
  lib/aliexpress/match-confidence.ts: low-score candidates pass MATCH_CONFIDENCE_MIN
  (0.4). find cause. add covering test.
```

## Where it applies

- Subagent prompts and task descriptions
- Plans, checklists, working notes
- Agent-to-agent handoffs
- Intermediate scratch files

These are **transient**. They are read once, by a machine, then discarded.

## Where it is forbidden

- **`agent-os/standards/`** — this repo's rules carry their reasons on purpose.
  The README states it directly: *a rule with no rationale gets relaxed by the
  next person who finds it inconvenient.* Every threshold here survived because
  someone wrote down why. Compressing `MATCH_CONFIDENCE_MIN = 0.4` down to the
  number deletes the sentence that stops the next agent tuning it.
- **`.claude/lessons.md`** — the `because <reason>` clause *is* the lesson. The
  trigger alone is a rule nobody can apply to a new situation.
- **Code comments** — they exist to explain constraints the code cannot show
  (`change-discipline`). A compressed comment becomes narration.
- **Anything a user reads** — verdicts, errors, UI copy, and your own replies.

The dividing line: **compress instructions, never reasons.** If the text exists
so a future reader can decide whether a rule still applies, it is a reason.

## Two failure modes to watch

1. **Polarity loss.** "never clamp below 0.5" compressed to "clamp 0.5" inverts
   the rule. Negations, comparison direction (`<` vs `≤`), and units are load
   bearing — keep them character for character.
2. **Referent loss.** "run it before and after" has no meaning once the
   surrounding prose is gone. Every pronoun must become the thing it refers to
   before anything else is cut.

## The test

A caveman prompt is done when a fresh agent with no session context can execute
it without asking a clarifying question — and not one word before that.
