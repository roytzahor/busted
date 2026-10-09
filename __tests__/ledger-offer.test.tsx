import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisResults } from "@/components/analysis-results";
import { VerdictSheet } from "@/components/verdict-sheet";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ProductComparisonResult } from "@/lib/mock-data";

function prediction(overrides: Partial<DropshipPrediction> = {}): DropshipPrediction {
  return {
    verdict: "dropship",
    isLikelyDropship: true,
    confidence: 0.86,
    productCategory: "home decor",
    reasoning: "Generic listing with supplier-identical photos and a 14-day ETA.",
    reasoningSignals: ["photos match a 2,431-order AliExpress listing", "ships from CN in 14 days"],
    missingSignals: [],
    redFlags: [],
    aliexpressKeywords: ["star projector"],
    styleTokens: [],
    materialPriors: [],
    // Deliberately different from the observed prices: the sheet must ignore
    // these whenever observed prices exist.
    estimatedStorePriceUsd: 99,
    estimatedSupplierPriceUsd: 5,
    estimatedMarkupPercent: 1880,
    ...overrides,
  };
}

function comparison(overrides: Partial<ProductComparisonResult> = {}): ProductComparisonResult {
  return {
    originalUrl: "https://store.example/products/lamp",
    scanId: "scan_1",
    cache: "MISS",
    presenceTier: "flame",
    dropshipPrediction: prediction(),
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
const sponsored = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>/g)].filter((m) => /rel="[^"]*\bsponsored\b/.test(m[0])).map((m) => m.index!);
const classTokens = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);

describe("Ledger offer — reading order is the trust argument", () => {
  // @spec 0004/AC-1
  it("puts the verdict and the evidence before the listing, and the one money link last", () => {
    const html = render(comparison());
    const verdict = html.indexOf('id="verdict-heading"');
    const evidence = html.indexOf("what we found");
    const listing = html.indexOf("Star Projector Night Light");
    const links = sponsored(html);
    expect(verdict).toBeGreaterThanOrEqual(0);
    expect(evidence).toBeGreaterThan(verdict);
    expect(listing).toBeGreaterThan(evidence);
    expect(links).toHaveLength(1);
    expect(links[0]).toBeGreaterThan(listing);
  });
});

describe("Ledger offer — no sticky CTA, no retired surfaces", () => {
  // @spec 0004/AC-2
  it("uses none of the anti-goal surfaces at flame or amber", () => {
    for (const tier of ["flame", "amber"] as const) {
      const tokens = classTokens(render(comparison({ presenceTier: tier })));
      const banned = tokens.filter(
        (t) =>
          t === "fixed" ||
          t === "sticky" ||
          t === "glass" ||
          t === "glass-md" ||
          t.startsWith("glow-") ||
          t === "shine-top" ||
          t.startsWith("backdrop-blur") ||
          t === "bg-clip-text" ||
          t === "blur-3xl" ||
          t.startsWith("bg-gradient-to-") ||
          t.startsWith("shadow-success"),
      );
      expect(banned, `${tier}: ${banned.join(", ")}`).toEqual([]);
    }
  });
});

describe("Ledger offer — observed prices draw the bar", () => {
  // @spec 0004/AC-3
  it("draws the multiplier and bar from the observed prices, plainly, ignoring the model's estimates", () => {
    const html = render(comparison());
    expect(html).toContain("×4.8");
    expect(html).not.toContain("≈×");
    expect(html).toContain("Supplier price is 21% of the retail price.");
    expect(html).not.toContain("×19.8"); // what the estimates (99 / 5) would have said
    expect(html).toMatch(/BUSTED(\s|<!-- -->)*×4\.8/);
  });
});

describe("Ledger offer — estimates are marked and never drawn", () => {
  // @spec 0004/AC-4
  it("marks an estimate-only figure with ≈, draws no bar, and stamps no figure", () => {
    const html = renderToStaticMarkup(
      <VerdictSheet
        prediction={prediction({ estimatedStorePriceUsd: 87, estimatedSupplierPriceUsd: 10 })}
        tier="flame"
        storeName="store.example"
      />,
    );
    expect(html).toContain("≈×8.7");
    expect(html).not.toContain('role="img"');
    expect(html).toMatch(/>BUSTED</);
  });

  // @spec 0004/AC-4
  it("draws no bar for a best-effort match — a different product's price is not a measurement", () => {
    const html = render(comparison({ bestEffortOnly: true }));
    expect(html).not.toContain('role="img"');
    expect(html).not.toMatch(/BUSTED(\s|<!-- -->)*×/);
  });
});

describe("Ledger offer — only a confirmed match gets paper", () => {
  const supplierCardOnPaper = (html: string) => {
    const title = html.indexOf("Star Projector Night Light");
    const paperOpen = html.lastIndexOf('data-slot="paper"', title);
    // The verdict sheet is paper too: the supplier card is on paper only if a
    // paper element opens after the verdict sheet's evidence and before the title.
    return paperOpen > html.indexOf("what we found");
  };

  // @spec 0004/AC-7
  it("puts a same-product match on paper", () => {
    expect(supplierCardOnPaper(render(comparison({ verified: true })))).toBe(true);
    expect(supplierCardOnPaper(render(comparison({ imageMatchScore: 0.8, imageMatchSameFunction: true })))).toBe(true);
  });

  // @spec 0004/AC-7
  it("keeps a likely or closest match off paper", () => {
    expect(supplierCardOnPaper(render(comparison()))).toBe(false);
    expect(supplierCardOnPaper(render(comparison({ bestEffortOnly: true })))).toBe(false);
  });
});
