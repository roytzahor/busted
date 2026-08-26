/**
 * preprocessForSmartMatch — Gemini Vision multimodal preprocessor.
 *
 * Takes a raw consumer-facing product image URL and a category hint,
 * returns a cleaned, brand-stripped, white-background JPEG ready to dispatch
 * to `aliexpress.affiliate.product.smartmatch`.
 *
 * Pipeline:
 *   1. Cache lookup — short-circuits on hit (no Gemini call, no review).
 *   2. Fetch source bytes with browser-UA spoof.
 *   3. Generate the cleaned image on `imageModel()` — IMAGE-ONLY response.
 *   4. Review pass on `visionModel()` — one text-out call over (source, cleaned)
 *      that returns BOTH the 0–10 quality score AND the structured analysis.
 *      • score ≥ 7  → use as-is.
 *      • score 4–6  → use with a warn log (minor issues, still better than raw).
 *      • score < 4  → retry with a lighter prompt (crop + brand-only, no BG change).
 *        - retry score ≥ 4 → use retry result.
 *        - retry score < 4 → throw PreprocessError("LOW_QUALITY") → caller falls
 *                            back to the raw source URL.
 *   5. Fire-and-forget cache write (only on PASS / WARN paths).
 *   6. Return base64 + dimensions + cacheHit + qualityScore + lightPromptUsed.
 *
 * WHY GENERATION AND ANALYSIS ARE SEPARATE CALLS
 * A single call asking for `responseModalities: ["TEXT", "IMAGE"]` plus a
 * two-task prompt is legally satisfied by answering only the TEXT half, and
 * that is what the models did: measured on this prompt with a real fixture,
 * gemini-2.5-flash-image returned an image part in 3/11 attempts and
 * gemini-3.1-flash-image in 12/15, each miss surfacing as
 * GEMINI_NO_IMAGE_OUTPUT and silently dropping the caller back to the raw
 * source URL. The same prompts split into one IMAGE-only call and one
 * TEXT-only call returned an image on every attempt. Never merge them back.
 *
 * The analysis rides on the REVIEW call rather than a third round-trip because
 * the reviewer is already holding the source image, and the analysis must read
 * the SOURCE: brand removal and artifact removal deliberately destroy the
 * hangtags, packaging and stickers that `ocrTraces` reads model numbers off.
 *
 * Failures: every internal error is wrapped in PreprocessError. Caller should
 * treat any throw as "fall back to the raw source URL" — never a hard failure.
 */

import { Buffer } from "node:buffer";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import {
  getCachedPreprocessed,
  savePreprocessedAsync,
} from "@/lib/ai/preprocess-cache";

import {
  imageModel as imageModelId,
  visionModel as visionModelId,
} from "./models";

/* ─── Constants ──────────────────────────────────────────────────────────── */

/**
 * Sprint 12 cost gate — Sprint 12 Stage 31.
 *
 * When false (the default), `preprocessForSmartMatch()` is skipped entirely.
 * The supplier-find pipeline still runs SmartMatch using the raw source image
 * URL (the "url arm"), which costs nothing. Preprocess is only enabled when
 * `PREPROCESS_ENABLED=true` AND the initial text+image match score is below
 * the trigger threshold (0.6). This keeps cold-scan cost at ~$0.0015 instead
 * of ~$0.041 for the typical case.
 */
