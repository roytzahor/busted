import { describe, expect, it } from "vitest";
import { buildBrowseQuery } from "@/lib/aliexpress/browse-search";

describe("buildBrowseQuery", () => {
  describe("ordering — material → style → category", () => {
    it("places material first, style second, category last", () => {
      const q = buildBrowseQuery({
        productCategory: "necklace",
        styleTokens: ["minimalist", "dainty"],
        materialPriors: ["14k gold"],
      });
      expect(q).toBe("14k gold minimalist dainty necklace");
    });

    it("works with no material — style then category", () => {
      const q = buildBrowseQuery({
        productCategory: "necklace",
        styleTokens: ["minimalist"],
        materialPriors: [],
      });
      expect(q).toBe("minimalist necklace");
    });

    it("works with no style — material then category", () => {
      const q = buildBrowseQuery({
        productCategory: "kitchen gadget",
        styleTokens: [],
        materialPriors: ["stainless steel"],
      });
      expect(q).toBe("stainless steel kitchen gadget");
    });
  });

  describe("token capping", () => {
    it("keeps at most 2 style tokens", () => {
      const q = buildBrowseQuery({
        productCategory: "necklace",
        styleTokens: ["minimalist", "dainty", "layering", "boho"],
        materialPriors: [],
      });
      expect(q.split(" ")).toEqual(["minimalist", "dainty", "necklace"]);
    });

    it("keeps at most 1 material prior", () => {
      const q = buildBrowseQuery({
        productCategory: "necklace",
        styleTokens: [],
        materialPriors: ["14k gold", "sterling silver", "stainless steel"],
      });
      expect(q.split(" ")).toEqual(["14k", "gold", "necklace"]);
    });
  });

  describe("normalization & dedup", () => {
    it("lowercases tokens", () => {
      const q = buildBrowseQuery({
        productCategory: "Necklace",
        styleTokens: ["MINIMALIST"],
        materialPriors: ["14K Gold"],
      });
      expect(q).toBe("14k gold minimalist necklace");
    });

    it("strips punctuation/special chars but keeps hyphens and dots", () => {
      const q = buildBrowseQuery({
        productCategory: "stainless-steel water bottle",
        styleTokens: ["eco/friendly", "*minimalist"],
        materialPriors: [],
      });
      expect(q).toMatch(/^eco friendly minimalist stainless-steel water bottle$/);
    });

    it("dedupes overlapping tokens between buckets", () => {
      const q = buildBrowseQuery({
        productCategory: "gold necklace",
        styleTokens: ["dainty"],
        materialPriors: ["14k gold"],
      });
      // "gold" appears in both materialPriors and category — kept only once
      expect(q.split(" ").filter((t) => t === "gold")).toHaveLength(1);
      expect(q).toBe("14k gold dainty necklace");
    });

    it("collapses multiple spaces", () => {
      const q = buildBrowseQuery({
        productCategory: "  necklace   pendant  ",
        styleTokens: [],
        materialPriors: [],
      });
      expect(q).toBe("necklace pendant");
    });
  });

  describe("edge cases", () => {
    it("returns empty string when all inputs are empty", () => {
      expect(
        buildBrowseQuery({
          productCategory: "",
          styleTokens: [],
          materialPriors: [],
        }),
      ).toBe("");
    });

    it("returns empty string when only whitespace/punctuation is provided", () => {
      expect(
        buildBrowseQuery({
          productCategory: "   ",
          styleTokens: ["***", "!!!"],
          materialPriors: [""],
        }),
      ).toBe("");
    });

    it("preserves single-token category when everything else is empty", () => {
      expect(
        buildBrowseQuery({
          productCategory: "shoes",
          styleTokens: [],
          materialPriors: [],
        }),
      ).toBe("shoes");
    });
  });
});
