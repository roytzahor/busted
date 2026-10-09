import { describe, expect, it, vi } from "vitest";

// Make the JSON-LD stage throw, so the extractor's own guard is what is under
// test — a bug in any parser it calls must not escape into the scan.
vi.mock("@/lib/scraping/extract-jsonld", () => ({
  extractJsonLd: () => {
    throw new Error("parser blew up");
  },
}));

describe("extractStructuredPrice — the guard", () => {
  // @spec 0003/AC-2
  it("returns null when a stage it calls throws", async () => {
    const { extractStructuredPrice } = await import("@/lib/scraping/extract-structured-price");
    expect(() => extractStructuredPrice("<html><body>no meta, so JSON-LD runs</body></html>")).not.toThrow();
    expect(extractStructuredPrice("<html><body>no meta, so JSON-LD runs</body></html>")).toBeNull();
  });
});
