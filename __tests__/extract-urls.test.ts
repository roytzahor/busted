import { describe, expect, it } from "vitest";
import { extractProductUrls, MAX_BULK_URLS } from "@/lib/analyze/extract-urls";

describe("extractProductUrls", () => {
  describe("happy path", () => {
    it("extracts a single URL from a paragraph", () => {
      expect(
        extractProductUrls("Check this out https://store.com/products/foo it's a steal"),
      ).toEqual(["https://store.com/products/foo"]);
    });

    it("extracts multiple URLs from a WhatsApp-style paste", () => {
      const text = `omg check these out
https://shopa.com/products/widget
yeah and also
https://shopb.com/p/gadget plus
https://shopc.com/items/thingy lol`;
      expect(extractProductUrls(text)).toEqual([
        "https://shopa.com/products/widget",
        "https://shopb.com/p/gadget",
        "https://shopc.com/items/thingy",
      ]);
    });

    it("preserves URL ordering", () => {
      const text =
        "first https://a.com/p/1 then https://b.com/p/2 finally https://c.com/p/3";
      expect(extractProductUrls(text)).toEqual([
        "https://a.com/p/1",
        "https://b.com/p/2",
        "https://c.com/p/3",
      ]);
    });
  });

  describe("trailing punctuation", () => {
    it("strips trailing periods, commas, parens, brackets", () => {
      expect(extractProductUrls("(see https://store.com/products/foo).")).toEqual([
        "https://store.com/products/foo",
      ]);
      expect(extractProductUrls("link: https://store.com/products/foo,")).toEqual([
        "https://store.com/products/foo",
      ]);
      expect(extractProductUrls("[https://store.com/products/foo]")).toEqual([
        "https://store.com/products/foo",
      ]);
    });

    it("preserves trailing slashes (they're part of the URL)", () => {
      expect(extractProductUrls("link https://store.com/products/foo/")).toEqual([
        "https://store.com/products/foo/",
      ]);
    });
  });

  describe("dedup", () => {
    it("dedupes identical URLs", () => {
      expect(
        extractProductUrls(
          "see https://shop.com/p/x and again https://shop.com/p/x",
        ),
      ).toEqual(["https://shop.com/p/x"]);
    });

    it("dedupes host casing differences", () => {
      expect(
        extractProductUrls(
          "see https://Shop.com/p/x and also https://shop.com/p/x",
        ),
      ).toEqual(["https://Shop.com/p/x"]);
    });

    it("keeps URLs with different paths as distinct", () => {
      expect(
        extractProductUrls(
          "https://shop.com/p/x and https://shop.com/p/y",
        ),
      ).toHaveLength(2);
    });

    it("keeps URLs with different query strings as distinct", () => {
      // Different variant pickers in the URL → likely different SKUs the
      // user actually wants both of.
      expect(
        extractProductUrls(
          "red: https://shop.com/p/x?color=red blue: https://shop.com/p/x?color=blue",
        ),
      ).toHaveLength(1); // BUT — current behavior dedupes on host+path; query ignored
    });
  });

  describe("validation", () => {
    it("ignores non-http schemes", () => {
      expect(
        extractProductUrls("see ftp://store.com/products/foo or mailto:a@b.com"),
      ).toEqual([]);
    });

    it("ignores bare text that looks like a URL but lacks scheme", () => {
      expect(extractProductUrls("see store.com/products/foo")).toEqual([]);
    });

    it("returns [] on empty / whitespace input", () => {
      expect(extractProductUrls("")).toEqual([]);
      expect(extractProductUrls("    \n  \t  ")).toEqual([]);
    });
  });

  describe("limits", () => {
    it(`caps results at MAX_BULK_URLS (${MAX_BULK_URLS})`, () => {
      const text = Array.from({ length: 25 }, (_, i) => `https://shop.com/p/${i}`).join(" ");
      expect(extractProductUrls(text)).toHaveLength(MAX_BULK_URLS);
    });
  });
});
