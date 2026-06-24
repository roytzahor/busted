import { describe, expect, it } from "vitest";
import { isNonLatinTitle } from "@/lib/ai/translate-title";

describe("isNonLatinTitle", () => {
  describe("English / Latin titles → false", () => {
    it("rejects pure English", () => {
      expect(isNonLatinTitle("Premium LED Galaxy Projector")).toBe(false);
    });

    it("rejects English with numbers + symbols", () => {
      expect(isNonLatinTitle("iPhone 15 Pro Max — 256GB · Black")).toBe(false);
    });

    it("rejects empty / whitespace strings", () => {
      expect(isNonLatinTitle("")).toBe(false);
      expect(isNonLatinTitle("   ")).toBe(false);
    });
  });

  describe("Hebrew detection", () => {
    it("flags pure Hebrew titles", () => {
      expect(isNonLatinTitle("מקרן גלקסיה לחדר")).toBe(true);
    });

    it("flags Hebrew majority titles", () => {
      // Mostly Hebrew, with a tiny Latin sliver — should still trigger.
      expect(isNonLatinTitle("מקרן גלקסיה Pro")).toBe(true);
    });

    it("does NOT flag brand-slug + minor Hebrew suffix", () => {
      // Mixed but Latin-majority — the 30% threshold protects against
      // false positives on brand names like "CalmO - קלמו" where the
      // Hebrew suffix is decorative, not the product name.
      expect(isNonLatinTitle("CalmO - קלמו | Premium Sound Machine for Babies")).toBe(false);
    });
  });

  describe("Arabic detection", () => {
    it("flags pure Arabic titles", () => {
      expect(isNonLatinTitle("جهاز عرض المجرة")).toBe(true);
    });
  });

  describe("CJK detection", () => {
    it("flags Japanese (mixed Hiragana/Katakana/Kanji)", () => {
      expect(isNonLatinTitle("ギャラクシープロジェクター")).toBe(true);
    });

    it("flags simplified Chinese", () => {
      expect(isNonLatinTitle("银河投影仪")).toBe(true);
    });

    it("flags Korean Hangul", () => {
      expect(isNonLatinTitle("갤럭시 프로젝터")).toBe(true);
    });
  });

  describe("Cyrillic detection", () => {
    it("flags Russian", () => {
      expect(isNonLatinTitle("Галактический проектор")).toBe(true);
    });
  });

  describe("Threshold edge cases", () => {
    it("flags ~50% non-Latin titles", () => {
      // 6 Hebrew chars + 6 Latin chars = 50% → above threshold.
      expect(isNonLatinTitle("Galaxy גלקסיה")).toBe(true);
    });

    it("does NOT flag titles where non-Latin is just punctuation noise", () => {
      // No non-Latin chars at all — punctuation is Latin.
      expect(isNonLatinTitle("Hello — World · Premium")).toBe(false);
    });
  });
});
