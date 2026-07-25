import { describe, expect, it } from "vitest";
import {
  AMBER_MIN_CONFIDENCE,
  FLAME_MIN_CONFIDENCE,
  computePresenceTier,
} from "@/lib/analyze/presence-tier";
import {
  SPARSE_EVIDENCE_CONFIDENCE_CEILING,
  type DropshipPrediction,
} from "@/lib/ai/dropship-verifier";

function prediction(
  overrides: Partial<DropshipPrediction> = {},
): DropshipPrediction {
  return {
    verdict: "dropship",
    isLikelyDropship: true,
    confidence: 0.9,
    productCategory: "massager",
    reasoning: "test",
    reasoningSignals: ["generic supplier imagery"],
    missingSignals: [],
    redFlags: [],
    aliexpressKeywords: [],
    styleTokens: [],
    materialPriors: [],
    estimatedStorePriceUsd: null,
    estimatedSupplierPriceUsd: null,
    estimatedMarkupPercent: null,
    ...overrides,
  };
}

describe("presence tier / clamp threshold invariant", () => {
  // Regression guard: both values were 0.5. Because the sparse-evidence clamp
  // is `<=` and the amber floor is `>=`, a page too sparse to judge landed
  // exactly on the threshold that makes the badge speak. Real case:
  // real-bleesse-belly-massager (title "Bleesse", 27-char description, no
  // price → 2 attribute signals) was clamped to 0.5 and rendered amber.
  it("sparse-evidence ceiling stays strictly below the amber floor", () => {
    expect(SPARSE_EVIDENCE_CONFIDENCE_CEILING).toBeLessThan(
      AMBER_MIN_CONFIDENCE,
    );
  });

  it("a dropship verdict clamped for sparse evidence stays silent", () => {
    const tier = computePresenceTier(
      prediction({ confidence: SPARSE_EVIDENCE_CONFIDENCE_CEILING }),
    );
    expect(tier).toBe("silent");
  });
});

describe("computePresenceTier", () => {
  it("returns silent without a prediction", () => {
    expect(computePresenceTier(null)).toBe("silent");
    expect(computePresenceTier(undefined)).toBe("silent");
  });

  it("only a dropship verdict can ever speak", () => {
    for (const verdict of [
      "legit",
      "insufficient_evidence",
      "not_a_product",
      "collection_page",
    ] as const) {
      expect(
        computePresenceTier(prediction({ verdict, confidence: 0.99 })),
      ).toBe("silent");
    }
  });

  it("maps dropship confidence to flame / amber / silent at the boundaries", () => {
    expect(computePresenceTier(prediction({ confidence: FLAME_MIN_CONFIDENCE })))
      .toBe("flame");
    expect(computePresenceTier(prediction({ confidence: AMBER_MIN_CONFIDENCE })))
      .toBe("amber");
    expect(
      computePresenceTier(prediction({ confidence: AMBER_MIN_CONFIDENCE - 0.01 })),
    ).toBe("silent");
  });
});
