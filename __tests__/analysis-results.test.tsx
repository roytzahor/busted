import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisResults } from "@/components/analysis-results";
import { BrowseAnalysisResults } from "@/components/browse-analysis-results";
import type { BrowseAnalysisResult } from "@/lib/analyze/map-response";
import { AFFILIATE_DISCLOSURE, AFFILIATE_DISCLOSURE_SHORT } from "@/lib/brand";
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
    savingsUsd: 47.49,
    savingsPercent: 79,
    matchQuality: "high",
    matchConfidence: 0.82,
    ...overrides,
  };
}

const render = (c: ProductComparisonResult) => renderToStaticMarkup(<AnalysisResults result={c} />);

/** Every <a> whose rel contains "sponsored", with its index in the markup. */
function sponsoredAnchors(html: string): { index: number; tag: string }[] {
  return [...html.matchAll(/<a\b[^>]*>/g)]
    .filter((m) => /rel="[^"]*\bsponsored\b[^"]*"/.test(m[0]))
    .map((m) => ({ index: m.index!, tag: m[0] }));
}

/**
 * Each sponsored link needs its OWN disclosure inside its OWN CTA container
 * (marked `data-affiliate-cta`): the container must open after the previous
 * sponsored link, and the disclosure must sit between the container's opening
 * and the link. A disclosure elsewhere on the page — or one container shared
 * by two links — does not count.
 */
function eachLinkHasPrecedingDisclosure(html: string): boolean {
  const anchors = sponsoredAnchors(html);
  let previousEnd = 0;
  for (const a of anchors) {
    const containerStart = html.lastIndexOf("data-affiliate-cta", a.index);
    if (containerStart < previousEnd) return false;
    const segment = html.slice(containerStart, a.index);
    if (!segment.includes(AFFILIATE_DISCLOSURE) && !segment.includes(AFFILIATE_DISCLOSURE_SHORT)) return false;
    previousEnd = a.index + a.tag.length;
  }
  return anchors.length > 0;
}

describe("AnalysisResults — silent shows no offer", () => {
  // @spec 0002/AC-1
  it("renders one muted line and nothing sold at silent", () => {
    const html = render(comparison({ presenceTier: "silent" }));
    expect(sponsoredAnchors(html)).toHaveLength(0);
    // The quiet line: the store's own title and price, nothing about the supplier.
    expect(html).toMatch(/^<p[^>]*>Galaxy Projector Lamp/);
    expect(html).toContain("59.99");
    expect(html).not.toContain("12.50");
    expect(html).not.toContain("47.49");
    expect(html).not.toMatch(/overcharging|markup|Save/i);
    expect(html).not.toContain("<article");
  });

  // @spec 0002/AC-1
  it("treats a missing tier as silent", () => {
    const html = render(comparison({ presenceTier: undefined }));
    expect(sponsoredAnchors(html)).toHaveLength(0);
    expect(html).not.toContain("12.50");
  });
});

