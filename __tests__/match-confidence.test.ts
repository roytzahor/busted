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
    // kind of overlap (0.04-0.12) and must keep passing.
    const weakButReal = candidate({
      title: "1 Set Sunflower Necklace Gold Plated Gift Box For Girlfriend",
      priceUsd: 12.0,
    });
    const result = computeMatchConfidence(attrs(), STORE_PRICE_USD, weakButReal);
    expect(result.titleOverlap).toBeGreaterThan(0);
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
    const base = computeMatchConfidence(attrs(), STORE_PRICE_USD, candidate());
    const folded = foldImageMatchIntoConfidence(base, {
      score: 0.9,
      sameFunction: false,
      reasoning: "Bracelet, not earrings",
    });
    expect(folded.score).toBeLessThanOrEqual(0.35);
  });
});