export function isPreprocessEnabled(): boolean {
  return process.env.PREPROCESS_ENABLED === "true";
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Output geometry for the generation call.
 *
 * `generationConfig.imageConfig` is the ONLY thing that controls it — the
 * prompt's textual "1:1, approximately 800×800 px" was measured to be ignored
 * by every image model tried. `{1:1, "1K"}` reliably yields 1024×1024.
 *
 * Do NOT drop `imageSize` below "1K" without gating on the resolved model:
 * `imageSize: "512"` is a 400 on gemini-2.5-flash-image and only accepted by
 * the 3.x family, and `imageModel()` is env-overridable.
 */
const FULL_IMAGE_CONFIG = { aspectRatio: "1:1", imageSize: "1K" } as const;

/**
 * The light retry deliberately omits `aspectRatio`: its entire reason to exist
 * is changing as little as possible, and forcing a square would make the model
 * invent background to pad a non-square product — the opposite of the fidelity
 * the retry is protecting.
 */
const LIGHT_IMAGE_CONFIG = { imageSize: "1K" } as const;

/**
 * Score at or above this → use the cleaned image without warning.
 * Score below this but above SCORE_WARN → use it with a logged warning.
 */
const SCORE_USE_THRESHOLD = 7;
/**
 * Score below this → retry with the lighter prompt.
 * If the retry also scores below this → throw PreprocessError("LOW_QUALITY").
 */
const SCORE_WARN_THRESHOLD = 4;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/* ─── Public types ───────────────────────────────────────────────────────── */

export type ImageFormat = "jpg" | "png" | "webp";

/**
 * Structured intelligence extracted from the product image in the same
 * Gemini round-trip that produces the cleaned image.
 *
 * All fields are always present (empty arrays on cache hits or parse failure)
 * so callers can iterate without null-guarding.
 */
export interface VisionAnalysis {
  /**
   * Alphanumeric model numbers, manufacturing codes, batch serials, or
   * factory branding codes found on the product, tags, or packaging.
   * Model numbers fed into AliExpress keyword search yield near-exact supplier
   * matches — these are treated as the highest-priority keyword arm.
   */
  ocrTraces: string[];
  /**
   * Industrial material designations detected from visible labels or inferred
   * from product appearance (e.g. "TPU", "ABS", "CNC Aluminum", "S925 Silver").
   * Injected as priority keyword terms and used to derive negative-keyword
   * guards that strip raw-material supplier listings from the candidate pool.
   */
  materialTokens: string[];
  /**
   * Measurable specs or functional capability terms
   * (e.g. "450ml", "10000mAh", "Type-C", "shockproof", "IP67").
   * Appended to the material token query for the Text Arm B1 search.
   */
  technicalSpecs: string[];
}

export interface PreprocessResult {
  /** Base64-encoded cleaned image bytes — ready for AliExpress `image_base64`. */
  base64: string;
  /** Convenience MIME, e.g. `"image/jpeg"`. */
  mimeType: string;
  format: ImageFormat;
  width: number;
  height: number;
  /** True if served from cache — no Gemini call was made. */
  cacheHit: boolean;
  /** Wall-clock ms spent in this call (excludes cache-lookup time). */
  durationMs: number;
  /**
   * 0–10 quality score from the cleanup scorer. Absent on cache hits (the
   * score was assessed when the item was first written to cache).
   */
  qualityScore?: number;
  /**
   * True when the full preprocess scored < SCORE_WARN_THRESHOLD and we retried
   * with the lighter (crop + brand-only) prompt. Absent on cache hits.
   */
  lightPromptUsed?: boolean;
  /**
   * Structured intelligence extracted from the original image in the same
   * Gemini call. Always present; empty arrays on cache hits or if the model
   * returned no usable analysis.
   */
  ocrTraces: string[];
  materialTokens: string[];
  technicalSpecs: string[];
}

export class PreprocessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PreprocessError";
    this.code = code;
  }
}

/* ─── Internal types ─────────────────────────────────────────────────────── */

interface SourceImage {
  base64: string;
  mimeType: string;
}

interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface CleanupReview {
  score: number;
  issues: string[];
  analysis: VisionAnalysis;
  /**
   * The review call did not complete, so `score` is an optimistic default and
   * `analysis` is empty for lack of an answer — not because the image has
   * nothing on it. Callers MUST NOT persist an empty analysis under this flag:
   * the preprocess cache is keyed on (imageUrl, category) with no expiry, so
   * one transient vision outage would pin that pair to an empty
   * ocrTraces/materialTokens/technicalSpecs forever.
   */
  reviewerUnavailable?: boolean;
}

