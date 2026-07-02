/**
 * Unit tests for findCrossNetworkSupplier — the eBay/Amazon fallback that runs
 * when the AliExpress path can't produce a confident match.
 *
 * The multi-supplier router is mocked so these tests are fully deterministic
 * (no network, no credentials). They verify the *bridging + gating* logic:
 *   - a confident eBay candidate becomes a SupplierMatchResult with the native
 *     affiliate link and sourceNetwork="ebay"
 *   - sub-threshold-but-usable scores are surfaced as bestEffortOnly
 *   - garbage matches (below the noise floor, absurd price) are suppressed
 *   - AliExpress-only candidate pools are ignored (primary path owns those)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MatchConfidence } from "@/lib/aliexpress/match-confidence";
import type { SupplierCandidate } from "@/lib/supplier/types";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

vi.mock("@/lib/supplier/router", () => ({
  searchAndScoreSuppliers: vi.fn(),
}));

import { searchAndScoreSuppliers } from "@/lib/supplier/router";
import { findCrossNetworkSupplier } from "@/lib/supplier/fallback-match";

const mockedSearch = vi.mocked(searchAndScoreSuppliers);

function attrs(): ScrapedProductAttributes {
  return {
    title: "Reusable Pet Hair Remover Roller",
    description: "Self-cleaning reusable pet hair remover for couches and clothes.",
    mainImageUrl: "https://store.example/img/roller.jpg",
    sourceUrl: "https://store.example/products/pet-hair-remover",
    provider: "crawlbase",
  } as unknown as ScrapedProductAttributes;
}

function candidate(over: Partial<SupplierCandidate> = {}): SupplierCandidate {
  return {
    id: "v1|123",
    title: "Reusable Pet Hair Remover Roller Self-Cleaning",
    priceUsd: 4.2,
    imageUrl: "https://i.ebayimg.com/roller.jpg",
    affiliateLink: "https://www.ebay.com/itm/123?campid=5338",
    storeName: "toptools",
    sourceProvider: "ebay",
    trustScore: 0.8,
    ...over,
  };
}

function conf(over: Partial<MatchConfidence> = {}): MatchConfidence {
  return {
    score: 0.72,
    quality: "high",
    titleOverlap: 0.6,
    priceRatio: 0.14,
    priceVerdict: "plausible_markup",
    reasons: ["title overlap 0.60"],
    ...over,
  } as MatchConfidence;
}

function mockScored(
  entries: Array<{ candidate: SupplierCandidate; confidence: MatchConfidence }>,
): void {
  mockedSearch.mockResolvedValue({
    scored: entries,
    router: {
      candidates: entries.map((e) => e.candidate),
      perProvider: [],
      providersQueried: 2,
      totalMs: 120,
    },
  });
}

const input = () => ({
  attributes: attrs(),
  storePriceUsd: 29.99,
  productCategory: "Pet Hair Remover",
  aiKeywords: ["reusable pet hair remover roller"],
  identity: null,
});

beforeEach(() => {
  mockedSearch.mockReset();
});

describe("findCrossNetworkSupplier", () => {
  it("surfaces a confident eBay candidate with its native affiliate link", async () => {
    mockScored([{ candidate: candidate(), confidence: conf({ score: 0.72 }) }]);

    const result = await findCrossNetworkSupplier(input());

    expect(result).not.toBeNull();
    expect(result!.searchMeta.sourceNetwork).toBe("ebay");
    expect(result!.searchMeta.provider).toBe("ebay");
    expect(result!.searchMeta.affiliateProvider).toBe("ebay");
    expect(result!.aliexpressData.affiliateUrl).toBe(
      "https://www.ebay.com/itm/123?campid=5338",
    );
    expect(result!.matchConfidence).toBeCloseTo(0.72);
    expect(result!.bestEffortOnly).toBeUndefined();
  });

  it("flags a sub-threshold-but-usable score as bestEffortOnly", async () => {
    mockScored([{ candidate: candidate(), confidence: conf({ score: 0.3 }) }]);

    const result = await findCrossNetworkSupplier(input());

    expect(result).not.toBeNull();
    expect(result!.bestEffortOnly).toBe(true);
  });

  it("suppresses a match below the noise floor (returns null)", async () => {
    mockScored([{ candidate: candidate(), confidence: conf({ score: 0.15 }) }]);

    expect(await findCrossNetworkSupplier(input())).toBeNull();
  });

  it("suppresses an absurd-price match regardless of score", async () => {
    mockScored([
      { candidate: candidate(), confidence: conf({ score: 0.9, priceVerdict: "absurd" }) },
    ]);

    expect(await findCrossNetworkSupplier(input())).toBeNull();
  });

  it("ignores AliExpress-only pools (primary path owns those)", async () => {
    mockScored([
      {
        candidate: candidate({ sourceProvider: "aliexpress" }),
        confidence: conf({ score: 0.8 }),
      },
    ]);

    expect(await findCrossNetworkSupplier(input())).toBeNull();
  });

  it("returns null when no keywords can be derived", async () => {
    const bare = {
      ...input(),
      attributes: { ...attrs(), title: "", translatedTitle: undefined },
      aiKeywords: [],
      productCategory: undefined,
    };
    const result = await findCrossNetworkSupplier(bare);
    expect(result).toBeNull();
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
