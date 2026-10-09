# Specs

Every behaviour change starts here. A spec states **what** must be true and
**how we will know**; the plan says how it is built; the tasks say in what
order. The rules and the reasons: `agent-os/standards/sdd/workflow.md`. What
every plan is checked against: `agent-os/standards/sdd/constitution.md`.

## The loop

```
/sdd:specify "<idea>"   → NNNN-slug/spec.md        status: draft
/sdd:plan NNNN          → NNNN-slug/plan.md        status: approved
/sdd:tasks NNNN         → NNNN-slug/tasks.md       status: in-progress
/sdd:implement NNNN     → tests (tagged) + code
/sdd:verify NNNN        → gates + spec-auditor     status: verified
merge to main                                      status: shipped
/sdd:status             → the board
```

```bash
npm run sdd:new -- honest-offer "Title" --risk high   # scaffold next id
npm run sdd:check                                     # lint + AC→test matrix
```

`npm test` and CI run the same checks, so a spec cannot claim a status its
evidence does not support.

## Tagging tests

```ts
// @spec 0002/AC-3
it("never renders the CTA without a concrete price delta", () => { … });
```

## Index

| Spec | Status | Risk | Behaviour |
|---|---|---|---|
| [0001](0001-sdd-framework/spec.md) | verified | medium | Specs are the source of truth, and CI checks them |

Keep this table in step with the folders — `/sdd:status` reads the folders,
this table is for humans browsing on GitHub.
