# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
When `graphify-out/graph.json` exists, run `graphify query "<question>"` BEFORE grepping or reading source files.

# lessons
Read `.claude/lessons.md` before starting non-trivial work. Append a one-line lesson whenever the user corrects you or an invariant surprises you.
