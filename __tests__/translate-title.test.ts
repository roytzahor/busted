import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/generative-ai", async (importOriginal) => {
  // Keep the real FinishReason enum — translate-title compares against it, so
  // stubbing it out would make the truncation guard vacuously pass.
  const actual = await importOriginal<typeof import("@google/generative-ai")>();
  return {
    ...actual,
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { generateContent };
      }
    },
  };
});

import { isNonLatinTitle, translateTitle } from "@/lib/ai/translate-title";

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

/**
 * These cover the network path, which previously had no tests at all — which is
 * how a 100%-truncation bug shipped and sat there. gemini-2.5-flash draws
 * thinking tokens from maxOutputTokens, so the old budget of 40 left 1-2 tokens
 * for the answer and EVERY call came back finishReason=MAX_TOKENS.
 *
 * Each test uses a distinct title: the module memoises translations in a
 * process-lifetime Map, so a repeated title would be served from cache.
 */
describe("translateTitle", () => {
  function respond(text: string, finishReason: string) {
    generateContent.mockResolvedValueOnce({
      response: {
        candidates: [{ finishReason, content: { parts: [{ text }] } }],
      },
    });
  }

  beforeEach(() => {
    generateContent.mockReset();
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key-not-a-real-credential");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the translation on a clean STOP", async () => {
    respond("14k Gold Earrings", "STOP");
    expect(await translateTitle("14k עגילי זהב")).toBe("14k Gold Earrings");
  });

  it("discards a truncated translation rather than returning a fragment", async () => {
    // The exact real-world failure: "totwoo Smart jewelry - תכשיטים חכמים" came
    // back as "tot" — the first three characters — and passed every length
    // check, poisoning keyword extraction and the Jaccard title overlap.
    respond("tot", "MAX_TOKENS");
    expect(await translateTitle("totwoo Smart jewelry - תכשיטים חכמים")).toBeNull();
  });

  it("discards a truncated translation that looks like a plausible word", async () => {
    // "Encrypted" is well-formed English, so only finishReason can catch it.
    respond("Encrypted", "MAX_TOKENS");
    expect(
      await translateTitle("תכשיטים עם תמונה מוצפנת ומתנות מקוריות"),
    ).toBeNull();
  });

  it("asks for a budget far above the answer length, and no thinking tokens", async () => {
    respond("Royal Set", "STOP");
    await translateTitle("סט רויאל — בדיקת תקציב");

    const config = generateContent.mock.calls[0][0].generationConfig;
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // Guards the regression directly: 40 was the value that broke it.
    expect(config.maxOutputTokens).toBeGreaterThan(40);
  });

  it("returns null on an empty response", async () => {
    respond("   ", "STOP");
    expect(await translateTitle("כותרת ריקה לבדיקה")).toBeNull();
  });

  it("returns null when the model rambles instead of translating", async () => {
    respond("Sure! ".repeat(40), "STOP");
    expect(await translateTitle("כותרת ארוכה מדי לבדיקה")).toBeNull();
  });

  it("never throws when the API call fails — callers fall back to the raw title", async () => {
    generateContent.mockRejectedValueOnce(new Error("503 upstream unavailable"));
    expect(await translateTitle("כותרת שנכשלת בבדיקה")).toBeNull();
  });

  it("memoises a successful translation instead of re-billing for it", async () => {
    respond("Lion Family Puzzle", "STOP");
    const title = "פאזל משפחת האריות לבדיקת מטמון";
    expect(await translateTitle(title)).toBe("Lion Family Puzzle");
    expect(await translateTitle(title)).toBe("Lion Family Puzzle");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
