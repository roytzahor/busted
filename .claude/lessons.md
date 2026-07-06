# Lessons — Busted

Project-specific corrections. One line per lesson, newest last — same protocol as `~/.claude/lessons.md` (read before non-trivial work, append on any correction, dedupe, keep under ~60 lines).

## Lessons

- [2026-07-06] [accuracy] When touching the verdict prompt (`lib/ai/dropship-verifier.ts`) or match scoring (`lib/aliexpress/match-confidence.ts`), run `npm run eval -- --skip-ai` before and after — false positives (wrong supplier shown on legit pages) are the most damaging failure mode.
- [2026-07-06] [accuracy] When adding/relaxing a verdict rule in the prompt, mirror it in `applyClamps()` in the same commit — humility rules must be enforced in code, not just in the prompt.
- [2026-07-06] [pipeline] Image match (`lib/ai/image-match.ts`) and cross-network fallback (`lib/supplier/fallback-match.ts`) must return `null` on failure, never throw — enhancement stages can only ever help the scan, never break it.
- [2026-07-06] [pipeline] Learning-priors getters (`lib/learning/priors.ts`) must never throw; return null/stale on DB errors — the analyze pipeline must survive the learning DB being down.
- [2026-07-06] [flags] Kill switches (`IMAGE_MATCH_ENABLED`, `MULTI_SUPPLIER_ENABLED`, `IDENTIFIER_ENABLED`) gate at runtime; keep the disabled code path intact — never delete a guarded path because the flag is off.
- [2026-07-06] [eval] New fixtures need a hand-edited `truth.json` — the auto-stub from `eval:capture` is not ground truth. Synthetic fixtures come from `scripts/eval/seed-synthetic-fixtures.ts`, not hand-authoring JSON.
- [2026-07-06] [cache] When changing the `DropshipPrediction` shape, update `parseCachedAiPrediction()` in `lib/types/cache.ts` — older cached entries (including legacy boolean-only ones) must keep parsing.
- [2026-07-06] [scraping] Default scrape order is crawlbase → firecrawl → playwright; `lib/learning/priors.ts` can override it per-domain at runtime — never hardcode the order in the route handler.
- [2026-07-06] [ui] Dark mode is the only mode — `<html>` always has the `dark` class; never add a light-mode toggle without explicit instruction. All className merging goes through `cn()`.
- [2026-07-06] [tier0] When adding deterministic verdict rules, measure FIRE RATE on dropship fixtures, not just false-fire rate — the first rule set had 0 false fires and 0 recall (required 2 shipping signals; real pages carry 1 shipping + template copy). Tune against the fixture signal distribution.
- [2026-07-06] [extension] chrome.runtime messages from a popup have NO sender.tab (only content scripts do) — the popup must pass tabId/url explicitly in the message payload.
