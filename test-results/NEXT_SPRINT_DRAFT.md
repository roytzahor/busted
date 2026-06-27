# Next Sprint Themes — Draft (pre-improver-finish)

This is a draft based on the xlsx ground truth + baseline gaps. Will be finalized after the Sonnet improver reports back. Some items may be marked DONE by then.

## Theme 1: AI Verdict Prompt is biased toward "legit" on Hebrew Shopify

**Evidence:** 5 of 13 real fixtures (38%) — all classic dropship per user — got AI verdict `dropship=false` at 88-95% confidence. Affected: imri-jewelry, smartjewelry, davincified, remora, giftorder.

**Root cause hypothesis:** The current prompt likely keys on visual polish ("looks like a real store"). Hebrew Shopify dropship sites are visually polished by Shopify defaults but have telltale markers: Facebook-ad UTM/fbclid params, generic AliExpress-style imagery, hugely-marked-up prices.

**Sprint items:**
- S1.1 Add Facebook-ads-source signal to AI input (parse `utm_source=facebook` + `fbclid` from the original URL string passed to verifier).
- S1.2 Add a "country of origin" signal — `.co.il` Shopify hosting + brand-history-search-failure pattern.
- S1.3 Re-tune the system prompt around 4 verdicts with explicit "Hebrew Shopify reseller" calibration examples in few-shot.
- S1.4 Re-capture the 5 false-negative fixtures after prompt change to measure delta.

## Theme 2: Homepage / Collection page disambiguation

**Evidence:** mxm02-homepage and bolsterbenefield got AI verdict `dropship=false 90%` but they are not product pages — current `deriveVerdict()` treats them as `legit`.

**Sprint items:**
- S2.1 URL-shape detection: `/`, `/collections/...`, `/shop/...`, `/category/...` patterns → short-circuit to `not_a_product`.
- S2.2 When pre-AI scrape shows no JSON-LD `Product` and no canonical `og:type=product`, force `not_a_product`.
- S2.3 UX: when `not_a_product` is returned, show user the message they wrote in the xlsx: "להכניס בהוראות השימוש: כדי לקבל תוצאה מדוייקת יותר- עליך להכניס קישור לדף מוצר ספציפי" — "for accurate results, paste a specific product page URL".

## Theme 3: Supplier false-positives on LEGIT brands (CRITICAL)

**Evidence:** shlomitofir (LEGIT physical TLV jewelry store), vivify (LEGIT home-made candles), yardishop (LEGIT handmade tobacco cases) — all returned an AliExpress supplier match. This is the worst failure mode per CLAUDE.md.

**Sprint items:**
- S3.1 Hard rule: when AI verdict is `legit` at ≥ 0.85 confidence, suppress supplier display entirely (the product is the brand's own work — showing a knockoff supplier is brand-damaging).
- S3.2 Add a "LEGIT brand disclaimer" panel to `analysis-results.tsx`: "this is a legitimate Israeli brand; AliExpress matches shown below are similar products only, not the source."
- S3.3 Bump `MATCH_CONFIDENCE_MIN` from 0.4 → 0.5 specifically when AI verdict is `legit` (avoid showing weak matches for legit pages).
- S3.4 New eval metric: supplier-precision-conditional-on-legit must be ≥ 95%.

## Theme 4: Gemini 2.0 Flash deprecated (production breakage as of 2026-06-27)

**Evidence:** Every fixture capture logged `[GoogleGenerativeAI Error]: models/gemini-2.0-flash is no longer available`. Caught only in the translation pre-pass (non-fatal there). Production pipeline likely affected — needs verification.

**Sprint items:**
- S4.1 Audit every `model:` parameter usage in `lib/ai/`. Replace deprecated model IDs.
- S4.2 Add a model-availability probe in `lib/dev-monitor/service-probes.ts` so this is detected proactively.
- S4.3 Centralize model selection in `lib/ai/client.ts` (env-driven) so model upgrades touch one file.

## Theme 5: Alibaba source handling

**Evidence:** Site 11 (calmo bath bombs) — user notes the source is on Alibaba with 500 MOQ, not AliExpress. Current pipeline only searches AliExpress.

**Sprint items:**
- S5.1 Add Alibaba secondary search when AliExpress finds no confident match.
- S5.2 Surface MOQ + per-unit price in supplier card — explain "this is wholesale, not direct shipping".
- S5.3 Affiliate program audit — does Admitad have Alibaba? If not, surface as informational only.

## Theme 6: Non-product image-gallery sites (bolsterbenefield case)

**Evidence:** Site 5 has only image galleries (no product detail pages). User wants the system to identify generic category and surface similar AliExpress items as inspiration, with a disclaimer.

**Sprint items:**
- S6.1 When `not_a_product` is returned, optionally run a "category guess" pass (image → category via Gemini Vision) and search AliExpress on the category.
- S6.2 Always include "similar items only — could not match this specific page" disclaimer when in this flow.

## Theme 7: Jewelry collection pages with mixed inventory (yuvall / smartjewelry / shlomitofir cases)

**Evidence:** Multiple sites are jewelry collection pages with many SKUs; user's xlsx asks "should we prompt the user for a specific product URL?" for sites 1, 6, 9.

**Sprint items:**
- S7.1 Detect "multi-product page" (>3 productlinks in scrape) and prompt user: "this page has multiple products — paste a specific product URL for a better answer".
- S7.2 Render top 3-5 detected sub-products as cards, each clickable to re-scan.

## Theme 8: Capture infra — Firecrawl credits + Playwright fallback

**Evidence:** 1 fixture (yuvall) failed entirely because Firecrawl ran out of credits and Playwright fallback was disabled.

**Sprint items:**
- S8.1 Enable Playwright fallback by default (it's in the repo but gated off).
- S8.2 Monitor Firecrawl credit balance via dev-monitor probe.
- S8.3 Add a third arm — direct fetch + cheerio for simple Shopify product JSON-LD before paying for Firecrawl.

## Theme 9: Eval expansion

**Sprint items:**
- S9.1 Add the 14 real-* fixtures to the seed-urls.json category-tagged.
- S9.2 Build a "regression alarm" in CI — fail PR if verdict accuracy or supplier accuracy drops below current baseline.
- S9.3 Add per-fixture truth.json review checklist (a markdown checklist generated from the new fixtures).
