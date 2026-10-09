---
description: Implement an in-progress spec task by task, test-first, keeping spec and code in sync
argument-hint: "<spec id>"
---

# /sdd:implement

Implement spec **$ARGUMENTS** by working its `tasks.md` top to bottom.

For each unchecked task:

1. Re-read the ACs it names. The spec is the source of truth — not your memory
   of it, not the plan's prose.
2. **Test first.** Write the test, tag it `// @spec NNNN/AC-n` in a comment
   directly above, run it, and see it fail for the right reason.
3. Implement the smallest change that makes it pass (`change-discipline`).
   Read every file before editing it. Match surrounding idiom.
4. Run the narrow gate (`npx vitest run <file>`), then check the box.
5. **If reality disagrees with the spec**, stop coding: edit the spec (and
   plan) to the corrected behaviour, bump `updated:`, note it under
   `## Decisions`, then continue. If the correction is a product/legal/money
   call, ask the human.

Delegation: `[P]` tasks touching disjoint files can go to a subagent — use a
cheaper model for mechanical work (renames, fixture plumbing, test scaffolds)
and give it the spec path, the task id, the exact files, and the gate to run
(`context/delegation`). Review its diff before checking its box; its report is
a claim, not evidence.

Never: skip or weaken a test to go green; widen scope beyond the spec's goals
(split a new spec instead); hardcode a model id, inline an error string, or
concatenate class names.

When every box is checked, run `/sdd:verify $ARGUMENTS`.
