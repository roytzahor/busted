/**
 * preprocessForSmartMatch — Gemini Vision multimodal preprocessor.
 *
 * Takes a raw consumer-facing product image URL and a category hint,
 * returns a cleaned, brand-stripped, white-background JPEG ready to dispatch
 * to `aliexpress.affiliate.product.smartmatch` (or any reverse-image search
 * service that expects a normalised catalog-style asset).
 *
 * Pipeline (single Gemini round-trip):
 *   1. Fetch source bytes with browser-UA spoof (Shopify CDN blocks `node`).
 *   2. Send to Gemini's image-generative model with a category-aware prompt
 *      that instructs: tight crop, white BG, brand wordmark inpaint, no props.
 *   3. Parse the inlineData image part from the response.
 *   4. Fire-and-forget write to the preprocess cache.
 *   5. Return base64 + dimensions + cacheHit flag.
 *
 * Caching: handled internally — caller never has to think about it. A second
 * call with the same (sourceImageUrl, productCategory) pair hits the DB
 * cache in ~5 ms instead of ~1 s + $0.001.
 *
 * Failures: every internal error is wrapped in `PreprocessError` with a
 * stable error code. Caller should treat any throw as "fall back to the raw
 * source URL" — never as a hard pipeline failure.
 */

import { Buffer } from "node:buffer";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import {
  getCachedPreprocessed,
  savePreprocessedAsync,
} from "@/lib/ai/preprocess-cache";

const DEFAULT_IMAGE_MODEL = "gemini-3-flash-image";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type ImageFormat = "jpg" | "png" | "webp";

export interface PreprocessResult {
  /** Base64-encoded cleaned image bytes — ready for AliExpress `image_base64`. */
  base64: string;
  /** Convenience MIME, e.g. `"image/jpeg"`. */
  mimeType: string;
  format: ImageFormat;
  width: number;
  height: number;
  /** True if served from cache, false if a fresh Gemini call was made. */
  cacheHit: boolean;
  /** Wall-clock ms spent in this call (excludes cache-lookup time). */
  durationMs: number;
}

export class PreprocessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PreprocessError";
    this.code = code;
  }
}

/* ─── Source-image fetch ─────────────────────────────────────────────── */

interface SourceImage {
  base64: string;
  mimeType: string;
}

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
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
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

/* ─── Prompt construction (category-aware) ───────────────────────────── */

function buildPrompt(productCategory: string): string {
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

/* ─── Response parsing ──────────────────────────────────────────────── */

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
 * Inline JPEG/PNG dimension reader — avoids pulling in `sharp` or `image-size`
 * for one field. Returns { 0, 0 } when the format is opaque or malformed
 * (e.g. WebP, which has multiple chunk types). Width/height are advisory —
 * downstream code should treat 0 as "unknown".
 */
function readDimensions(
  base64: string,
  format: ImageFormat,
): { width: number; height: number } {
  try {
    const buf = Buffer.from(base64, "base64");

    if (format === "png" && buf.length >= 24) {
      // PNG signature is 8 bytes; IHDR length (4) + IHDR type (4) follow.
      // Width is at byte 16, height at byte 20, both big-endian uint32.
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    if (format === "jpg") {
      // Walk JPEG segments looking for SOF0..SOF3 markers.
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        // Standalone markers without a length field
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const segLen = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          // SOF: precision(1) + height(2) + width(2)
          return {
            height: buf.readUInt16BE(i + 5),
            width: buf.readUInt16BE(i + 7),
          };
        }
        i += 2 + segLen;
      }
    }
  } catch {
    /* fall through to unknown */
  }
  return { width: 0, height: 0 };
}

/* ─── Public entry point ─────────────────────────────────────────────── */

/**
 * Cleaned, brand-stripped, white-BG version of a product image ready for
 * dispatch to AliExpress's image-based search endpoints.
 *
 * @param imageUrl         Direct URL to the source product image.
 * @param productCategory  Category hint that flows into the Gemini prompt
 *                         (e.g. "necklace", "shower steamer", "slippers").
 * @throws PreprocessError on source-fetch failure, missing API key, or
 *                         no-image-in-response. Errors are recoverable —
 *                         caller should fall back to the raw source URL.
 */
export async function preprocessForSmartMatch(
  imageUrl: string,
  productCategory: string,
): Promise<PreprocessResult> {
  const startedAt = Date.now();

  // 1. Cache lookup — short-circuits the entire flow on hit.
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

  // 2. Resolve API key — accept either var name for back-compat.
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new PreprocessError(
      "GEMINI_NOT_CONFIGURED",
      "GOOGLE_AI_API_KEY (or GEMINI_API_KEY) is required for image preprocessing",
    );
  }

  // 3. Source fetch with browser-UA spoof.
  const source = await fetchSourceImage(imageUrl);

  // 4. Single Gemini round-trip — vision in, image out.
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: process.env.GOOGLE_AI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
  });

  let response;
  try {
    response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(productCategory) },
            {
              inlineData: {
                mimeType: source.mimeType,
                data: source.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        // responseModalities is supported by the API but not yet in the public
        // SDK types. Cast through to silence the type-checker; remove the cast
        // when @google/generative-ai catches up.
        responseModalities: ["IMAGE"],
      } as GoogleGenerativeAIGenerationConfig,
    });
  } catch (err) {
    throw new PreprocessError(
      "GEMINI_CALL_FAILED",
      err instanceof Error ? err.message : "Gemini call threw an unknown error",
    );
  }

  // 5. Parse the inline image part out of the response.
  const parts = response.response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(isInlineImagePart);

  if (!imagePart) {
    throw new PreprocessError(
      "GEMINI_NO_IMAGE_OUTPUT",
      "Gemini response contained no image part — model may have refused or returned text",
    );
  }

  const outputMimeType = imagePart.inlineData.mimeType;
  const format = mimeTypeToFormat(outputMimeType);
  const { width, height } = readDimensions(imagePart.inlineData.data, format);

  // 6. Fire-and-forget cache write. Don't await — the next request benefits
  //    even if this one hasn't fully persisted yet.
  savePreprocessedAsync(imageUrl, productCategory, {
    base64: imagePart.inlineData.data,
    format,
    width,
    height,
  });

  return {
    base64: imagePart.inlineData.data,
    mimeType: outputMimeType,
    format,
    width,
    height,
    cacheHit: false,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Local re-declaration of the SDK type that's not yet exported. Single source
 * of truth for the responseModalities cast above; if the SDK ever exports an
 * upgraded type, just delete this and import it.
 */
type GoogleGenerativeAIGenerationConfig = NonNullable<
  Parameters<GenerativeModel["generateContent"]>[0] extends infer P
    ? P extends { generationConfig?: infer G }
      ? G
      : never
    : never
>;

type GenerativeModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
