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
    await searchWithAiKeywordsFirst(
      "some title",
      ["ai keyword one", "ai keyword two", "ai keyword three"],
      searchFn,
    );
    const calledWith = searchFn.mock.calls.map((c) => c[0]);
    expect(calledWith).not.toContain("ai keyword three");
  });

  it("skips AI keywords too short to be useful (<=3 chars)", async () => {
    const searchFn = vi.fn(async (kw: string) => (kw === "real title words" ? [candidate("T")] : []));
    const r = await searchWithAiKeywordsFirst("real title words", ["ab", ""], searchFn);
    expect(searchFn).not.toHaveBeenCalledWith("ab");
    expect(r.candidates.map((c) => c.productId)).toEqual(["T"]);
  });

  it("filters short keywords BEFORE slicing to two, matching find-supplier.ts's filter-then-slice order", async () => {
    // Two junk (<=3 char) entries precede two genuinely usable ones. A
    // slice-then-filter implementation would lock onto "ab"/"cd", skip both
    // as too short, and never try either real keyword. Filter-then-slice
    // (the fix) drops the junk first, then takes the first two survivors.
    const searchFn = vi.fn(async (kw: string) =>
      kw === "second real ai keyword" ? [candidate("T")] : [],
    );
    const r = await searchWithAiKeywordsFirst(
      "fallback title",
      ["ab", "cd", "first real ai keyword", "second real ai keyword"],
      searchFn,
    );
    expect(searchFn).not.toHaveBeenCalledWith("ab");
    expect(searchFn).not.toHaveBeenCalledWith("cd");
    expect(searchFn).toHaveBeenCalledWith("first real ai keyword");
    expect(searchFn).toHaveBeenCalledWith("second real ai keyword");
    expect(r.candidates.map((c) => c.productId)).toEqual(["T"]);
  });

  it("propagates a real failure instead of silently treating it as zero results", async () => {
    // Only the exact "result is empty" case should be swallowed and moved
    // past — any other error (auth, network, a genuinely different query
    // failure) must reach the caller's own try/catch, which distinguishes a
    // real capture failure from a legitimate empty search. Swallowing
    // everything would make an infrastructure failure indistinguishable
    // from "searched, found nothing" in the written fixture.
    const searchFn = vi.fn(async () => {
      throw new Error("AliExpress Affiliate API credentials are not configured.");
    });
    await expect(
      searchWithAiKeywordsFirst("some title", ["a real ai keyword"], searchFn),
    ).rejects.toThrow("credentials are not configured");
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