const EMPTY_ANALYSIS: VisionAnalysis = {
  ocrTraces: [],
  materialTokens: [],
  technicalSpecs: [],
};

/* ─── Source-image fetch ─────────────────────────────────────────────────── */

async function fetchSourceImage(imageUrl: string): Promise<SourceImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      throw new PreprocessError(
        "SOURCE_FETCH_FAILED",
        `Source image fetch returned ${res.status}`,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) {
      throw new PreprocessError("SOURCE_EMPTY", "Source image was empty");
    }
    if (buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new PreprocessError(
        "SOURCE_TOO_LARGE",
        `Source image ${buffer.byteLength} B exceeds ${MAX_SOURCE_BYTES} B ceiling`,
      );
    }
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
    return { base64: buffer.toString("base64"), mimeType };
  } catch (err) {
    if (err instanceof PreprocessError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new PreprocessError(
        "SOURCE_TIMEOUT",
        "Source image fetch timed out",
      );
    }
    throw new PreprocessError(
      "SOURCE_FETCH_ERROR",
      err instanceof Error ? err.message : "Unknown source-fetch error",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/* ─── Prompt construction ────────────────────────────────────────────────── */

/**
 * Full preprocess prompt — image cleanup ONLY.
 *
 * Single-task by design: the structured analysis lives on the review call
 * (see the module header). Nothing here may ask for text output — a prompt
 * that gives the model a text task to do is a prompt it can satisfy without
 * ever emitting the image part.
 *
 * Output geometry is set by IMAGE_CONFIG, not by this text.
 */
function buildFullPrompt(productCategory: string): string {
  const category = productCategory.trim() || "consumer product";
  return `You are a product image processor for a dropship-detection pipeline.

INPUT IMAGE: A consumer-facing product image of a "${category}".

Apply ALL of the following transformations in order:

1. CROP
   Tightly crop to the primary product item. Leave approximately 8% padding on
   all sides. Discard any extra empty whitespace.

2. BACKGROUND NORMALISATION
   Replace any non-white background (gradients, textures, in-use scenes, beds,
   hands, surfaces) with pure white #FFFFFF. Preserve a subtle soft shadow
   under the product only if the original had one.

3. BRAND REMOVAL — CRITICAL
   Identify and REMOVE all printed, embossed, debossed, screen-printed, or
   watermarked brand wordmarks, logos, hangtags, stickers, and trademark
   symbols from the product surface. Inpaint cleanly using the surrounding
   product texture, color, and grain so the result looks like an unbranded
   factory sample. Factory listings on the target catalog DO NOT carry retail
   brand marks.

4. ARTIFACT REMOVAL
   Remove any human hands, models, lifestyle props, packaging, boxes, swing
   tags, price tags, or partial occlusions. Output only the bare product.

PRESERVE EXACTLY:
- The product's structural shape, proportions, and silhouette
- Material texture, color saturation, and surface finish
- Stitching, fabric weave, metal etching, and other manufacturing details
- Any non-brand intrinsic markings (factory model numbers etched in metal,
  decorative patterns that are part of the product design)

IMAGE OUTPUT REQUIREMENTS:
- Single product centered on pure white background
- No added shadows, vignettes, glows, or decorative effects

EDGE CASES:
- If the source already meets these criteria, re-encode cleanly and return.
- If brand marks are inseparable from product features (e.g. engraved deep
  into the product body), minimise rather than destroy the surrounding area.
- If the source image does not appear to show a "${category}" at all,
  return your best clean crop of the dominant subject — do not refuse.

Return the processed image. Do not include any text response.`;
}

/**
 * Light preprocess: crop + brand removal only.
 *
 * Used when the full prompt scored < SCORE_WARN_THRESHOLD. The full prompt's
 * aggressive background replacement sometimes destroys product detail
 * (e.g. a glass product on a coloured lifestyle background). This lighter
 * version skips BG normalisation to preserve shape fidelity.
 */
function buildLightPrompt(productCategory: string): string {
  const category = productCategory.trim() || "consumer product";
  return `You are a product image processor for a reverse-image search pipeline.

INPUT IMAGE: A consumer-facing product image of a "${category}".

REQUIRED TRANSFORMATIONS — apply ONLY these two, in order:

1. CROP
   Tightly crop to the primary product item. Leave approximately 8% padding.
   Do NOT change the background colour or texture.

2. BRAND REMOVAL — CRITICAL
   Identify and REMOVE all printed, embossed, debossed, screen-printed, or
   watermarked brand wordmarks, logos, hangtags, and stickers from the product
   surface. Inpaint using surrounding product texture and colour.

DO NOT:
- Change or replace the background
- Remove lifestyle props or scene elements
- Alter the product's shape, colour, or detail in any way beyond brand removal

PRESERVE EXACTLY:
- The background as-is
- All product shape, proportions, texture, and colour
- Non-brand decorative patterns and manufacturing details

Return only the processed image. Do not include any text response.`;
}

/**
 * Review prompt — rates a source → cleaned pair AND extracts the structured
 * analysis from the SOURCE image in the same text-out round-trip.
 *
 * Both jobs are text, so unlike the old TEXT+IMAGE prompt there is no modality
 * for the model to trade away; and the reviewer already has the source in
 * context, so the analysis costs one extra JSON object rather than a call.
 */
function buildReviewPrompt(productCategory: string): string {
  const category = productCategory.trim() || "consumer product";
  return `You are a quality-control assessor and product analyst for a product image preprocessing pipeline.

You will be shown TWO images:
  IMAGE 1: The original source image (consumer photo of a "${category}")
  IMAGE 2: The preprocessed/cleaned version intended for factory catalog matching

━━━ PART A — RATE THE CLEANUP (IMAGE 1 vs IMAGE 2) ━━━

Rate the cleanup quality on a scale from 0 to 10 using these criteria:

BRAND REMOVAL (40% weight — most important):
  Did the cleaner successfully remove all brand wordmarks, logos, stickers,
  and hangtags from the product surface? Are there any brand text remnants?

PRODUCT INTEGRITY (40% weight):
  Does the cleaned image faithfully preserve the product's shape, proportions,
  material texture, and colour? Was any essential product detail destroyed?

BACKGROUND / ARTIFACTS (20% weight):
  Is the background clean and non-distracting? Were props, hands, and
  packaging removed without damaging the product?

Score guide:
  0–3  Major failure — brand visible, product shape distorted, or key features destroyed
  4–6  Minor issues — usable but imperfect
  7–10 Good to excellent — clean, brand-free, product intact

━━━ PART B — ANALYSE IMAGE 1 (the ORIGINAL, unprocessed image) ━━━

Read IMAGE 1 only. IMAGE 2 has had tags, packaging and brand marks deliberately
removed, so it is useless for this part.

ocrTraces
  Scan every visible surface, tag, label, barcode, and packaging. Extract
  alphanumeric model numbers, manufacturing codes, batch serials, or factory
  branding identifiers (e.g. "XZ-9900", "SKU: AB1234", "TC-500"). Include only
  precise codes, NOT generic descriptive phrases.

materialTokens
  Identify industrial material designations visible on labels or inferable from
  the product's appearance (e.g. "TPU", "ABS", "EVA", "CNC Aluminum",
  "Sterling Silver S925", "304 Stainless"). Use standard industrial shorthand.

technicalSpecs
  Extract measurable specifications or functional capability terms visible on
  product or packaging (e.g. "450ml", "10000mAh", "Type-C", "shockproof",
  "magnetic closure", "IP67", "BPA-free"). Be precise — omit marketing copy.

━━━ OUTPUT FORMAT ━━━

Respond with ONLY a JSON object, no other text, no markdown, no code fences.
Use empty arrays where nothing was found:
{
  "score": <integer 0–10>,
  "issues": [<short description of each problem found, or empty array if none>],
  "ocrTraces": [],
  "materialTokens": [],
  "technicalSpecs": []
}`;
}

/* ─── Response parsing ───────────────────────────────────────────────────── */

interface InlineImagePart {
  inlineData: { mimeType: string; data: string };
}

function isInlineImagePart(part: Part): part is Part & InlineImagePart {
  const candidate = part as Partial<InlineImagePart>;
  return (
    typeof candidate.inlineData?.mimeType === "string" &&
    candidate.inlineData.mimeType.startsWith("image/") &&
    typeof candidate.inlineData.data === "string" &&
    candidate.inlineData.data.length > 0
  );
}

function mimeTypeToFormat(mime: string): ImageFormat {
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Inline JPEG/PNG dimension reader — no `sharp` dependency. Returns { 0, 0 }
 * when the format is opaque or malformed. Width/height are advisory.
 */
function readDimensions(
  base64: string,
  format: ImageFormat,
): { width: number; height: number } {
  try {
    const buf = Buffer.from(base64, "base64");

    if (format === "png" && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    if (format === "jpg") {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        if (
          marker === 0xd8 ||
          marker === 0xd9 ||
          (marker >= 0xd0 && marker <= 0xd7)
        ) {
          i += 2;
          continue;
        }
        const segLen = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return {
            height: buf.readUInt16BE(i + 5),
            width: buf.readUInt16BE(i + 7),
          };
        }
        i += 2 + segLen;
      }
    }
  } catch {
    /* fall through */
  }
  return { width: 0, height: 0 };
}

/* ─── Gemini helpers ─────────────────────────────────────────────────────── */

type GenerativeModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
type GoogleGenerativeAIGenerationConfig = NonNullable<
  Parameters<GenerativeModel["generateContent"]>[0] extends infer P
    ? P extends { generationConfig?: infer G }
      ? G
      : never
    : never
>;

/**
 * Single image-generation Gemini round-trip. Extracted so we can call it
 * twice (full prompt + light prompt retry) without duplicating the parsing.
 *
 * `responseModalities: ["IMAGE"]` is not a preference — it removes the model's
 * option to answer in text instead, which is the whole fix (module header).
 */
async function runImageGeneration(
  model: GenerativeModel,
  source: SourceImage,
  prompt: string,
  imageConfig: typeof FULL_IMAGE_CONFIG | typeof LIGHT_IMAGE_CONFIG,
): Promise<GeneratedImage> {
  let response;
  try {
    response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: source.mimeType, data: source.base64 } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig,
      } as GoogleGenerativeAIGenerationConfig,
    });
  } catch (err) {
    throw new PreprocessError(
      "GEMINI_CALL_FAILED",
      err instanceof Error ? err.message : "Gemini call threw an unknown error",
    );
  }

  const parts = response.response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(isInlineImagePart);
  if (!imagePart) {
    throw new PreprocessError(
      "GEMINI_NO_IMAGE_OUTPUT",
      "Gemini response contained no image part — model may have refused or returned text",
    );
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
}

