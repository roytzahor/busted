/**
 * Product title translation pre-pass.
 *
 * Detects non-Latin-script titles (Hebrew, Arabic, CJK, Korean, Japanese)
 * and translates them to English via a single cheap Gemini Flash call before
 * keyword extraction. Without this, extractSearchKeywords() strips non-ASCII
 * chars as junk and the AliExpress search arms get empty keyword strings.
 *
 * Scope: keyword extraction only. The original title is never replaced —
 * the AI verdict prompt receives the raw title for authenticity.
 *
 * Caching: in-memory Map keyed by title. Translations are deterministic so
 * there's no reason to re-call Gemini for the same title within a warm
 * function instance. For persistence across cold starts, callers should
 * round-trip translatedTitle through the scrape cache (lib/types/cache.ts).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Unicode ranges that flag a title as non-Latin. */
const NON_LATIN_RANGES: Array<[number, number]> = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0xfb1d, 0xfb4f], // Hebrew Presentation Forms
  [0x0600, 0x06ff], // Arabic Extended
  [0x3040, 0x30ff], // Hiragana + Katakana
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7af], // Korean Hangul Syllables
  [0x0400, 0x04ff], // Cyrillic
];

/**
 * Returns true when more than 30% of the title's characters fall in a
 * non-Latin Unicode block. The 30% threshold avoids false positives from
 * mixed titles like "CalmO - קלמו | מרגיע מיידי" (brand slug + Hebrew).
 */
export function isNonLatinTitle(title: string): boolean {
  if (!title || title.length === 0) return false;
  const chars = [...title]; // spread handles surrogate pairs correctly
  const nonLatinCount = chars.filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return NON_LATIN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
  }).length;
  return nonLatinCount / chars.length > 0.30;
}

/** In-memory translation cache. Keyed by original title, value is translation. */
const _translationCache = new Map<string, string>();

/**
 * Translate a product title to English.
 *
 * Returns the English translation, or null when:
 *   - The API key is not configured.
 *   - The Gemini call fails.
 *   - The response is empty or suspiciously long (>80 chars — hallucination guard).
 *
 * Callers should treat null as "use the original title" and continue without
 * throwing.
 */
export async function translateTitle(title: string): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Cache hit — don't re-call Gemini.
  const cached = _translationCache.get(trimmed);
  if (cached !== undefined) return cached;

  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    console.warn("[translate-title] GOOGLE_AI_API_KEY not set — skipping translation");
    return null;
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model:
        process.env.GOOGLE_AI_VISION_MODEL ??
        process.env.GOOGLE_AI_MODEL ??
        DEFAULT_MODEL,
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Translate the following product title to English for use in an e-commerce search query. " +
                "Return only the translated title — no explanation, no punctuation, no quotes. " +
                "If it is already in English, return it unchanged. " +
                "Keep it concise (10 words max).\n\n" +
                `Title: ${trimmed}`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 40,
        temperature: 0,
      },
    });

    const raw =
      response.response?.candidates?.[0]?.content?.parts
        ?.map((p) => ("text" in p ? (p as { text: string }).text : ""))
        .join("") ?? "";

    const translation = raw.trim().replace(/^["']|["']$/g, "").trim();

    // Sanity guard: reject empty or implausibly long translations.
    if (!translation || translation.length > 120) {
      return null;
    }

    _translationCache.set(trimmed, translation);
    return translation;
  } catch (err) {
    console.warn(
      "[translate-title] Gemini call failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Expose cache size for monitoring / debug. */
export function getTranslationCacheSize(): number {
  return _translationCache.size;
}
