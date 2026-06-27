# Eval Capture Report

## Summary
- **Total Successful** (all 3 files): 12/14
- **Total Partial** (scrape + AI, no AliExpress): 4
- **Total Failed** (no scrape): 1
- **Wall-clock Time**: ~19 minutes (sequential, 14 captures)

## Failures & Partials

### Failed (No Scrape)
1. **real-yuvall-lucky-necklace** — crawlbase extraction failed, Firecrawl out of credits (402), Playwright fallback disabled

### Partial (Missing AliExpress)
1. **real-mxm02-homepage** — scrape ✓, AI ✓ (dropship=false, 90%), ali ✗ (empty search)
2. **real-bleesse-belly-massager** — scrape ✓, AI ✓ (dropship=true, 50%), ali ✗ (empty search)
3. **real-bolsterbenefield-leather** — scrape ✓, AI ✓ (dropship=false, 90%), ali ✗ (empty search)
4. **real-davincified-paint-numbers** — scrape ✓, AI ✓ (dropship=false, 90%), ali ✗ (empty search)

## Per-URL Details

| ID | Status | Scraper | AI Verdict | AI Conf | Ali Count |
|---|---|---|---|---|---|
| real-mxm02-homepage | partial | crawlbase | dropship=false | 90% | 0 |
| real-yardishop-handmade-cases | ✓ | crawlbase | dropship=false | 95% | 2 |
| real-bleesse-belly-massager | partial | crawlbase | dropship=true | 50% | 0 |
| real-imri-baby-necklace | ✓ | crawlbase | dropship=false | 90% | 34 |
| real-bolsterbenefield-leather | partial | crawlbase | dropship=false | 90% | 0 |
| real-yuvall-lucky-necklace | ✗ FAILED | — | — | — | — |
| real-vivify-royal-candle | ✓ | crawlbase | dropship=false | 92% | 37 |
| real-agas-tamar-in-between-ring | ✓ | crawlbase | dropship=false | 88% | 0 |
| real-shlomitofir-gold-earrings | ✓ | crawlbase | dropship=false | 95% | 37 |
| real-smartjewelry-charms | ✓ | crawlbase | dropship=false | 90% | 3 |
| real-calmo-bath-bombs | ✓ | crawlbase | dropship=true | 80% | 6 |
| real-davincified-paint-numbers | partial | crawlbase | dropship=false | 90% | 0 |
| real-remora-photo-jewelry | ✓ | crawlbase | dropship=false | 90% | 36 |
| real-giftorder-wood-family | ✓ | crawlbase | dropship=false | 95% | 37 |

## Notes
- **Gemini model issue**: All captures logged "[GoogleGenerativeAI Error]: models/gemini-2.0-flash is no longer available" during title translation (non-fatal, title still captured).
- **All scrapers used crawlbase** (Firecrawl/Playwright fallback only triggered on the one failure).
- **AliExpress search empty** on 4/14 URLs (homepages and broad collection pages without specific product anchor).
- **13/14 fixtures have scrape data**; 12/13 have complete (scrape + AI + AliExpress or scrape + AI only).

