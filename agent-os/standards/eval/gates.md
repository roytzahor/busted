# What To Run Before You Claim Something Works

## The command ladder

```bash
npm run lint                       # ESLint
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit   # see the trap below
npm test                           # vitest run
npm run build                      # the only full type-check
npm run eval -- --skip-ai          # replay fixtures, no API spend
```

Other eval entry points:

```bash
npm run eval -- --filter <slug>    # one fixture
npm run eval:capture -- <id> <url> <category>
npm run eval:list
npm run eval:retrieval             # live embedding calls, NOT CI-gated
npm run eval:match-headroom
npm run eval:harvest               # feedback → draft fixture candidates
```

## `tsc --noEmit` can lie

`tsconfig.tsbuildinfo` makes it incremental, so it **skips unchanged files** and
can report success on a genuinely broken tree. This has already happened here:
a shadowed-variable type error passed `tsc` and was only caught by
`npm run build`.

Delete `tsconfig.tsbuildinfo` first, or trust only `npm run build`.

## Frontend fixes need a production build

Dev mode serves CSS through JS chunks, so grepping the dev CSS proves nothing.
Verify token and font changes against `.next/static/css/*.css` after
`npm run build`.

Do not run a build while `next dev` is running — both write `.next` and the
build fails with a misleading `ENOENT: pages-manifest.json`.

## What the eval gate does and does not prove

`.github/workflows/eval.yml` runs lint + tsc + `eval --skip-ai --enforce-cost`
on every PR, and fails on any fixture failure or Tier-0 false fire.

Two known blind spots — state them rather than quoting the headline number:

1. **Verdict accuracy is partly tautological.** Synthetic fixtures author both
   the AI response and the truth, so 100% verdict accuracy does not mean the
   prompt is healthy. Real precision on unseen stores is unmeasured.
2. **The cost gate only counts Gemini.** Scraping (Crawlbase) dominates real
   per-scan cost and is invisible to `--enforce-cost`.
3. **The corpus cannot measure retrieval.** `aliexpress.json` is a stored
   candidate pool, so keyword/translation fixes show a 0.000 delta by
   construction. Verify those on derived artifacts plus unit tests, and treat
   the eval as a no-regression gate only.

Fixtures marked `blockedOnFixtureData` in `truth.json` are excluded from the
pass/fail gate so genuine regressions still fail the build.

New fixtures need a **hand-edited** `truth.json` — never trust the auto-stub
from `eval:capture`.
