# The Scraper Is A Chain With Runtime Reordering

Entry point: `scrapeProductUrl()` (`lib/scraping/router.ts`). Source detection
runs first (`lib/scraping/detect-source.ts`).

Order: **Crawlbase JS-render (primary) → Firecrawl markdown → Playwright
headless (last resort)**.

The order is **dynamic**: `lib/learning/priors.ts` hoists a domain's
`preferredProvider` and drops its `skipProvider` at runtime. Do not assume a
static chain when debugging — check the priors for that domain first.

`PLAYWRIGHT_FALLBACK_ENABLED` defaults to `false`.

## Never leak the chain to users

Provider names, env var names and vendor error strings are internal. A scrape
failure surfaced to a user as
`crawlbase: … | firecrawl: DNS resolution failed … | Set PLAYWRIGHT_FALLBACK_ENABLED=true`
is a stack trace wearing an alarm colour.

- Route every error through `lib/api/error-utils.ts` (`getSafeErrorMessage`,
  `resolveErrorCode`, `resolveHttpStatus`, `logPipelineError`).
- Never render `err.message` directly.
- **Errors are `silent`.** A scrape failure must not be louder than a real
  verdict — that inverts the whole alarm hierarchy. No red card, no fill, no
  icon: muted body text and a ghost retry.
- Never render an infrastructure failure in `amber`. Amber is a presence tier;
  using it for degraded infrastructure teaches users the wrong prior for the
  tier that means "possible dropship".

## Cost reality

Crawlbase dominates per-scan cost (~$0.005/JS render) and is **invisible to the
eval's `--enforce-cost` gate**, which counts Gemini only. Any claim about scan
cost that cites the eval number is wrong by roughly 5×.

## Vendor risk

Crawlbase, Firecrawl, Gemini and the AliExpress API are all single points of
failure with no contract. Keep every kill switch working and every arm
independently disableable.
