/**
 * Unit tests for computeMatchConfidence and the two fold functions that
 * recompute a score from it.
 *
 * The load-bearing case: a candidate whose title shares ZERO tokens with the
 * source must never clear MATCH_CONFIDENCE_MIN (0.4), no matter which signal
 * (price+trust, an image AI call, or a variant/SKU match) is doing the
 * rescuing. This was a live false positive — a 14k gold earrings PDP matched
 * to an AliExpress sterling silver tennis bracelet at 0.45 — and the first
 * fix (a clamp inside computeMatchConfidence only) still left both fold
 * functions able to rebuild an unclamped score from base.titleOverlap.
 */

import { describe, it, expect } from "vitest";
import {
  computeMatchConfidence,
  foldImageMatchIntoConfidence,
  foldVariantIntoConfidence,
  MATCH_CONFIDENCE_MIN,
  BEST_EFFORT_FLOOR,
} from "@/lib/aliexpress/match-confidence";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

function attrs(overrides: Partial<ScrapedProductAttributes> = {}): ScrapedProductAttributes {
  return {
    title: "14k Gold Earrings",
    description: "Fine jewelry collection, real 14k gold.",
    mainImageUrl: "https://example.com/earrings.jpg",
    sourceUrl: "https://shlomitofir.co.il/collections/14k-gold-earrings",
    provider: "firecrawl",
    ...overrides,
  };
}

function candidate(overrides: Partial<AliExpressProductCandidate> = {}): AliExpressProductCandidate {
  return {
    productId: "1005009022181408",
    title: "100% S925 Sterling Silver 2-6mm Real Moissanite Tennis Bracelet",
    priceUsd: 19.32,
    productUrl: "https://aliexpress.com/item/1005009022181408.html",
    imageUrl: "https://example.com/bracelet.jpg",
    orderCount: 3029,
    sellerRating: 4.8,
    shippingDays: null,
    promotionLink: null,
    ...overrides,
  };
}

// Store price chosen so priceRatio (155.41/19.32 ≈ 8x) lands in the 3-15x
// "plausible markup" sweet spot — the price arm scoring as favorably as
// possible, so a passing score can ONLY be explained by title/identity.
const STORE_PRICE_USD = 155.41;

// Source title tokenizes to exactly {14k, gold, earrings} — every one of
// those appears here too, guaranteeing nonzero overlap so tests using this
// can isolate a DIFFERENT clamp (sameFunction, absurd price) from the
// zero-overlap identity clamp under test elsewhere in this file.
function overlappingCandidate(
  overrides: Partial<AliExpressProductCandidate> = {},
): AliExpressProductCandidate {
  return candidate({
    title: "14k Gold Earrings Hoop Style For Women",
    ...overrides,
  });
}

