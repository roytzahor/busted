# The Extension Renders The Server's Tier, And Fails Closed

`extension/` is MV3 vanilla JS with no build step. Per the roadmap it is the
**primary** surface — the web app is the landing/share/SEO surface.

## Render verbatim

The popup and badge render `presenceTier` exactly as the server computed it.
Never re-derive a tier, and treat missing or errored as `silent`.

## A failed check is not an all-clear

`fetchScanResult()` returns `{ presenceTier: 'silent', error: true }` on network
failure, non-200 and any exception. Falling through to the silent state there
claims the page is clean **on zero information** — the one thing a smoke alarm
must never do.

`renderResult()` branches on `result.error` (and a missing tier) into a distinct
`unavailable` state: *"Couldn't check this page right now."* — body colour, no
icon, no claim.

- **No checkmark on `silent`.** A ✓ is a claim of safety; silence is only the
  absence of a finding.
- Neither `silent` nor `unavailable` uses `--success`. Green reads as a verified
  all-clear.

## Money never shouts over an all-clear

The savings ledger is revealed by `showLedger()` from `renderFlame()` only. On a
silent or unavailable page a cumulative savings figure would be the loudest
thing on screen — the exact inversion the tier system exists to prevent.

## Known debt

The extension shares **zero tokens** with the web app and uses four different
brand oranges (`#E88A3A`, `#FF6B35`, `#E4572E`, `#D99A2B`) against web
`--primary` `#f67f2f`. It also has no `dir` handling for RTL. Extract a shared
`tokens.css` before adding surface area.
