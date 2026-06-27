# Candidate Fixtures for Busted Eval Harness

## Count by Category

| Category | Count |
|---|---|
| `dropship_obvious` | 6 |
| `dropship_subtle` | 2 |
| `legit_brand` | 4 |
| `not_a_product` | 1 |
| `aliexpress_itself` | 1 |
| **Total** | **14** |

## Top 5 Picks for First Capture

1. **candidate-akeo-silicone-ice-tray** (`dropship_obvious`) — Clean example: price, discount, and "3/4 weeks" shipping admission all on one page. Low scrape complexity.

2. **candidate-staghead-designs-ring** (`legit_brand`) — Strong false-positive guard: handmade wedding rings at $454, custom materials, 4,204 reviews. Very different signal profile from dropship.

3. **candidate-notebooktherapy-bullet-journal** (`dropship_subtle`) — High-value subtle case: polished brand with 1.6M IG followers but overseas fulfillment. Tests the AI's ability to look past surface branding.

4. **candidate-aliexpress-led-strip** (`aliexpress_itself`) — Verifies pipeline handles the source marketplace URL itself; expected `not_a_product` verdict with no supplier search.

5. **candidate-geekyget-fruit-knife** (`dropship_subtle`) — Polished novelty gift store with 90-day returns and clean UI that masks AliExpress sourcing. Good middle-difficulty dropship signal test.

## Sourcing Gaps

- **Israeli market dropship stores**: Zero Israeli-language dropshippers proposed (the existing 13 fixtures are all Israeli). The new set is intentionally global English-language to diversify the corpus.
- **Fashion/clothing dropship**: No apparel-focused dropshippers included. MVMT covers watches but a clothing niche like activewear or fast fashion would strengthen coverage.
- **High-confidence image match cases**: Most obvious dropship candidates are commodity gadgets/jewelry. A specific product with a very distinctive visual (e.g., a branded electronic device) would better stress-test image AI matching.
- **`not_a_product` variety**: Only one homepage example. A blog post URL or a /collections/ page would add breadth to this category.