describe("computeMatchConfidence — zero title overlap", () => {
  it("clamps a zero-overlap candidate below MATCH_CONFIDENCE_MIN even with a plausible price and high seller trust", () => {
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, candidate());
    expect(result.titleOverlap).toBe(0);
    expect(result.score).toBeLessThan(MATCH_CONFIDENCE_MIN);
    expect(result.quality).not.toBe("medium");
    expect(result.quality).not.toBe("high");
  });

  it("clamps a completely unrelated product category the same way (not fixture-specific)", () => {
    const pressureWasher = candidate({
      title: "High Pressure Washer Gun & Foam Cannon Kit - 1/4 Quick Connect",
      priceUsd: 36.93,
    });
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, pressureWasher);
    expect(result.titleOverlap).toBe(0);
    expect(result.score).toBeLessThan(MATCH_CONFIDENCE_MIN);
  });

  it("does NOT clamp a real, low-but-nonzero overlap — only exact zero is touched", () => {
    // "gold" is the only shared token; a real corpus fixture sits at this
    // kind of overlap (0.04-0.12) and must keep passing. Asserting on score
    // and quality, not just titleOverlap>0: a regression that widened the
    // clamp condition from `=== 0` to e.g. `< 0.15` would still leave
    // titleOverlap positive here while wrongly suppressing the score — this
    // must fail if that happens.
    const weakButReal = candidate({
      title: "1 Set Sunflower Necklace Gold Plated Gift Box For Girlfriend",
      priceUsd: 12.0,
    });
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, weakButReal);
    expect(result.titleOverlap).toBeGreaterThan(0);
    expect(result.titleOverlap).toBeLessThan(0.15);
    expect(result.score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_MIN);
    expect(result.quality).not.toBe("none");
  });

  it("rejects a candidate whose price is a parse error, even with strong title overlap", () => {
    // Isolates the OTHER arm of applyIdentityClamps: priceVerdict==="absurd"
    // must clamp regardless of title overlap, exactly as it must regardless
    // of price when titleOverlap===0. Neither arm may depend on the other.
    const absurdPrice = overlappingCandidate({ priceUsd: 999_999 });
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, absurdPrice);
    expect(result.titleOverlap).toBeGreaterThan(0.3);
    expect(result.priceVerdict).toBe("absurd");
    expect(result.score).toBeLessThan(MATCH_CONFIDENCE_MIN);
  });

  it("keeps the identity clamp below BEST_EFFORT_FLOOR, not just MATCH_CONFIDENCE_MIN", () => {
    // find-supplier.ts hard-rejects below BEST_EFFORT_FLOOR (0.2) and only
    // downgrades to bestEffortOnly between FLOOR and MATCH_CONFIDENCE_MIN
    // (0.4). The identity clamp must clear the HARDER bar — if it only beat
    // MATCH_CONFIDENCE_MIN, a zero-overlap candidate would still surface as
    // a "closest match" instead of being suppressed outright.
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, candidate());
    expect(result.titleOverlap).toBe(0);
    expect(result.score).toBeLessThan(BEST_EFFORT_FLOOR);
  });
});

describe("foldVariantIntoConfidence — zero title overlap must survive the fold", () => {
  it("does not let a matched SKU + plausible price rescue a zero-overlap candidate", () => {
    const base = computeMatchConfidence(attrs(), STORE_PRICE_USD, candidate());
    expect(base.titleOverlap).toBe(0);

    const folded = foldVariantIntoConfidence(base, {
      score: 1,
      hardMismatch: false,
      reasons: ["Matched size: one-size"],
    });

    // Unpatched formula: titleScore(0)*0.5 + priceScore(1)*0.25 + variant(1)*0.25 = 0.5
    expect(folded.score).toBeLessThan(MATCH_CONFIDENCE_MIN);
  });
});

describe("foldImageMatchIntoConfidence — zero title overlap must survive the fold", () => {
  it("does not let a bare-minimum-passing image score rescue a zero-overlap candidate", () => {
    const base = computeMatchConfidence(attrs(), STORE_PRICE_USD, candidate());
    expect(base.titleOverlap).toBe(0);

    const folded = foldImageMatchIntoConfidence(base, {
      // IMAGE_MATCH_MIN is 0.5 — the minimum score find-supplier.ts admits at
      // all. sameFunction=true, so the sameFunction=false clamp doesn't fire.
      score: 0.5,
      sameFunction: true,
      reasoning: "Both appear to be jewelry items",
    });

    // Unpatched formula: image(0.5)*0.55 + title(0)*0.25 + price(1)*0.12 + trust(0.5)*0.08 = 0.435
    expect(folded.score).toBeLessThan(MATCH_CONFIDENCE_MIN);
  });

  it("still clamps hard when image AI flags a different function, independent of the title clamp", () => {
    // Uses overlappingCandidate (nonzero titleOverlap) so the identity clamp
    // is NOT what drives this down — a prior version of this test used the
    // zero-overlap `candidate()`, which meant deleting the sameFunction
    // clamp entirely would still pass (0.1 from the identity clamp alone).
    const base = computeMatchConfidence(attrs(), STORE_PRICE_USD, overlappingCandidate());
    expect(base.titleOverlap).toBeGreaterThan(0.3);
    const folded = foldImageMatchIntoConfidence(base, {
      score: 0.9,
      sameFunction: false,
      reasoning: "Bracelet, not earrings",
    });
    expect(folded.score).toBeLessThanOrEqual(0.35);
  });
});

