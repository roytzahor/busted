# Verdict Clamps Are The Trust Boundary

`applyClamps()` in `lib/ai/dropship-verifier.ts` re-enforces every humility rule
in code **after** the model responds. The prompt asks; the clamps guarantee.

- Never widen a confidence range or add a verdict in the prompt without adding
  the matching clamp. A prompt-only rule is not enforced.
- Code comments cite prompt rule numbers (`rule 2`, `rule 3`, `rule 7`,
  `rule 10`, `rule 11`). Renumbering the prompt means updating those comments.

Enforced invariants:

| Condition | Clamp |
|---|---|
| `reasoningSignals` empty + verdict `dropship`/`legit` | demote to `insufficient_evidence`, confidence ≤ 0.4 |
| < 3 scrape attributes + verdict `dropship`/`legit` | confidence ≤ `SPARSE_EVIDENCE_CONFIDENCE_CEILING` |
| verdict `insufficient_evidence` | confidence clamped into `[0.2, 0.5]` |
| verdict `collection_page` | confidence floored at 0.7 |

- Empty `reasoningSignals` is a **code-side hard fail**. The model cannot escape
  it, and `npm run eval` depends on that.
- Run `npm run eval -- --skip-ai` before and after any prompt or clamp change and
  report the delta.
