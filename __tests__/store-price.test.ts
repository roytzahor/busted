import { afterEach, describe, expect, it } from "vitest";
import { isStructuredPriceEnabled, resolveStorePriceUsd } from "@/lib/analyze/store-price";
import { parseCachedScrapeData } from "@/lib/types/cache";

describe("resolveStorePriceUsd — the shown/claimed store price", () => {
  // @spec 0003/AC-3
  it("prefers the page's structured price over the AI estimate and the regex", () => {
    // agas-tamar: structured ₪3,122 ring; the regex and the AI both said $30.
    expect(resolveStorePriceUsd({ structuredUsd: 843.76, aiEstimateUsd: 30, regexUsd: 30 }, true)).toBe(843.76);
  });

  // @spec 0003/AC-3
  it("uses the AI estimate without structured data, and never falls back to the regex", () => {
    expect(resolveStorePriceUsd({ structuredUsd: null, aiEstimateUsd: 44.55, regexUsd: 44.59 }, true)).toBe(44.55);
    // A homepage: the regex grabbed some product's price, the AI said none.
    expect(resolveStorePriceUsd({ structuredUsd: null, aiEstimateUsd: null, regexUsd: 53.78 }, true)).toBeNull();
    // Older cached rows simply have no structured input.
    expect(resolveStorePriceUsd({ aiEstimateUsd: 64.32, regexUsd: 64.32 }, true)).toBe(64.32);
  });

  // @spec 0003/AC-3
  it("restores the pre-0003 rule with the kill switch off", () => {
    expect(resolveStorePriceUsd({ structuredUsd: 843.76, aiEstimateUsd: 30, regexUsd: 30 }, false)).toBe(30);
    expect(resolveStorePriceUsd({ structuredUsd: null, aiEstimateUsd: 44.55, regexUsd: 44.59 }, false)).toBe(44.55);
    expect(resolveStorePriceUsd({ structuredUsd: null, aiEstimateUsd: null, regexUsd: 53.78 }, false)).toBe(53.78);
  });

  it("treats zero, negative and NaN as unknown", () => {
    expect(resolveStorePriceUsd({ structuredUsd: 0, aiEstimateUsd: -1, regexUsd: Number.NaN }, true)).toBeNull();
  });
});

describe("STRUCTURED_PRICE_ENABLED", () => {
  const original = process.env.STRUCTURED_PRICE_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.STRUCTURED_PRICE_ENABLED;
    else process.env.STRUCTURED_PRICE_ENABLED = original;
  });

  // @spec 0003/AC-3
  it("defaults on, turns off only on an explicit 'false', and is read at call time", () => {
    delete process.env.STRUCTURED_PRICE_ENABLED;
    expect(isStructuredPriceEnabled()).toBe(true);
    process.env.STRUCTURED_PRICE_ENABLED = "false";
    expect(isStructuredPriceEnabled()).toBe(false);
    expect(resolveStorePriceUsd({ structuredUsd: 843.76, aiEstimateUsd: 30, regexUsd: 30 })).toBe(30);
    process.env.STRUCTURED_PRICE_ENABLED = "true";
    expect(resolveStorePriceUsd({ structuredUsd: 843.76, aiEstimateUsd: 30, regexUsd: 30 })).toBe(843.76);
  });
});

describe("parseCachedScrapeData — structured price back-compat (ai/cache-backcompat)", () => {
  const base = {
    provider: "crawlbase",
    attributes: { title: "t", description: "d", mainImageUrl: null, sourceUrl: "https://x.example/p", provider: "crawlbase" },
    detectedStorePriceUsd: 30,
    storeName: "x",
    markdownLength: 1,
    markdownPreview: "",
  };

  // @spec 0003/AC-3
  it("parses a pre-0003 row with no structured fields, and a new row with them", () => {
    const old = parseCachedScrapeData(base)!;
    expect(old.detectedStorePriceUsd).toBe(30);
    expect(old.structuredStorePriceUsd).toBeUndefined();

    const fresh = parseCachedScrapeData({
      ...base,
      structuredStorePriceUsd: 843.76,
      structuredStorePriceNative: 3121.92,
      structuredStorePriceCurrency: "ILS",
      structuredStorePriceSource: "jsonld",
    })!;
    expect(fresh).toMatchObject({
      structuredStorePriceUsd: 843.76,
      structuredStorePriceNative: 3121.92,
      structuredStorePriceCurrency: "ILS",
      structuredStorePriceSource: "jsonld",
    });
  });

  it("drops malformed structured fields instead of trusting them", () => {
    const bad = parseCachedScrapeData({
      ...base,
      structuredStorePriceUsd: "843",
      structuredStorePriceCurrency: "JPY",
      structuredStorePriceSource: "guess",
    })!;
    expect(bad.structuredStorePriceUsd).toBeUndefined();
    expect(bad.structuredStorePriceCurrency).toBeUndefined();
    expect(bad.structuredStorePriceSource).toBeUndefined();
  });
});
