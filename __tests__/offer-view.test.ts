import { describe, expect, it } from "vitest";
import { buildOfferView, claimableSavings, computeSavings } from "@/lib/analyze/offer-view";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ProductComparisonResult } from "@/lib/mock-data";

function comparison(overrides: Partial<ProductComparisonResult> = {}): ProductComparisonResult {
  return {
    originalUrl: "https://store.example/products/lamp",
    scanId: "scan_1",
    cache: "MISS",
    presenceTier: "flame",
    storeProduct: {
      title: "Galaxy Projector Lamp",
      priceUsd: 59.99,
      imageUrl: "https://store.example/lamp.jpg",
      storeName: "Store Example",
    },
    supplierProduct: {
      title: "Star Projector Night Light",
      priceUsd: 12.5,
      imageUrl: "https://ae.example/lamp.jpg",
      affiliateUrl: "https://s.click.aliexpress.com/e/abc",
    },
    savingsUsd: null,
    savingsPercent: null,
    matchQuality: "high",
    matchConfidence: 0.82,
    ...overrides,
  };
}

describe("computeSavings", () => {
  // @spec 0002/AC-3
  it("computes a positive delta and its share of the store price", () => {
    expect(computeSavings(59.99, 12.5, false)).toEqual({ savingsUsd: 47.49, savingsPercent: 79 });
  });

  // @spec 0002/AC-3
  it("is null — not zero — for equal prices, a pricier supplier, or a best-effort match", () => {
    expect(computeSavings(20, 20, false)).toEqual({ savingsUsd: null, savingsPercent: null });
    expect(computeSavings(20, 25, false)).toEqual({ savingsUsd: null, savingsPercent: null });
    expect(computeSavings(59.99, 12.5, true)).toEqual({ savingsUsd: null, savingsPercent: null });
  });

  // @spec 0002/AC-2
  it("is null when either price is unknown", () => {
    for (const store of [0, -1, null, undefined, Number.NaN]) {
      expect(computeSavings(store, 12.5, false)).toEqual({ savingsUsd: null, savingsPercent: null });
    }
    expect(computeSavings(59.99, 0, false)).toEqual({ savingsUsd: null, savingsPercent: null });
  });
});

describe("buildOfferView — refuses to invent", () => {
  // @spec 0002/AC-2
  it("omits trust metrics the supplier did not provide", () => {
    const v = buildOfferView(comparison());
    expect(v.trust).toEqual({});
    const withSome = buildOfferView(
      comparison({ supplierProduct: { ...comparison().supplierProduct, orderCount: 340, sellerRating: 0 } }),
    );
    // A zero rating is "unrated", not a rating.
    expect(withSome.trust).toEqual({ orderCount: 340 });
  });

  // @spec 0002/AC-2
  it("leaves an unknown store price unknown and derives no savings from anything else", () => {
    const v = buildOfferView(
      comparison({ storeProduct: { ...comparison().storeProduct, priceUsd: 0 } }),
    );
    expect(v.storePriceUsd).toBeNull();
    expect(v.savingsUsd).toBeNull();
    expect(v.savingsPercent).toBeNull();
    // Neither 4× the supplier price nor any other estimate leaks in.
    expect(JSON.stringify(v)).not.toContain(String(12.5 * 4));
  });

  // @spec 0002/AC-2
  it("recomputes savings from prices, ignoring stale savings fields on the input", () => {
    const v = buildOfferView(comparison({ savingsUsd: 999, savingsPercent: 99 }));
    expect(v.savingsUsd).toBe(47.49);
    expect(v.savingsPercent).toBe(79);
  });
});

describe("buildOfferView — identity wording follows the evidence", () => {
  // @spec 0002/AC-4
  it("says 'same' only for a Gold Path hit or a high match with positive image verification", () => {
    expect(buildOfferView(comparison({ verified: true, matchQuality: "medium" })).matchKind).toBe("same");
    expect(
      buildOfferView(comparison({ imageMatchScore: 0.8, imageMatchSameFunction: true })).matchKind,
    ).toBe("same");
  });

  // @spec 0002/AC-4
  it("says 'likely' for unconfirmed confident matches", () => {
    expect(buildOfferView(comparison()).matchKind).toBe("likely");
    // Image score high but function unconfirmed is not confirmation.
    expect(buildOfferView(comparison({ imageMatchScore: 0.9 })).matchKind).toBe("likely");
    expect(
      buildOfferView(comparison({ imageMatchScore: 0.9, imageMatchSameFunction: false })).matchKind,
    ).toBe("likely");
    expect(
      buildOfferView(comparison({ matchQuality: "medium", imageMatchScore: 0.9, imageMatchSameFunction: true })).matchKind,
    ).toBe("likely");
    expect(buildOfferView(comparison({ matchQuality: undefined })).matchKind).toBe("likely");
  });

  // @spec 0002/AC-4
  it("says 'closest' for best-effort, and never claims savings across different products", () => {
    const v = buildOfferView(comparison({ bestEffortOnly: true, verified: undefined }));
    expect(v.matchKind).toBe("closest");
    expect(v.savingsUsd).toBeNull();
  });

  // @spec 0002/AC-4
  it("labels every match kind without the word 'original'", () => {
    for (const c of [
      comparison({ verified: true }),
      comparison(),
      comparison({ bestEffortOnly: true }),
      comparison({ supplierNetwork: "ebay" }),
    ]) {
      const v = buildOfferView(c);
      expect(`${v.supplierLabel} ${v.ctaLabel}`.toLowerCase()).not.toContain("original");
    }
  });
});

