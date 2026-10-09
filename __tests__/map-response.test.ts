import { describe, expect, it } from "vitest";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import { mapAnalyzeResponseToComparison } from "@/lib/analyze/map-response";
import type { AnalyzeCacheHitResponse } from "@/lib/types/analyze";

function prediction(overrides: Partial<DropshipPrediction> = {}): DropshipPrediction {
  return {
    verdict: "dropship",
    isLikelyDropship: true,
    confidence: 0.86,
    productCategory: "home decor",
    reasoning: "Generic listing with AliExpress-identical photos.",
    reasoningSignals: ["identical supplier photos"],
    missingSignals: [],
    redFlags: [],
    aliexpressKeywords: ["star projector"],
    styleTokens: [],
    materialPriors: [],
    estimatedStorePriceUsd: null,
    estimatedSupplierPriceUsd: null,
    estimatedMarkupPercent: null,
    ...overrides,
  };
}

function response(overrides: Partial<AnalyzeCacheHitResponse> = {}): AnalyzeCacheHitResponse {
  return {
    status: "success",
    cache: "HIT",
    originalUrl: "https://store.example/products/lamp",
    scanId: "scan_1",
    aliexpressUrl: "https://www.aliexpress.com/item/100500.html",
    aliexpressData: {
      title: "Star Projector Night Light",
      priceUsd: 12.5,
      originalPriceUsd: 31.2,
      affiliateUrl: "https://s.click.aliexpress.com/e/abc",
    },
    supplierStatus: "complete",
    supplierMatchQuality: "high",
    supplierMatchConfidence: 0.82,
    sourceType: "retail_store",
    dropshipPrediction: prediction(),
    presenceTier: "flame",
    lastScrapedAt: "2026-10-09T00:00:00.000Z",
    storeProduct: {
      title: "Galaxy Projector Lamp",
      priceUsd: 59.99,
      imageUrl: null,
      storeName: "Store Example",
    },
    ...overrides,
  };
}

describe("mapAnalyzeResponseToComparison — the tier decides whether an offer exists", () => {
  // @spec 0002/AC-9
  it("routes a silent scan with a supplier match to the verdict-only view", () => {
    const mapped = mapAnalyzeResponseToComparison(
      response({ presenceTier: "silent", dropshipPrediction: prediction({ verdict: "legit", isLikelyDropship: false }) }),
    )!;
    expect(mapped.mode).toBe("dropship_only");
    expect(mapped.comparison).toBeNull();
    expect(mapped.dropshipAnalysis?.presenceTier).toBe("silent");
  });

  // @spec 0002/AC-9
  it("treats a response with no tier (older cache) as silent", () => {
    const mapped = mapAnalyzeResponseToComparison(response({ presenceTier: undefined }))!;
    expect(mapped.mode).toBe("dropship_only");
    expect(mapped.comparison).toBeNull();
  });

  // @spec 0002/AC-9
  it("builds a comparison at flame that carries the tier and invents nothing", () => {
    const mapped = mapAnalyzeResponseToComparison(
      response({
        storeProduct: { title: "Galaxy Projector Lamp", priceUsd: 0, imageUrl: null, storeName: "Store Example" },
        aliexpressUrl: null,
        aliexpressData: { title: "Star Projector Night Light", priceUsd: 12.5, originalPriceUsd: 31.2 },
      }),
    )!;
    expect(mapped.mode).toBe("full");
    const cmp = mapped.comparison!;
    expect(cmp.presenceTier).toBe("flame");
    // Unknown store price stays unknown: neither AliExpress's crossed-out
    // price (31.2) nor 4× the supplier price (50) stands in for it.
    expect(cmp.storeProduct.priceUsd).toBe(0);
    expect(cmp.savingsUsd).toBeNull();
    expect(cmp.savingsPercent).toBeNull();
    expect(cmp.supplierProduct.orderCount).toBeUndefined();
    expect(cmp.supplierProduct.sellerRating).toBeUndefined();
    expect(cmp.supplierProduct.shippingDays).toBeUndefined();
    expect(cmp.supplierProduct.affiliateUrl).toBeUndefined();
  });

  // @spec 0002/AC-9
  it("passes real supplier metrics and a real delta through untouched", () => {
    const mapped = mapAnalyzeResponseToComparison(
      response({
        aliexpressData: {
          title: "Star Projector Night Light",
          priceUsd: 12.5,
          orderCount: 2310,
          sellerRating: 4.6,
          shippingDays: 9,
          affiliateUrl: "https://s.click.aliexpress.com/e/abc",
        },
      }),
    )!;
    const cmp = mapped.comparison!;
    expect(cmp.savingsUsd).toBe(47.49);
    expect(cmp.savingsPercent).toBe(79);
    expect(cmp.supplierProduct).toMatchObject({ orderCount: 2310, sellerRating: 4.6, shippingDays: 9 });
  });
});
