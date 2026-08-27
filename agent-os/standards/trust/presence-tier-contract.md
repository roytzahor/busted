# presenceTier Is The Only UI Confidence Contract

`computePresenceTier()` (`lib/analyze/presence-tier.ts`) maps a prediction to
`flame | amber | silent`. It is computed **server-side** and surfaced on
`AnalyzeResponse`. Clients render what it says and never re-derive a tier from
a raw confidence number.

| Tier | Condition | UI |
|---|---|---|
| `flame` | verdict `dropship` AND confidence ≥ 0.7 | full teardown — solid markup bar, count-up, stamp |
| `amber` | verdict `dropship` AND confidence ≥ 0.5 | same sheet, ghosted bar, no stamp, no count-up |
| `silent` | everything else, including every error | one muted line, no card |

Errors and degraded responses are always `silent`. We never alarm on failure.

## A prop is a request; a boundary is a contract

Passing `presenceTier` down and trusting call sites to honour it **has already
failed in this codebase**: four components never consulted it, so `silent`
rendered a confidence percentage, a product card, a red price and a
fire-bordered "AI Verdict" panel.

Wrap any decorated subtree in `<SilentBoundary tier={...}>`
(`components/ui/silent-boundary.tsx`). On `silent` it does not render children
at all, so a forgotten card cannot reach the screen.

- Put new cards, figures and prices **inside** the boundary. Then the silent
  case stays correct by construction rather than by review.
- Its `quiet` prop is the only thing `silent` may render: one muted line, no
  card, no figure, no tier colour.
- Do not attempt to allowlist child element types instead. React cannot see a
  `<Card>` rendered inside another component, so an allowlist gives false
  confidence. Not mounting the subtree is the only real guarantee.

## Never let the UI out-claim the engine

- Missing data must **degrade, never promote**. `result.matchQuality ?? "low"`,
  and a `null` quality counts as uncertain. The inverse (`?? "high"`) silently
  suppressed the uncertain-match warning.
- The client never recomputes a verdict, a tier, or a confidence band.
- Do not render a second confidence figure beside a verdict the tier already
  states — on `silent` it re-opens the question the sheet just closed.

## Related

- `trust/public-accusation` — the same rule applied to store-level pages
- `ai/verdict-clamps` — the server-side half of the same discipline