describe("buildOfferView — gate, tier and CTA", () => {
  it("shows only at flame or amber; missing tier is silent", () => {
    expect(buildOfferView(comparison({ presenceTier: "flame" })).show).toBe(true);
    expect(buildOfferView(comparison({ presenceTier: "amber" })).show).toBe(true);
    expect(buildOfferView(comparison({ presenceTier: "silent" })).show).toBe(false);
    expect(buildOfferView(comparison({ presenceTier: undefined })).show).toBe(false);
  });

  it("has no CTA without a real destination", () => {
    const sp = comparison().supplierProduct;
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, affiliateUrl: undefined } })).ctaHref).toBeNull();
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, affiliateUrl: "#" } })).ctaHref).toBeNull();
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, affiliateUrl: "  " } })).ctaHref).toBeNull();
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, affiliateUrl: "javascript:alert(1)" } })).ctaHref).toBeNull();
    expect(buildOfferView(comparison()).ctaHref).toBe("https://s.click.aliexpress.com/e/abc");
  });

  it("has no CTA when the supplier is known not to be cheaper, but keeps it when the store price is unknown", () => {
    const sp = comparison().supplierProduct;
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, priceUsd: 59.99 } })).ctaHref).toBeNull();
    expect(buildOfferView(comparison({ supplierProduct: { ...sp, priceUsd: 80 } })).ctaHref).toBeNull();
    const unknownStore = buildOfferView(comparison({ storeProduct: { ...comparison().storeProduct, priceUsd: 0 } }));
    expect(unknownStore.ctaHref).toBe("https://s.click.aliexpress.com/e/abc");
    expect(unknownStore.ctaLabel).toBe("View on AliExpress");
  });

  it("names the marketplace the match came from", () => {
    expect(buildOfferView(comparison({ supplierNetwork: "ebay" })).networkLabel).toBe("eBay");
    expect(buildOfferView(comparison({ supplierNetwork: "amazon" })).networkLabel).toBe("Amazon");
    expect(buildOfferView(comparison()).networkLabel).toBe("AliExpress");
  });
});

describe("claimableSavings — what public surfaces may repeat", () => {
  const pred = (verdict: DropshipPrediction["verdict"], confidence: number): DropshipPrediction => ({
    verdict,
    isLikelyDropship: verdict === "dropship",
    confidence,
    productCategory: "x",
    reasoning: "",
    reasoningSignals: ["s"],
    missingSignals: [],
    redFlags: [],
    aliexpressKeywords: [],
    styleTokens: [],
    materialPriors: [],
    estimatedStorePriceUsd: null,
    estimatedSupplierPriceUsd: null,
    estimatedMarkupPercent: null,
  });

  // @spec 0002/AC-10
  it("never advertises a silent scan's cheaper listing", () => {
    expect(claimableSavings({ prediction: pred("legit", 0.95), storePriceUsd: 60, supplierPriceUsd: 12 })).toBeNull();
    expect(claimableSavings({ prediction: pred("dropship", 0.4), storePriceUsd: 60, supplierPriceUsd: 12 })).toBeNull();
    expect(claimableSavings({ prediction: null, storePriceUsd: 60, supplierPriceUsd: 12 })).toBeNull();
  });

  // @spec 0002/AC-10
  it("repeats only a real delta for a scan whose tier speaks", () => {
    expect(claimableSavings({ prediction: pred("dropship", 0.9), storePriceUsd: 60, supplierPriceUsd: 12 })).toEqual({
      savingsUsd: 48,
      savingsPercent: 80,
    });
    expect(claimableSavings({ prediction: pred("dropship", 0.9), storePriceUsd: 0, supplierPriceUsd: 12 })).toBeNull();
    expect(claimableSavings({ prediction: pred("dropship", 0.6), storePriceUsd: 10, supplierPriceUsd: 12 })).toBeNull();
  });
});
