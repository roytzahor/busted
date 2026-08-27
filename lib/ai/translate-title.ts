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

import {
  FinishReason,
  GoogleGenerativeAI,
  type GenerationConfig,
} from "@google/generative-ai";


import { liteModel } from "./models";

/**
 * `thinkingConfig` postdates the pinned @google/generative-ai types but is
 * honoured by the v1beta endpoint (verified: a minimal thinkingBudget removes
 * `thoughtsTokenCount` from usageMetadata entirely). Declared as a precise
 * extension rather than cast through `any` so the rest of the config stays
 * type-checked.
 */
interface ThinkingGenerationConfig extends GenerationConfig {
  thinkingConfig?: { thinkingBudget: number };
}

/**
 * Generous cap, because it is a *ceiling* and not a reservation — we are billed
 * for the ~10 tokens a title translation actually emits.
 *
 * It used to be 40, which silently destroyed this feature: gemini-2.5-flash is a
 * thinking model and thinking tokens are drawn from this same budget, so ~35 of
 * the 40 went to reasoning and every single call came back truncated with
 * finishReason=MAX_TOKENS. "totwoo Smart jewelry - תכשיטים חכמים" translated to
 * "tot" — the first three characters — and "תכשיטים עם תמונה מוצפנת ומתנות
 * מקוריות" to "Encrypted". Both passed the old length guard and poisoned every
 * downstream consumer of translatedTitle.
 */
const MAX_OUTPUT_TOKENS = 256;

/**
 * Held in a typed const rather than inlined at the call site: the SDK parameter
 * is the narrower `GenerationConfig`, and an inline literal would trip the
 * excess-property check on `thinkingConfig`.
 */
const generationConfig: ThinkingGenerationConfig = {
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  temperature: 0,
  // A title translation needs no reasoning, and leaving thinking on makes the
  // token budget unpredictable — the exact condition that truncated every call
  // before. Omitting thinkingConfig entirely costs ~9x and returns NOTHING:
  // measured gemini-3.7-flash burn 96 thinking tokens and finish MAX_TOKENS
  // with an empty response.
  //
  // Budget is 1, not 0: gemini-*-flash-lite REJECTS thinkingBudget 0 with a
  // 400 INVALID_ARGUMENT, which silently failed 17/17 translations. A budget
  // of 1 is accepted by both flash and flash-lite and neither actually spends
  // a thinking token (measured think=0 on both), so this is 0 in practice
  // while staying compatible with the lite models.
  thinkingConfig: { thinkingBudget: 1 },
};

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
      model: liteModel(),
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
      generationConfig,
    });

    const candidate = response.response?.candidates?.[0];

    // Truncation guard. A cut-off translation is far worse than no translation:
    // callers fall back to the original title on null, but a plausible-looking
    // fragment ("tot", "Encrypted") silently corrupts keyword extraction and the
    // Jaccard title overlap that supplier matching is scored on. Length checks
    // cannot catch this — a 3-character answer looks perfectly well-formed — so
    // gate on the one signal that is exact.
    if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
      console.warn(
        `[translate-title] discarding truncated translation for "${trimmed}" (finishReason=MAX_TOKENS)`,
      );
      return null;
    }

    const raw =
      candidate?.content?.parts
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
