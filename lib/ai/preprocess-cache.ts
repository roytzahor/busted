/**
 * Cache layer for Gemini Vision-preprocessed product images.
 *
 * What this caches: the output of `preprocessForSmartMatch` — a tightly-cropped,
 * background-normalised, brand-inpainted version of the source product image,
 * ready to dispatch to AliExpress's `image_url` / `image_base64` smartmatch
 * input.
 *
 * Why we cache: each preprocess call costs ~$0.001 (Gemini Vision image-output
 * model) and ~600–1500 ms latency. For a corpus of recurring URLs (cached
 * scans, popular dropship stores) cache hits drive both numbers to ~5 ms.
 *
 * Key strategy: sha256(sourceImageUrl + "|" + productCategory). Including the
 * category in the key matters — the prompt is category-aware, so a "necklace"
 * pass produces a different output than a "phone case" pass even on the same
 * image.
 *
 * TTL: 30 days. Long because the source image at a given URL is essentially
 * immutable in practice; Shopify CDN URLs include content hashes.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Cache lifetime — re-process after this even on cache hit. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Payload ceiling — refuse to read anything pathologically large. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

export interface CachedPreprocessedImage {
  base64: string;
  format: "jpg" | "png" | "webp";
  width: number;
  height: number;
  /**
   * Vision-analysis payload extracted in the same Gemini round-trip as the
   * image cleanup. Always string arrays; empty on legacy rows that predate
   * this field (null in the DB → treated as [] by the cache layer).
   */
  ocrTraces: string[];
  materialTokens: string[];
  technicalSpecs: string[];
}

export function makeCacheKey(
  sourceImageUrl: string,
  productCategory: string,
): string {
  return createHash("sha256")
    .update(`${sourceImageUrl.trim()}|${productCategory.trim().toLowerCase()}`)
    .digest("hex");
}

function normalizeFormat(raw: string): "jpg" | "png" | "webp" {
  const lower = raw.toLowerCase();
  if (lower === "png") return "png";
  if (lower === "webp") return "webp";
  return "jpg";
}

/** Safely coerce a Prisma Json? field to a string array. */
function parseJsonStrArr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Return the cached cleaned image for the given (sourceImageUrl, productCategory)
 * pair, or null if absent / expired / corrupt. Touch is best-effort and
 * fire-and-forget — never blocks the read path.
 */
export async function getCachedPreprocessed(
  sourceImageUrl: string,
  productCategory: string,
): Promise<CachedPreprocessedImage | null> {
  const cacheKey = makeCacheKey(sourceImageUrl, productCategory);

  let row: Awaited<ReturnType<typeof prisma.preprocessedImage.findUnique>>;
  try {
    row = await prisma.preprocessedImage.findUnique({ where: { cacheKey } });
  } catch (err) {
    console.error("[preprocess-cache] lookup failed", err);
    return null;
  }

  if (!row) return null;
  if (Date.now() - row.createdAt.getTime() > CACHE_TTL_MS) return null;
  if (row.payloadBytes > MAX_PAYLOAD_BYTES) return null;

  // Fire-and-forget hit-count update. Failures are silently swallowed
  // because they should never block a cache read.
  void prisma.preprocessedImage
    .update({
      where: { cacheKey },
      data: { hits: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {
      /* ignored — cache touch is non-critical */
    });

  return {
    base64: Buffer.from(row.processedImage).toString("base64"),
    format: normalizeFormat(row.format),
    width: row.width,
    height: row.height,
    ocrTraces: parseJsonStrArr(row.ocrTraces),
    materialTokens: parseJsonStrArr(row.materialTokens),
    technicalSpecs: parseJsonStrArr(row.technicalSpecs),
  };
}

/**
 * Persist a freshly-processed image to the cache. Fire-and-forget: returns
 * synchronously; the underlying DB write resolves out-of-band. Use this when
 * you have just finished a fresh Gemini call and want the next request to
 * benefit, without making the current request pay the DB latency cost.
 *
 * Safe to call without `await`. Errors are logged but do not throw.
 */
export function savePreprocessedAsync(
  sourceImageUrl: string,
  productCategory: string,
  data: CachedPreprocessedImage,
): void {
  const buffer = Buffer.from(data.base64, "base64");
  if (buffer.byteLength === 0) {
    console.warn("[preprocess-cache] refusing to save empty payload");
    return;
  }
  if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
    console.warn(
      `[preprocess-cache] payload ${buffer.byteLength} B exceeds ${MAX_PAYLOAD_BYTES} B ceiling; not caching`,
    );
    return;
  }

  const cacheKey = makeCacheKey(sourceImageUrl, productCategory);

  void prisma.preprocessedImage
    .upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        sourceImageUrl,
        productCategory: productCategory.toLowerCase(),
        processedImage: buffer,
        format: normalizeFormat(data.format),
        width: data.width,
        height: data.height,
        payloadBytes: buffer.byteLength,
        ocrTraces: data.ocrTraces,
        materialTokens: data.materialTokens,
        technicalSpecs: data.technicalSpecs,
      },
      update: {
        processedImage: buffer,
        format: normalizeFormat(data.format),
        width: data.width,
        height: data.height,
        payloadBytes: buffer.byteLength,
        lastHitAt: new Date(),
        ocrTraces: data.ocrTraces,
        materialTokens: data.materialTokens,
        technicalSpecs: data.technicalSpecs,
        // createdAt deliberately NOT touched on update — the row's age drives
        // TTL eviction, so an old key getting refreshed keeps its TTL window.
      },
    })
    .catch((err) => {
      console.error("[preprocess-cache] save failed", err);
    });
}

/**
 * Manual eviction — useful when we change the prompt or the model and want
 * the next call for a URL to re-process. Not used in the hot path.
 */
export async function evictPreprocessed(
  sourceImageUrl: string,
  productCategory: string,
): Promise<void> {
  const cacheKey = makeCacheKey(sourceImageUrl, productCategory);
  try {
    await prisma.preprocessedImage.delete({ where: { cacheKey } });
  } catch {
    /* missing row is fine — eviction is idempotent */
  }
}
