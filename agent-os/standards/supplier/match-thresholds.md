# Match Thresholds Are Precision Gates, Not Tuning Knobs

A wrong supplier shown for a legit product is the most damaging failure mode in
the pipeline. These constants exist to prevent it.

| Constant | Value | File |
|---|---|---|
| `MATCH_CONFIDENCE_MIN` | `0.4` | `lib/aliexpress/match-confidence.ts` |
| `IMAGE_MATCH_MIN` | `0.5` | `lib/aliexpress/match-confidence.ts` |
| `VERIFIED_AUTOCOMMIT_MIN` | `0.85` | env |

**Never change any of them without `npm run eval` before and after, and report
the delta.** A threshold change with no eval number attached is not reviewable.

## Scoring weights

- **Text-only:** title overlap 55% · price ratio sanity 30% · seller trust 15%.
- **Folded with image AI:** image 55% · title 25% · price 12% · trust 8%.
- If image AI returns `sameFunction === false`, the score is hard-clamped to
  ≤ 0.35 regardless of text similarity. This is the "manual bottle cap opener
  vs cap launcher" guard. Do not soften it.

## Image AI never gates the basic flow

`compareProductImagesWithAI()` (`lib/ai/image-match.ts`) returns `null` on any
fetch or API failure and the search falls back to the text-only score.

- **Do not add `throw` paths inside the image-match module.**
- `IMAGE_MATCH_ENABLED=false` is the emergency kill switch. Leave the code path
  intact when disabled.

Image AI is skipped when the scrape has no `mainImageUrl`, or when the top text
score is already ≥ 0.85 (text is confident; skip the cost).

## Failing closed

Below `MATCH_CONFIDENCE_MIN`, `findAliExpressSupplier()` throws
`ALIEXPRESS_NO_CONFIDENT_MATCH`. The route converts this to a **soft skip** —
an empty supplier slot with an explanation, never an error and never a
best-guess match.

## Related

- `trust/affiliate-neutrality` — why link viability may affect ranking and
  commission never may
