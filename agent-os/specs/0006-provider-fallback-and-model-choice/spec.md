---
id: "0006"
title: "A second AI provider as fallback, and the primary model chosen by measurement"
status: draft
risk: high
owner: "CEO agent"
created: 2026-10-09
updated: 2026-10-09
standards: [ai/verdict-clamps, eval/gates, supplier/match-thresholds, sdd/constitution]
superseded_by: ""
---

# 0006 — Provider fallback and model choice

## Problem

The product runs on one provider, Google, through `lib/ai/client.ts`. The
owner asked on 2026-10-09 whether a cheaper or better model exists, citing
"GPT Sol 6.1". Research this session (below) found that **price is the wrong
first question**, and that two other findings matter more.

**1. Reliability, not price, is the measured gap.** The 90-URL live validation
(2026-08-28) lost 7/90 scans to Gemini 503 "high demand" errors. The lesson
recorded then — "worth a ticket, not yet fixed" — is that there is no
cross-provider fallback. A cheaper model does nothing about that.

**2. LLM spend per scan is already under a cent.** The offline eval projects a
mean of **$0.0067/scan** (`npm run eval -- --skip-ai`, cost row). At 30 total
scans ever, the absolute difference between any two candidate models is
cents. Scraping (Crawlbase) dominates real per-scan cost and the cost gate
does not count it (`eval/gates`). Optimising the model for price is the
smallest lever available.

**3. The pinned model is on a retirement path.** `.env.example` pins
`gemini-3.7-flash`. Google's Vertex page lists its retirement for
**2027-01-28** and recommends **Gemini 3.8 Flash** (same introductory price).
The Developer API retirement date was not confirmed. The introductory price
also doubles on 2027-01-01 ($0.75/$3.75 → $1.50/$7.50 per million tokens).

## Research (2026-10-09)

Prices are USD per million tokens, from search-engine summaries of the
vendors' own pages. Direct fetches of `openai.com` and `ai.google.dev` were
blocked by the sandbox's egress policy, so **no figure below was read from the
primary page by this session.** Re-verify before any decision. The benchmark's
`PRICING` table carries the same warning.

| Model | Input | Output | Notes | Source status |
|---|---|---|---|---|
| Gemini 3.7 Flash (current) | $0.75 → $1.50 (2027) | $3.75 → $7.50 (2027) | thinking tokens bill as output | repo table + search summary agree |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 | repo uses it for mechanical tasks | repo table + search summary agree |
| Gemini 3.8 Flash | $0.75 → $1.50 (2027) | $3.75 → $7.50 (2027) | recommended upgrade from 3.7 | search summary only |
| **GPT-6.1 Sol** | **$2.00** | **$10.00** | cached input $0.10, batch −50%, text+image in, text out, 1.05M ctx; launched 2026-09-29. Fast mode 2×, Ultrafast 6× | search summary of OpenAI's pages |
| Claude Haiku 5.5 | $0.10 | $0.50 | images are billed as input tokens; ~1.3k tokens for a 1000×1000 image | search summary only, **suspiciously low — treat as unverified** |

Relative to the current model at the same token counts (computed, not
measured): GPT-6.1 Sol is **2.7× the price** today and 1.3× after the
2027 price change. Flash-Lite is about 0.35×. "Very cheap" does not hold for
Sol at list price against this stack. Per-token price also hides the larger
variable, which is **thinking tokens** (`lessons` 2026-08-25: gemini-2.5-flash
burned 1,692 think tokens per verdict against 799 for 3.7). Only a measured
run shows cost per verdict.

Conflict of interest, stated plainly: this spec was written by a Claude
model, and Claude Haiku is a candidate. The benchmark decides, not the author.

## Goals

- A scan survives a Gemini outage or 503 burst by falling back to a second
  provider, without any change to what the user sees.
- The primary model is whichever scores best on **cost per correct verdict**
  on the real fixtures, with the number recorded.
- The model ids stay in `lib/ai/models.ts`, rollable from `.env`.

## Non-goals

- Switching the **embedding model**. Changing it orphans every stored vector
  (`lib/ai/models.ts` says so, and `lib/index/embeddings.ts` filters on it).
- Switching **image generation**. The preprocess path is Gemini-specific and
  gated off (`PREPROCESS_ENABLED=false`).
- Choosing a cheaper model for *verdicts* on price alone. A false "busted" on a
  legit store is the costliest failure; price never outranks the clamps.

## Requirements

- **REQ-1** — The AI client shall call providers through one interface, so a
  model id and a provider are configuration, not code.
- **REQ-2** — When the primary provider returns a retryable failure (503,
  429, timeout) after its own key rotation, then the client shall try the
  next configured provider before returning an error.
- **REQ-3** — A fallback provider's output shall pass through the same
  `applyClamps()` and the same schema parsing. No provider can widen
  confidence.
- **REQ-4** — The system shall record which provider and model decided each
  verdict, in the service events and in the eval report.
- **REQ-5** — The benchmark shall report accuracy, shown-verdict precision,
  latency and **cost per correct verdict**, including thinking tokens, for
  every candidate on the real fixtures.
- **REQ-6** — If no second provider is configured, then behaviour shall be
  unchanged (a kill switch by absence).

## Acceptance criteria

### AC-1 — fallback on a retryable failure

Given a primary provider that throws a 503 and a configured fallback that
succeeds, when a verdict is requested, then the fallback's prediction is
returned, with its provider recorded, and clamps applied.
Covers: REQ-1, REQ-2, REQ-3, REQ-4
Verify: test __tests__/ai-provider-fallback.test.ts

### AC-2 — no fallback means no change

Given only the primary provider configured, when it fails, then the same error
path as today runs, and nothing else is attempted.
Covers: REQ-6
Verify: test __tests__/ai-provider-fallback.test.ts

### AC-3 — clamps are provider-independent

Given a fallback response claiming `dropship` at 0.95 with an empty
`reasoningSignals`, when processed, then the clamp downgrades it exactly as it
does for the primary.
Covers: REQ-3
Verify: test __tests__/ai-provider-fallback.test.ts

### AC-4 — the choice is a measurement

Given credentials for each candidate, when `npm run eval:model` runs against
the real fixtures, then the log records, per candidate: verdict accuracy,
shown precision (must not fall below the current model's), mean latency and
cost per correct verdict.
Covers: REQ-5
Verify: eval npm run eval:model

## Open questions

- [NEEDS CLARIFICATION] Credentials for the live benchmark. This is setup,
  not a product decision. Add them in the environment's settings as
  environment variables, never pasted into chat:
  - `GOOGLE_AI_API_KEY`: the Google host is reachable from the sandbox
  - an OpenAI key, for GPT-6.1 Sol: `api.openai.com` reachability is unchecked
  - an Anthropic key, for Haiku 5.5: unchecked
- [NEEDS CLARIFICATION] Data residency. GPT-6.1 Sol lists US and EU
  residency. Whether Busted needs either is a legal call for the owner.

## Decisions

- **Fallback before switch.** It fixes the one measured failure (7/90), costs
  nothing when unused, and makes every later price decision reversible.
- **Upgrade 3.7 → 3.8 Flash is a separate, small change** inside this spec's
  benchmark: it keeps the same introductory price and the 3.7 retirement is
  dated. It needs the same `eval:model` before and after. It is not made blind.
- Rejected: GPT-6.1 Ultrafast or Fast tiers. 2–6× the price for latency the
  verdict path does not need (the scan is dominated by scraping).

## Metrics

- Share of scans that hit the fallback, and the verdict-failure rate (7/90
  today).
- Cost per correct verdict per candidate, from `eval:model`.