/** Pull the analysis arms out of an already-parsed review payload. */
function parseVisionAnalysis(payload: Record<string, unknown>): VisionAnalysis {
  return {
    ocrTraces: toStringArray(payload.ocrTraces),
    materialTokens: toStringArray(payload.materialTokens),
    technicalSpecs: toStringArray(payload.technicalSpecs),
  };
}

/**
 * Ask the vision model to rate a source → cleaned pair and, in the same
 * text-out call, extract the structured analysis from the source image.
 *
 * Best-effort: any failure (API error, parse error, malformed JSON) returns an
 * optimistic score of 7 with an empty analysis so the cleaned image is still
 * used. We never want a reviewer outage to silently downgrade every scan to
 * the raw URL path — the analysis arms simply go quiet, as they already do
 * when the model finds nothing.
 */
async function reviewCleanup(
  source: SourceImage,
  cleaned: GeneratedImage,
  productCategory: string,
  client: GoogleGenerativeAI,
): Promise<CleanupReview> {
  const OPTIMISTIC: CleanupReview = {
    score: 7,
    issues: ["reviewer unavailable — optimistic default"],
    analysis: EMPTY_ANALYSIS,
    reviewerUnavailable: true,
  };

  try {
    const model = client.getGenerativeModel({
      model: visionModelId(),
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildReviewPrompt(productCategory) },
            { text: "IMAGE 1 (source):" },
            { inlineData: { mimeType: source.mimeType, data: source.base64 } },
            { text: "IMAGE 2 (cleaned):" },
            {
              inlineData: { mimeType: cleaned.mimeType, data: cleaned.base64 },
            },
          ],
        },
      ],
    });

    const textPart = response.response?.candidates?.[0]?.content?.parts?.find(
      (p) => "text" in p && typeof (p as { text?: string }).text === "string",
    ) as { text: string } | undefined;
    const text = textPart?.text ?? "";

    // Strip possible markdown code fences before JSON.parse
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(jsonText) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "score" in parsed &&
      typeof (parsed as Record<string, unknown>).score === "number"
    ) {
      const p = parsed as Record<string, unknown>;
      return {
        score: Math.min(10, Math.max(0, Math.round(Number(p.score)))),
        issues: toStringArray(p.issues),
        analysis: parseVisionAnalysis(p),
      };
    }

    return OPTIMISTIC;
  } catch {
    return OPTIMISTIC;
  }
}

