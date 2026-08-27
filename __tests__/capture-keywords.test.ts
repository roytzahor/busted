/**
 * Unit tests for searchWithAiKeywordsFirst — the AI-keywords-first,
 * merge-across-all-arms search strategy shared by scripts/eval/capture-fixture.ts
 * and scripts/eval/refresh-fixture.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { searchWithAiKeywordsFirst } from "@/lib/eval/capture-keywords";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

function candidate(productId: string, title = "candidate"): AliExpressProductCandidate {
  return {
    productId,
    title,
    priceUsd: 5,
    productUrl: `https://aliexpress.com/item/${productId}.html`,
    imageUrl: null,
    orderCount: 100,
    sellerRating: 4.5,
    shippingDays: null,
    promotionLink: null,
  };
}

describe("searchWithAiKeywordsFirst", () => {
  it("merges results from BOTH AI keywords and the title arm, not just the first hit", () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") return [candidate("A")];
      if (kw === "ai two") return [candidate("B")];
      if (kw === "title words") return [candidate("C")];
      return [];
    });
    return searchWithAiKeywordsFirst("title words", ["ai one", "ai two"], searchFn).then((r) => {
      expect(r.candidates.map((c) => c.productId).sort()).toEqual(["A", "B", "C"]);
      expect(searchFn).toHaveBeenCalledTimes(3);
    });
  });

  it("deduplicates by productId when the same candidate appears via multiple arms", () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") return [candidate("A"), candidate("SHARED")];
      if (kw === "title words") return [candidate("SHARED"), candidate("C")];
      return [];
    });
    return searchWithAiKeywordsFirst("title words", ["ai one"], searchFn).then((r) => {
      expect(r.candidates.map((c) => c.productId).sort()).toEqual(["A", "C", "SHARED"]);
    });
  });

  it("falls through to the next arm when one keyword throws (zero-result AliExpress error)", async () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") throw new Error("The result is empty");
      if (kw === "ai two") return [candidate("B")];
      return [];
    });
    const r = await searchWithAiKeywordsFirst("thin title", ["ai one", "ai two"], searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["B"]);
    expect(r.keywords).toBe("ai two");
  });

  it("uses only the first two AI keywords, matching production's slice(0, 2)", async () => {
    const searchFn = vi.fn(async (_kw: string) => [] as AliExpressProductCandidate[]);
    await searchWithAiKeywordsFirst("some title", ["kw1", "kw2", "kw3"], searchFn);
    const calledWith = searchFn.mock.calls.map((c) => c[0]);
    expect(calledWith).not.toContain("kw3");
  });

  it("skips AI keywords too short to be useful (<=3 chars)", async () => {
    const searchFn = vi.fn(async (kw: string) => (kw === "real title words" ? [candidate("T")] : []));
    const r = await searchWithAiKeywordsFirst("real title words", ["ab", ""], searchFn);
    expect(searchFn).not.toHaveBeenCalledWith("ab");
    expect(r.candidates.map((c) => c.productId)).toEqual(["T"]);
  });

  it("falls back to title-derived keywords when no AI keywords are given", async () => {
    const searchFn = vi.fn(async (kw: string) => (kw.includes("brand") ? [candidate("T")] : []));
    const r = await searchWithAiKeywordsFirst("A Real Brand Product Title", undefined, searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["T"]);
  });

  it("returns an empty pool (not a throw) when every arm fails or is empty", async () => {
    const searchFn = vi.fn(async () => {
      throw new Error("The result is empty");
    });
    const r = await searchWithAiKeywordsFirst("bleesse", ["menstrual heating pad"], searchFn);
    expect(r.candidates).toEqual([]);
    expect(r.keywords.length).toBeGreaterThan(0);
  });
});