describe("computeMatchConfidence — plural/singular stemming", () => {
  it("credits overlap between a plural candidate token and a singular source token", () => {
    // Mirrors the real regression: real-smartjewelry-charms's correct
    // TOTWOO candidate title uses "Bracelets"/"Couples" (plural); the
    // scraped source uses "bracelet"/"couple" (singular). Before stemming,
    // Jaccard overlap treated these as four unrelated tokens.
    const source = attrs({ title: "Smart touch bracelet for couple" });
    const pluralCandidate = candidate({
      title: "Long Distance Touch Bracelets for Couples Smart Light",
      priceUsd: 130,
    });
    const result = computeMatchConfidence(source, 145.68, pluralCandidate);
    expect(result.titleOverlap).toBeGreaterThan(0.3);
  });

  it("does not let a stemmed generic word (kit/kits) count toward overlap — STOP_WORDS still applies after stemming", () => {
    // "Kits" stems to "kit", which is an existing intentional STOP_WORDS
    // exclusion (too generic to signal a real product match, same as
    // "set"/"pcs"/"pack"). Stemming must not create a new loophole where the
    // plural form of a banned word slips through.
    const withoutShared = computeMatchConfidence(
      attrs({ title: "Paint by numbers kit for adults" }),
      50,
      candidate({ title: "Landscape painting canvas beginner", priceUsd: 10 }),
    );
    const withSharedKits = computeMatchConfidence(
      attrs({ title: "Paint by numbers kit for adults" }),
      50,
      candidate({ title: "Landscape painting canvas kits beginner", priceUsd: 10 }),
    );
    // Adding the shared "kits"/"kit" pair must not raise overlap — it's
    // filtered on both sides, same as if neither title mentioned it.
    expect(withSharedKits.titleOverlap).toBe(withoutShared.titleOverlap);
  });

  it("does not stem a word that legitimately ends in double-s (e.g. glass, dress)", () => {
    const result = computeMatchConfidence(
      attrs({ title: "Stained glass sun catcher ornament" }),
      20,
      candidate({ title: "Colorful glass hanging sun ornament", priceUsd: 5 }),
    );
    // "glass" must match "glass" exactly, not get corrupted to "glas".
    expect(result.titleOverlap).toBeGreaterThan(0);
  });

  it("real corpus regression: real-smartjewelry-charms's actual TOTWOO candidate now clears MATCH_CONFIDENCE_MIN", () => {
    // Uses the exact real title/candidate from the fixture that motivated
    // this fix, not a paraphrase — pinning the specific number so a future
    // change to the tokenizer or weights that regresses this is caught here,
    // not just in the eval corpus.
    const source = attrs({
      title: "totwoo Smart jewelry - תכשיטים חכמים",
      translatedTitle: "totwoo Smart Jewelry",
      sourceUrl: "https://smartjewelry.co.il",
    });
    const totwooCandidate = candidate({
      title:
        "TOTWOO Long Distance Touch Bracelets for Couples, Smart Light & Vibration Love Charms Jewelry Valentines Day Gifts For Women Men",
      priceUsd: 136.37,
      orderCount: 12,
      sellerRating: 4.6,
    });
    const matchTerms = "smart touch bracelet couple long distance couple jewelry vibration couple bracelet";
    const result = computeMatchConfidence(source, 145.68, totwooCandidate, matchTerms);
    expect(result.score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_MIN);
  });
});