/* ─── Public entry point ─────────────────────────────────────────────────── */

/**
 * Cleaned, brand-stripped version of a product image ready for AliExpress
 * image-based search endpoints.
 *
 * @param imageUrl         Direct URL to the source product image.
 * @param productCategory  Category hint for the Gemini prompt and scorer.
 * @throws PreprocessError — caller should fall back to the raw source URL.
 */
export async function preprocessForSmartMatch(
  imageUrl: string,
  productCategory: string,
): Promise<PreprocessResult> {
  const startedAt = Date.now();

  // 1. Cache hit — skip generation and scoring entirely.
  // Analysis fields are stored alongside the image, so cache hits are full hits.
  // Legacy rows (created before the Json columns were added) return empty arrays.
  const cached = await getCachedPreprocessed(imageUrl, productCategory);
  if (cached) {
    return {
      base64: cached.base64,
      mimeType: `image/${cached.format === "jpg" ? "jpeg" : cached.format}`,
      format: cached.format,
      width: cached.width,
      height: cached.height,
      cacheHit: true,
      durationMs: Date.now() - startedAt,
      ocrTraces: cached.ocrTraces,
      materialTokens: cached.materialTokens,
      technicalSpecs: cached.technicalSpecs,
    };
  }

  // 2. Resolve API key.
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new PreprocessError(
      "GEMINI_NOT_CONFIGURED",
      "GOOGLE_AI_API_KEY (or GEMINI_API_KEY) is required for image preprocessing",
    );
  }

  // 3. Source fetch.
  const source = await fetchSourceImage(imageUrl);

  const client = new GoogleGenerativeAI(apiKey);
  const imageModel = client.getGenerativeModel({
    model: imageModelId(),
  });

  // 4. Generation call — IMAGE-only, so the model cannot answer in text instead.
  const cleaned = await runImageGeneration(
    imageModel,
    source,
    buildFullPrompt(productCategory),
    FULL_IMAGE_CONFIG,
  );

  // 5. Review call — score + structured analysis of the SOURCE image.
  const {
    score: fullScore,
    issues: fullIssues,
    analysis,
    reviewerUnavailable,
  } = await reviewCleanup(source, cleaned, productCategory, client);

  if (analysis.ocrTraces.length > 0 || analysis.materialTokens.length > 0) {
    console.info(
      `[preprocess] analysis for ${imageUrl}: ` +
        `ocr=[${analysis.ocrTraces.join(",")}] ` +
        `materials=[${analysis.materialTokens.join(",")}] ` +
        `specs=[${analysis.technicalSpecs.join(",")}]`,
    );
  }

  if (fullScore >= SCORE_WARN_THRESHOLD) {
    // Path A: use the full-preprocess result (score 4–10).
    if (fullScore < SCORE_USE_THRESHOLD) {
      console.warn(
        `[preprocess] quality warn (score ${fullScore}/10) for ${imageUrl}: ${fullIssues.join("; ")}`,
      );
    }

    const format = mimeTypeToFormat(cleaned.mimeType);
    const { width, height } = readDimensions(cleaned.base64, format);
    // Skip the cache entirely when the reviewer never answered. Re-generating
    // the image on the next scan costs one call; caching an empty analysis
    // costs it permanently, because the entry never expires.
    if (!reviewerUnavailable) {
      savePreprocessedAsync(imageUrl, productCategory, {
        base64: cleaned.base64,
        format,
        width,
        height,
        ocrTraces: analysis.ocrTraces,
        materialTokens: analysis.materialTokens,
        technicalSpecs: analysis.technicalSpecs,
      });
    }

    return {
      base64: cleaned.base64,
      mimeType: cleaned.mimeType,
      format,
      width,
      height,
      cacheHit: false,
      durationMs: Date.now() - startedAt,
      qualityScore: fullScore,
      lightPromptUsed: false,
      // Analysis comes from the full prompt pass — valid even if we later swap the image.
      ...analysis,
    };
  }

  // Path B: full preprocess scored < SCORE_WARN_THRESHOLD — retry with lighter prompt.
  // The analysis from the full pass is still valid (it describes the original image).
  console.warn(
    `[preprocess] full prompt scored ${fullScore}/10 for ${imageUrl} — retrying with light prompt. ` +
      `Issues: ${fullIssues.join("; ")}`,
  );

  const cleanedLight = await runImageGeneration(
    imageModel,
    source,
    buildLightPrompt(productCategory),
    LIGHT_IMAGE_CONFIG,
  );
  // The retry review re-reads the same source image, so its analysis is a
  // duplicate of `analysis` above — deliberately discarded, not forgotten.
  const { score: lightScore, issues: lightIssues } = await reviewCleanup(
    source,
    cleanedLight,
    productCategory,
    client,
  );

  if (lightScore < SCORE_WARN_THRESHOLD) {
    throw new PreprocessError(
      "LOW_QUALITY",
      `Both full (score ${fullScore}) and light (score ${lightScore}) preprocess passes scored ` +
        `below threshold ${SCORE_WARN_THRESHOLD} for ${imageUrl}. ` +
        `Light issues: ${lightIssues.join("; ")}. Falling back to raw source URL.`,
    );
  }

  if (lightScore < SCORE_USE_THRESHOLD) {
    console.warn(
      `[preprocess] light prompt quality warn (score ${lightScore}/10): ${lightIssues.join("; ")}`,
    );
  }

  const lightFormat = mimeTypeToFormat(cleanedLight.mimeType);
  const { width: lightW, height: lightH } = readDimensions(
    cleanedLight.base64,
    lightFormat,
  );
  // Same guard as Path A — see above.
  if (!reviewerUnavailable) {
    savePreprocessedAsync(imageUrl, productCategory, {
      base64: cleanedLight.base64,
      format: lightFormat,
      width: lightW,
      height: lightH,
      // Analysis comes from the full prompt pass, which always ran before the
      // light retry — its values remain valid and must be persisted here.
      ocrTraces: analysis.ocrTraces,
      materialTokens: analysis.materialTokens,
      technicalSpecs: analysis.technicalSpecs,
    });
  }

  return {
    base64: cleanedLight.base64,
    mimeType: cleanedLight.mimeType,
    format: lightFormat,
    width: lightW,
    height: lightH,
    cacheHit: false,
    durationMs: Date.now() - startedAt,
    qualityScore: lightScore,
    lightPromptUsed: true,
    // Carry forward analysis from full pass — the light pass is image-only.
    ...analysis,
  };
}