describe("AnalysisResults — accusation wording follows the tier", () => {
  // @spec 0002/AC-5
  it("accuses at flame when the delta is real", () => {
    const html = render(comparison({ presenceTier: "flame" }));
    expect(html).toMatch(/overcharging/i);
    expect(html).toContain("47.49");
  });

  // @spec 0002/AC-5
  it("speaks of signals, not overcharging, at amber", () => {
    const html = render(comparison({ presenceTier: "amber" }));
    expect(html).toMatch(/dropship signals/i);
    expect(html).not.toMatch(/overcharging/i);
    // No "markup" in any form at amber — not the badge, not the CTA heading.
    expect(html).not.toMatch(/markup/i);
  });

  // @spec 0002/AC-5
  it("labels the percentage as how much cheaper, never as markup", () => {
    const html = render(comparison());
    expect(html).toMatch(/79(<!-- -->)?%/);
    expect(html).toMatch(/cheaper/i);
    // The figure is a saving (savings ÷ store price), not a markup
    // (savings ÷ supplier price): $59.99 vs $12.50 is 79% cheaper, a 380% markup.
    expect(html).not.toMatch(/%(\s|<[^>]*>)*markup/i);
  });

  it("makes no savings claim when the store price is unknown, even at flame", () => {
    const html = render(
      comparison({
        storeProduct: { ...comparison().storeProduct, priceUsd: 0 },
        savingsUsd: null,
        savingsPercent: null,
      }),
    );
    expect(html).not.toMatch(/overcharging|Save \$|cheaper/i);
    expect(html).toContain("12.50");
  });

  it("never prints invented trust metrics", () => {
    const html = render(comparison());
    expect(html).not.toMatch(/4\.8|1k\+|orders sold|day shipping/);
  });

  // @spec 0002/AC-4
  it("renders identity wording from the evidence, and never 'original'", () => {
    const cases: [ProductComparisonResult, string][] = [
      [comparison({ verified: true }), "Same product on AliExpress"],
      [comparison({ imageMatchScore: 0.8, imageMatchSameFunction: true }), "Same product on AliExpress"],
      [comparison(), "Likely match on AliExpress"],
      [comparison({ matchQuality: "low" }), "Likely match on AliExpress"],
      [comparison({ bestEffortOnly: true }), "Closest match on AliExpress"],
    ];
    for (const [c, label] of cases) {
      const html = render(c);
      expect(html).toContain(label);
      expect(html.toLowerCase()).not.toContain("original");
    }
  });
});

describe("AnalysisResults — disclosure and links", () => {
  // @spec 0002/AC-6
  it("puts a disclosure before every sponsored link, including the sticky mobile bar", () => {
    const html = render(comparison());
    const anchors = sponsoredAnchors(html);
    expect(anchors.length).toBe(2); // main CTA + sticky bar
    for (const a of anchors) expect(a.tag).toContain('rel="noopener noreferrer sponsored"');
    expect(eachLinkHasPrecedingDisclosure(html)).toBe(true);
  });

  // @spec 0002/AC-6
  it("puts a disclosure before every browse-card link", () => {
    const browse: BrowseAnalysisResult = {
      originalUrl: "https://store.example/collections/lamps",
      cache: "MISS",
      storeProduct: { title: "Lamps", priceUsd: 0, imageUrl: "x", storeName: "Store Example" },
      dropshipPrediction: {
        verdict: "collection_page",
        isLikelyDropship: false,
        confidence: 0.7,
        productCategory: "lighting",
        reasoning: "",
        reasoningSignals: [],
        missingSignals: [],
        redFlags: [],
        aliexpressKeywords: [],
        styleTokens: ["galaxy"],
        materialPriors: [],
        estimatedStorePriceUsd: null,
        estimatedSupplierPriceUsd: null,
        estimatedMarkupPercent: null,
      },
      productCategory: "lighting",
      styleTokens: ["galaxy"],
      materialPriors: [],
      query: "galaxy lamp",
      candidates: [1, 2].map((n) => ({
        productId: `p${n}`,
        title: `Lamp ${n}`,
        priceUsd: 10 + n,
        imageUrl: null,
        affiliateUrl: `https://s.click.aliexpress.com/e/${n}`,
        orderCount: 100,
        sellerRating: 4.5,
      })),
    };
    const html = renderToStaticMarkup(<BrowseAnalysisResults result={browse} />);
    expect(sponsoredAnchors(html)).toHaveLength(2);
    expect(eachLinkHasPrecedingDisclosure(html)).toBe(true);
  });

  // @spec 0002/AC-7
  it("withholds the link when the supplier is known not to be cheaper", () => {
    const html = render(
      comparison({ supplierProduct: { ...comparison().supplierProduct, priceUsd: 64 } }),
    );
    expect(sponsoredAnchors(html)).toHaveLength(0);
    expect(html).not.toMatch(/overcharging|cheaper on|Save \$/i);
  });

  // @spec 0002/AC-7
  it("renders no CTA and no '#' link when there is no destination", () => {
    const html = render(
      comparison({ supplierProduct: { ...comparison().supplierProduct, affiliateUrl: undefined } }),
    );
    expect(sponsoredAnchors(html)).toHaveLength(0);
    expect(html).not.toContain('href="#"');
    // The offer itself still renders — only the link is withheld.
    expect(html).toContain("12.50");
  });
});
