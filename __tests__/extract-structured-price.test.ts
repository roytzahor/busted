import { describe, expect, it } from "vitest";
import { convertToUsd } from "@/lib/currency";
import { extractStructuredPrice, parseStructuredAmount } from "@/lib/scraping/extract-structured-price";

const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("extractStructuredPrice — meta tags", () => {
  // @spec 0003/AC-1
  it("reads og:price in either attribute order", () => {
    const a = extractStructuredPrice(
      page('<meta property="og:price:amount" content="165.00"><meta property="og:price:currency" content="ILS">'),
    );
    expect(a).toEqual({ amount: 165, currency: "ILS", amountUsd: convertToUsd(165, "ILS"), source: "meta" });
    const b = extractStructuredPrice(
      page('<meta content="269.00" property="og:price:amount" /><meta content="ILS" property="og:price:currency" />'),
    );
    expect(b?.amount).toBe(269);
  });

  // @spec 0003/AC-1
  it("falls back to product:price, and prefers meta over JSON-LD", () => {
    expect(
      extractStructuredPrice(
        page('<meta property="product:price:amount" content="24.99"><meta property="product:price:currency" content="USD">'),
      ),
    ).toMatchObject({ amount: 24.99, currency: "USD", amountUsd: 24.99, source: "meta" });

    const both = extractStructuredPrice(
      page(
        '<meta property="og:price:amount" content="238"><meta property="og:price:currency" content="ILS">',
        ld({ "@type": "Product", name: "x", offers: { "@type": "Offer", price: "199", priceCurrency: "ILS" } }),
      ),
    );
    expect(both).toMatchObject({ amount: 238, source: "meta" });
  });

  // @spec 0003/AC-1
  it("reads a JSON-LD Product offer when there is no meta price", () => {
    const r = extractStructuredPrice(
      page("", ld({ "@context": "https://schema.org", "@type": "Product", name: "In Between Ring", offers: [{ "@type": "Offer", price: 3121.92, priceCurrency: "ILS" }] })),
    );
    expect(r).toMatchObject({ amount: 3121.92, currency: "ILS", source: "jsonld" });
  });

  // @spec 0003/AC-1
  it("returns null for an unknown currency, a zero, or a missing amount", () => {
    expect(extractStructuredPrice(page('<meta property="og:price:amount" content="49"><meta property="og:price:currency" content="JPY">'))).toBeNull();
    expect(extractStructuredPrice(page('<meta property="og:price:amount" content="0.00"><meta property="og:price:currency" content="USD">'))).toBeNull();
    expect(extractStructuredPrice(page('<meta property="og:price:currency" content="USD">'))).toBeNull();
    expect(extractStructuredPrice(page("<title>no price here</title>"))).toBeNull();
    expect(extractStructuredPrice(undefined)).toBeNull();
  });
});

describe("parseStructuredAmount", () => {
  // @spec 0003/AC-1
  it("handles the separators themes actually emit", () => {
    expect(parseStructuredAmount("165.00")).toBe(165);
    expect(parseStructuredAmount("1,299.00")).toBe(1299);
    expect(parseStructuredAmount("1.299,00")).toBe(1299);
    expect(parseStructuredAmount("165,00")).toBe(165);
    expect(parseStructuredAmount("3,122")).toBe(3122);
    // A single dot with three decimals is ambiguous (₪1,299 or 1.299) — refused,
    // symmetric with "3,122" which is unambiguous comma-thousands.
    expect(parseStructuredAmount("1.299")).toBeNull();
    expect(parseStructuredAmount("129.900")).toBeNull();
    expect(parseStructuredAmount("1.299.000")).toBeNull(); // dot-thousands → 1,299,000: over the cap
    expect(parseStructuredAmount("0.01")).toBeNull(); // placeholder, not a price
    expect(parseStructuredAmount("0.99")).toBeNull();
    expect(parseStructuredAmount(" 238 ")).toBe(238);
    expect(parseStructuredAmount("abc")).toBeNull();
    expect(parseStructuredAmount("-5")).toBeNull();
  });
});

describe("extractStructuredPrice — refuses ambiguity", () => {
  // @spec 0003/AC-1
  it("refuses JSON-LD with more than one Product node — a related item may come first", () => {
    const html = page(
      "",
      ld({ "@type": "Product", name: "Related: Mini Lamp", offers: { "@type": "Offer", price: "10", priceCurrency: "USD" } }) +
        ld({ "@type": "Product", name: "Galaxy Projector", offers: { "@type": "Offer", price: "59.99", priceCurrency: "USD" } }),
    );
    expect(extractStructuredPrice(html)).toBeNull();
  });

  // @spec 0003/AC-1
  it("refuses offers priced in two currencies", () => {
    const html = page(
      "",
      ld({
        "@type": "Product",
        name: "x",
        offers: [
          { "@type": "Offer", price: "238", priceCurrency: "ILS" },
          { "@type": "Offer", price: "64", priceCurrency: "USD" },
        ],
      }),
    );
    expect(extractStructuredPrice(html)).toBeNull();
  });
});

describe("extractStructuredPrice — never throws", () => {
  // @spec 0003/AC-2
  it("stays linear on 40k unclosed <meta tags", () => {
    const hostile = "<meta property=og:price:amount ".repeat(40_000);
    const t0 = performance.now();
    expect(extractStructuredPrice(hostile)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });

  // @spec 0003/AC-2
  it("survives malformed JSON-LD, absurd numbers, and a megabyte of junk", () => {
    expect(extractStructuredPrice(page('<script type="application/ld+json">{"@type":"Product", "offers": {</script>'))).toBeNull();
    expect(
      extractStructuredPrice(page('<meta property="og:price:amount" content="99999999999"><meta property="og:price:currency" content="USD">')),
    ).toBeNull();
    expect(extractStructuredPrice(page('<meta property="og:price:amount" content="NaN"><meta property="og:price:currency" content="USD">'))).toBeNull();
    const junk = "<meta ".repeat(50_000) + "<<<>>>" + "\u0000".repeat(500_000);
    expect(() => extractStructuredPrice(junk)).not.toThrow();
    expect(extractStructuredPrice(junk)).toBeNull();
  });
});
