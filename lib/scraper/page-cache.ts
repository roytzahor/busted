/**
 * Cache layer for fetchProductPage() — stores gzip-compressed HTML/markdown
 * in Neon Postgres indexed by sha256(url).
 *
 * Why Neon Postgres (not Redis): the stack is already on Prisma/Neon for every
 * other cache layer (PreprocessedImage, StageCache). Adding a Redis dependency
 * for a single use-case adds operational surface area that isn't justified at
 * this scale. Postgres handles the load fine; the gzip step shrinks a typical
 * 300 KB Shopify page to ~28 KB, keeping row sizes well within reason.
 *
 * Key strategy: sha256(url). URL is trimmed before hashing so query-string
 * normalization is the caller's responsibility — pass the canonical URL.
 *
 * TTL: 14 days. Product pages change slowly; the 14-day window matches the
 * ScannedProduct analysis cache so they expire together.
 *
 * Compression: gzip. Text pages compress at 10:1+; this matters because the
 * Neon free tier imposes a storage quota and HTML is the largest payload we
 * persist.
 */

import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import type { FetchProductResult } from "@/lib/scraper/fetch-product";

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Cache lifetime. Matches the ScannedProduct TTL so they expire together. */
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Raw (pre-compression) payload ceiling.
 *
 * Pathological pages (large inline SVGs, embedded base64 images) can balloon
 * past 2 MB. Above this threshold we skip caching rather than bloat the DB.
 */
const MAX_RAW_BYTES = 2 * 1024 * 1024; // 2 MB

/* ─── Internal helpers ───────────────────────────────────────────────────── */

export function makePageCacheKey(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

function compressText(text: string): Buffer | null {
  const raw = Buffer.from(text, "utf-8");
  if (raw.byteLength === 0) return null;
  return gzipSync(raw);
}

function decompressToText(buf: Buffer): string {
  return gunzipSync(buf).toString("utf-8");
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

export interface CachedPage {
  html?: string;
  markdown?: string;
  /** Original arm that produced the content — preserved through cache. */
  source: "crawlbase" | "firecrawl";
}

/**
 * Look up a cached page by URL. Returns null when:
 *   - no entry exists
 *   - the entry is older than CACHE_TTL_MS
 *   - decompression fails (corrupt row)
 *
 * Hit-count increment is fire-and-forget and never blocks the read.
 */
export async function getCachedPage(url: string): Promise<CachedPage | null> {
  const cacheKey = makePageCacheKey(url);

  let row: Awaited<ReturnType<typeof prisma.fetchedPage.findUnique>>;
  try {
    row = await prisma.fetchedPage.findUnique({ where: { cacheKey } });
  } catch (err) {
    console.error("[page-cache] lookup failed", err);
    return null;
  }

  if (!row) return null;
  if (Date.now() - row.createdAt.getTime() > CACHE_TTL_MS) return null;

  // Fire-and-forget hit counter — never blocks the read path.
  void prisma.fetchedPage
    .update({
      where: { cacheKey },
      data: { hits: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => { /* non-critical */ });

  try {
    const html = row.html ? decompressToText(row.html as Buffer) : undefined;
    const markdown = row.markdown
      ? decompressToText(row.markdown as Buffer)
      : undefined;

    if (!html && !markdown) return null; // row stored nothing useful

    return {
      ...(html ? { html } : {}),
      ...(markdown ? { markdown } : {}),
      source: row.source as "crawlbase" | "firecrawl",
    };
  } catch (err) {
    console.error("[page-cache] decompression failed — treating as miss", err);
    return null;
  }
}

/**
 * Persist a freshly-fetched page to the cache. Fire-and-forget: returns
 * synchronously; the DB write resolves out-of-band. Safe to call without
 * `await`. Errors are logged but never thrown.
 *
 * Both html and markdown are gzip-compressed before storage. Skips silently
 * when the combined raw payload exceeds MAX_RAW_BYTES.
 */
export function savePageAsync(url: string, result: FetchProductResult): void {
  const htmlRaw = result.html ? Buffer.from(result.html, "utf-8") : null;
  const mdRaw = result.markdown ? Buffer.from(result.markdown, "utf-8") : null;

  if (!htmlRaw && !mdRaw) return; // nothing to cache

  const rawTotal = (htmlRaw?.byteLength ?? 0) + (mdRaw?.byteLength ?? 0);
  if (rawTotal > MAX_RAW_BYTES) {
    console.warn(
      `[page-cache] raw payload ${rawTotal} B exceeds ${MAX_RAW_BYTES} B ceiling for ${url} — skipping`,
    );
    return;
  }

  let htmlBuf: Buffer | null = null;
  let mdBuf: Buffer | null = null;
  let sizeBytes = 0;

  try {
    htmlBuf = htmlRaw ? gzipSync(htmlRaw) : null;
    mdBuf = mdRaw ? gzipSync(mdRaw) : null;
    sizeBytes = (htmlBuf?.byteLength ?? 0) + (mdBuf?.byteLength ?? 0);
  } catch (err) {
    console.error("[page-cache] compression failed — skipping cache", err);
    return;
  }

  const cacheKey = makePageCacheKey(url);

  // Prisma 6 requires Uint8Array<ArrayBuffer> for Bytes? fields. Node's Buffer
  // is typed as Uint8Array<ArrayBufferLike> (a union including SharedArrayBuffer),
  // which TypeScript won't narrow automatically. Copying into a freshly
  // allocated ArrayBuffer produces the exact Uint8Array<ArrayBuffer> Prisma needs.
  const toU8 = (buf: Buffer | null): Uint8Array<ArrayBuffer> | null => {
    if (!buf) return null;
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return new Uint8Array(ab);
  };

  void prisma.fetchedPage
    .upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        url,
        html: toU8(htmlBuf),
        markdown: toU8(mdBuf),
        source: result.source,
        sizeBytes,
      },
      update: {
        html: toU8(htmlBuf),
        markdown: toU8(mdBuf),
        source: result.source,
        sizeBytes,
        lastHitAt: new Date(),
        // createdAt deliberately NOT updated — the row's age drives TTL
        // eviction so refreshing content doesn't restart the TTL clock.
      },
    })
    .catch((err: unknown) => {
      console.error("[page-cache] save failed", err);
    });
}
