/**
 * preprocessForSmartMatch — Gemini Vision multimodal preprocessor.
 *
 * Takes a raw consumer-facing product image URL and a category hint,
 * returns a cleaned, brand-stripped, white-background JPEG ready to dispatch
 * to `aliexpress.affiliate.product.smartmatch`.
 *
 * Pipeline (stage 9 — with quality scoring):
 *   1. Cache lookup — short-circuits on hit (no Gemini call, no scoring).
 *   2. Fetch source bytes with browser-UA spoof.
 *   3. Run full preprocess (crop + BG normalise + brand removal + artifact removal).
 *   4. Score the result: send source + cleaned to a vision model, get 0–10.
 *      • score ≥ 7  → use as-is.
 *      • score 4–6  → use with a warn log (minor issues, still better than raw).
 *      • score < 4  → retry with a lighter prompt (crop + brand-only, no BG change).
 *        - retry score ≥ 4 → use retry result.
 *        - retry score < 4 → throw PreprocessError("LOW_QUALITY") → caller falls
 *                            back to the raw source URL.
 *   5. Fire-and-forget cache write (only on PASS / WARN paths).
 *   6. Return base64 + dimensions + cacheHit + qualityScore + lightPromptUsed.
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

/* ─── Constants ──────────────────────────────────────────────────────────── */

const DEFAULT_IMAGE_MODEL = "gemini-3-flash-image";
/** Fast vision model used for cleanup scoring (text output, not image output). */
const DEFAULT_VISION_MODEL = "gemini-2.0-flash";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

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

interface CleanupScore {
  score: number;
  issues: string[];
}

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
      throw new PreprocessError("SOURCE_TIMEOUT", "Source image fetch timed out");
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

/** Full preprocess: crop + white BG + brand removal + artifact removal. */
function buildFullPrompt(productCategory: string): string {
  const category = productCategory.trim() || "consumer product";
  return `You are a product image processor for a reverse-image search pipeline.
The output of your transformation will be dispatched to a catalog visual-search
API to find the original factory/wholesale listing of a dropshipped product.

INPUT IMAGE: A consumer-facing product image of a "${category}".

REQUIRED TRANSFORMATIONS — apply ALL, in order:

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
   factory sample. This step is the single most important transformation —
   factory listings on the target catalog DO NOT carry retail brand marks.

4. ARTIFACT REMOVAL
   Remove any human hands, models, lifestyle props, packaging, boxes, swing
   tags, price tags, or partial occlusions. Output only the bare product.

PRESERVE EXACTLY:
- The product's structural shape, proportions, and silhouette
- Material texture, color saturation, and surface finish
- Stitching, fabric weave, metal etching, and other manufacturing details
- Any non-brand intrinsic markings (factory model numbers etched in metal,
  decorative patterns that are part of the product design)

OUTPUT REQUIREMENTS:
- Format: JPEG
- Aspect ratio: 1:1 (square)
- Approximate dimensions: 800x800 px
- Single product centered on pure white background
- No added shadows, vignettes, glows, or decorative effects

EDGE CASES:
- If the source already meets these criteria, re-encode cleanly and return.
- If brand marks are inseparable from product features (e.g. engraved deep
  into the product body), minimise rather than destroy the surrounding area.
- If the source image does not appear to show a "${category}" at all,
  return your best clean crop of the dominant subject — do not refuse.

Return only the processed image. Do not include any text response.`;
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

OUTPUT REQUIREMENTS:
- Format: JPEG
- Keep the original aspect ratio (do NOT force square)
- Approximately 800px on the longer side

Return only the processed image. Do not include any text response.`;
}

/** Prompt that asks the vision model to rate a source → cleaned pair. */
function buildScoringPrompt(productCategory: string): string {
  const category = productCategory.trim() || "consumer product";
  return `You are a quality-control assessor for a product image preprocessing pipeline.

You will be shown TWO images:
  IMAGE 1: The original source image (consumer photo of a "${category}")
  IMAGE 2: The preprocessed/cleaned version intended for factory catalog matching

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

Respond with ONLY a JSON object, no other text:
{
  "score": <integer 0–10>,
  "issues": [<short description of each problem found, or empty array if none>]
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
        if (buf[i] !== 0xff) { i += 1; continue; }
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
 */
async function runImageGeneration(
  model: GenerativeModel,
  source: SourceImage,
  prompt: string,
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

/**
 * Ask the vision model to rate a source → cleaned pair.
 *
 * Best-effort: any failure (API error, parse error, malformed JSON) returns
 * an optimistic score of 7 so the cleaned image is used. We never want a
 * scorer outage to silently downgrade every analysis to the raw URL path.
 */
async function scoreCleanup(
  source: SourceImage,
  cleaned: GeneratedImage,
  productCategory: string,
  client: GoogleGenerativeAI,
): Promise<CleanupScore> {
  const OPTIMISTIC: CleanupScore = { score: 7, issues: ["scorer unavailable — optimistic default"] };

  try {
    const model = client.getGenerativeModel({
      model: process.env.GOOGLE_AI_VISION_MODEL ?? DEFAULT_VISION_MODEL,
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildScoringPrompt(productCategory) },
            { text: "IMAGE 1 (source):" },
            { inlineData: { mimeType: source.mimeType, data: source.base64 } },
            { text: "IMAGE 2 (cleaned):" },
            { inlineData: { mimeType: cleaned.mimeType, data: cleaned.base64 } },
          ],
        },
      ],
    });

    const textPart = response.response?.candidates?.[0]?.content?.parts
      ?.find((p) => "text" in p && typeof (p as { text?: string }).text === "string") as
      | { text: string }
      | undefined;
    const text = textPart?.text ?? "";

    // Strip possible markdown code fences before JSON.parse
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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
        issues: Array.isArray(p.issues)
          ? (p.issues as unknown[]).filter((i): i is string => typeof i === "string")
          : [],
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
    model: process.env.GOOGLE_AI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
  });

  // 4. Full preprocess round-trip.
  const cleaned = await runImageGeneration(imageModel, source, buildFullPrompt(productCategory));

  // 5. Score the result.
  const { score: fullScore, issues: fullIssues } = await scoreCleanup(
    source,
    cleaned,
    productCategory,
    client,
  );

  if (fullScore >= SCORE_WARN_THRESHOLD) {
    // Path A: use the full-preprocess result (score 4–10).
    if (fullScore < SCORE_USE_THRESHOLD) {
      console.warn(
        `[preprocess] quality warn (score ${fullScore}/10) for ${imageUrl}: ${fullIssues.join("; ")}`,
      );
    }

    const format = mimeTypeToFormat(cleaned.mimeType);
    const { width, height } = readDimensions(cleaned.base64, format);
    savePreprocessedAsync(imageUrl, productCategory, { base64: cleaned.base64, format, width, height });

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
    };
  }

  // Path B: full preprocess scored < SCORE_WARN_THRESHOLD — retry with lighter prompt.
  console.warn(
    `[preprocess] full prompt scored ${fullScore}/10 for ${imageUrl} — retrying with light prompt. ` +
    `Issues: ${fullIssues.join("; ")}`,
  );

  const cleanedLight = await runImageGeneration(imageModel, source, buildLightPrompt(productCategory));
  const { score: lightScore, issues: lightIssues } = await scoreCleanup(
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
  const { width: lightW, height: lightH } = readDimensions(cleanedLight.base64, lightFormat);
  savePreprocessedAsync(imageUrl, productCategory, {
    base64: cleanedLight.base64,
    format: lightFormat,
    width: lightW,
    height: lightH,
  });

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
  };
}
