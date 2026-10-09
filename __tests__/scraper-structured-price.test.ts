import { afterEach, describe, expect, it, vi } from "vitest";

// The scraper service with the network stubbed: a page whose regex price is
// the refund-policy fee and whose meta tags carry the real price.
vi.mock("@/lib/scraping/router", () => ({
  scrapeProductUrl: async () => ({
    raw: {
      provider: "crawlbase",
      markdown: "Cancellation fee $30. In Between Ring",
      metadata: { sourceUrl: "https://store.example/p" },
      html: '<meta property="og:price:amount" content="3122"><meta property="og:price:currency" content="ILS">',
    },
    attributes: {
      title: "In Between Ring",
      description: "d",
      mainImageUrl: null,
      sourceUrl: "https://store.example/p",
      provider: "crawlbase",
    },
  }),
}));

describe("scraper service — structured price beside the regex price", () => {
  const original = process.env.STRUCTURED_PRICE_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.STRUCTURED_PRICE_ENABLED;
    else process.env.STRUCTURED_PRICE_ENABLED = original;
  });

  // @spec 0003/AC-3
  it("records the structured price and leaves the regex price (the verdict and matcher input) untouched", async () => {
    delete process.env.STRUCTURED_PRICE_ENABLED;
    const { scrape } = await import("@/lib/services/scraper");
    const res = await scrape({ url: "https://store.example/p" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.detectedStorePriceUsd).toBe(30);
    expect(res.value.structuredStorePrice).toMatchObject({ amount: 3122, currency: "ILS", source: "meta" });
  });

  // @spec 0003/AC-3
  it("skips extraction entirely with the kill switch off", async () => {
    process.env.STRUCTURED_PRICE_ENABLED = "false";
    const { scrape } = await import("@/lib/services/scraper");
    const res = await scrape({ url: "https://store.example/p" });
    expect(res.ok && res.value.structuredStorePrice).toBeNull();
    expect(res.ok && res.value.detectedStorePriceUsd).toBe(30);
  });
});
