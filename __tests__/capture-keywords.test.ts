/**
 * Unit tests for searchWithAiKeywordsFirst — the AI-keywords-first,
 * merge-across-all-arms search strategy shared by scripts/eval/capture-fixture.ts
 * and scripts/eval/refresh-fixture.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { searchWithAiKeywordsFirst } from "@/lib/eval/capture-keywords";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import { ScraperError } from "@/lib/scraping/types";

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

// The REAL error the AliExpress affiliate API's zero-result response
// produces (lib/aliexpress/api-client.ts).
function apiZeroResultError(): AliExpressSearchError {
  return new AliExpressSearchError("ALIEXPRESS_QUERY_FAILED", "The result is empty.", 422);
}

// The REAL error the scrape-fallback provider throws on zero matches
// (lib/aliexpress/search-scrape-fallback.ts:22-26) — deliberately DIFFERENT
// wording from the API's, which is exactly what broke the naive
// message-matching approach this file used to use.
function scrapeZeroResultError(keywords: string): AliExpressSearchError {
  return new AliExpressSearchError(
    "ALIEXPRESS_NO_RESULTS",
    `No AliExpress products found for "${keywords}".`,
    422,
  );
}

describe("searchWithAiKeywordsFirst", () => {
  it("merges results from BOTH AI keywords and the title arm, not just the first hit", async () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") return [candidate("A")];
      if (kw === "ai two") return [candidate("B")];
      if (kw === "title words") return [candidate("C")];
      return [];
    });
    const r = await searchWithAiKeywordsFirst("title words", ["ai one", "ai two"], searchFn);
    expect(r.candidates.map((c) => c.productId).sort()).toEqual(["A", "B", "C"]);
    expect(searchFn).toHaveBeenCalledTimes(3);
  });

  it("deduplicates by productId when the same candidate appears via multiple arms", async () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") return [candidate("A"), candidate("SHARED")];
      if (kw === "title words") return [candidate("SHARED"), candidate("C")];
      return [];
    });
    const r = await searchWithAiKeywordsFirst("title words", ["ai one"], searchFn);
    expect(r.candidates.map((c) => c.productId).sort()).toEqual(["A", "C", "SHARED"]);
  });

  it("falls through to the next arm on the API provider's real zero-result error, no warning recorded", async () => {
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") throw apiZeroResultError();
      if (kw === "ai two") return [candidate("B")];
      return [];
    });
    const r = await searchWithAiKeywordsFirst("thin title", ["ai one", "ai two"], searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["B"]);
    expect(r.keywords).toBe("ai two");
    expect(r.warnings).toEqual([]);
  });

  it("falls through to the next arm on the SCRAPE-FALLBACK provider's real zero-result error", async () => {
    // This is the exact regression a prior version of this file had: it only
    // recognized the API provider's error text, so this provider's genuinely
    // different wording ("No AliExpress products found...") aborted the
    // whole multi-arm search instead of continuing to the next keyword.
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") throw scrapeZeroResultError("ai one");
      if (kw === "ai two") return [candidate("B")];
      return [];
    });
    const r = await searchWithAiKeywordsFirst("thin title", ["ai one", "ai two"], searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["B"]);
  });

  it("never throws, and keeps candidates already found by an earlier arm, when a LATER arm hits an unrecognized error", async () => {
    // The core guarantee: an unexpected failure (network blip, ScraperError,
    // anything that isn't a recognized AliExpressSearchError zero-result)
    // must not discard progress already made by a prior successful arm.
    const searchFn = vi.fn(async (kw: string) => {
      if (kw === "ai one") return [candidate("A")];
      if (kw === "ai two") throw new TypeError("fetch failed");
      return [];
    });
    const r = await searchWithAiKeywordsFirst("thin title", ["ai one", "ai two"], searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["A"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("fetch failed");
  });

  it("records a warning (does not throw) for a ScraperError from the scrape-fallback provider", async () => {
    const searchFn = vi.fn(async () => {
      throw new ScraperError("SCRAPE_BLOCKED", "Blocked by upstream.");
    });
    const r = await searchWithAiKeywordsFirst("some title", ["a real ai keyword"], searchFn);
    expect(r.candidates).toEqual([]);
    expect(r.warnings[0]).toContain("Blocked by upstream");
  });

  it("records a warning for ALIEXPRESS_NOT_CONFIGURED instead of swallowing it silently", async () => {
    // Missing credentials is a setup problem, not a per-keyword result — it
    // must be visible to the caller (via warnings), unlike a normal
    // zero-result search, which produces no warning at all.
    const searchFn = vi.fn(async () => {
      throw new AliExpressSearchError(
        "ALIEXPRESS_NOT_CONFIGURED",
        "AliExpress Affiliate API credentials are not configured.",
        500,
      );
    });
    const r = await searchWithAiKeywordsFirst("some title", ["a real ai keyword"], searchFn);
    expect(r.candidates).toEqual([]);
    expect(r.warnings[0]).toContain("credentials are not configured");
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

  it("falls back to title-derived keywords when no AI keywords are given", async () => {
    const searchFn = vi.fn(async (kw: string) => (kw.includes("brand") ? [candidate("T")] : []));
    const r = await searchWithAiKeywordsFirst("A Real Brand Product Title", undefined, searchFn);
    expect(r.candidates.map((c) => c.productId)).toEqual(["T"]);
  });

  it("returns an empty pool with no warnings when every arm is a normal zero-result search", async () => {
    const searchFn = vi.fn(async () => {
      throw apiZeroResultError();
    });
    const r = await searchWithAiKeywordsFirst("bleesse", ["menstrual heating pad"], searchFn);
    expect(r.candidates).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.keywords.length).toBeGreaterThan(0);
  });
});
