/**
 * VerifiedProductMap cache layer — the "Gold Path".
 *
 * A verified row permanently maps a normalized retail URL to the winning
 * AliExpress supplier product. When a hot-path lookup hits within its TTL the
 * analyze route returns the stored mapping verbatim and skips the entire
 * scrape + AI + supplier-search pipeline (instant HIT, 0ms AI latency, $0).
 *
 * Rows are written in two ways (see lib/cache/verified-map writers):
 *   1. user_feedback        — user tapped 👍 "Same product" on a result
 *   2. auto_high_confidence — the pipeline resolved a high-confidence,
 *      image-verified match (frequently only after the expensive escalation
 *      tiers ran). We pay the heavy compute once, then reap savings for the
 *      whole TTL window.
 *
 * TTL is configured via VERIFIED_MATCH_TTL_DAYS (default 180 / ~6 months).
 * Like the 14-day ScannedProduct cache, expiry is enforced at query time —
 * stale rows are simply ignored, never eagerly deleted.
 *
 * Every function here is defensive: a DB hiccup must never break the analyze
 * pipeline, so reads return null and writes swallow on failure.
 */

import { prisma } from "@/lib/prisma";
import { normalizeProductUrl } from "@/lib/cache/product-cache";
import {
  parseAliExpressData,
  type AliExpressProductData,
} from "@/lib/types/analyze";
import { Prisma, type VerifiedProductMap } from "@prisma/client";

export const DEFAULT_VERIFIED_MATCH_TTL_DAYS = 180;

export type VerifiedMatchSource = "user_feedback" | "auto_high_confidence";

/** Resolve the configurable TTL (days). Falls back to 180 on missing/invalid env. */
export function getVerifiedMatchTtlDays(): number {
  const raw = process.env.VERIFIED_MATCH_TTL_DAYS;
  if (!raw) return DEFAULT_VERIFIED_MATCH_TTL_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_VERIFIED_MATCH_TTL_DAYS;
}

export function isVerifiedMatchValid(
  verifiedAt: Date,
  now: Date = new Date(),
): boolean {
  const ttlMs = getVerifiedMatchTtlDays() * 24 * 60 * 60 * 1000;
  return now.getTime() - verifiedAt.getTime() < ttlMs;
}

function safeNormalize(rawUrl: string): string | null {
  try {
    return normalizeProductUrl(rawUrl);
  } catch {
    return null;
  }
}

export interface VerifiedMatchHit {
  row: VerifiedProductMap;
  aliexpressData: AliExpressProductData;
}

/**
 * Hot-path lookup. Returns a hit only when a row exists, is within TTL, and
 * carries a parseable supplier snapshot. Bumps the hit counter fire-and-forget
 * (never awaited — never blocks the response).
 */
export async function findVerifiedMatch(
  rawUrl: string,
): Promise<VerifiedMatchHit | null> {
  const normalizedUrl = safeNormalize(rawUrl);
  if (!normalizedUrl) return null;

  const row = await prisma.verifiedProductMap
    .findUnique({ where: { originalUrl: normalizedUrl } })
    .catch(() => null);

  if (!row || !isVerifiedMatchValid(row.verifiedAt)) return null;
  if (!row.aliexpressUrl) return null;

  const aliexpressData = parseAliExpressData(row.aliexpressData);
  if (!aliexpressData) return null;

  // Fire-and-forget hit accounting — useful for monitoring cache effectiveness.
  void prisma.verifiedProductMap
    .update({
      where: { id: row.id },
      data: { hits: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {
      /* swallow — accounting must never break the hot path */
    });

  return { row, aliexpressData };
}

/**
 * Upsert a verified mapping. Resets `verifiedAt` to now on every write so a
 * fresh confirmation (or re-verification) restarts the TTL window.
 *
 * Never throws — returns false on failure so callers can fire-and-forget.
 */
export async function recordVerifiedMatch(params: {
  originalUrl: string;
  aliexpressUrl: string;
  aliexpressData: AliExpressProductData;
  source: VerifiedMatchSource;
  scanId?: string | null;
  aliexpressProductId?: string | null;
  matchConfidence?: number | null;
  matchQuality?: string | null;
}): Promise<boolean> {
  const normalizedUrl = safeNormalize(params.originalUrl);
  if (!normalizedUrl || !params.aliexpressUrl) return false;

  // Store the supplier snapshot verbatim. parseAliExpressData reads it back
  // defensively on the hot path, so a plain JSON object is sufficient.
  const dataJson = params.aliexpressData as unknown as Prisma.InputJsonObject;
  const now = new Date();

  try {
    await prisma.verifiedProductMap.upsert({
      where: { originalUrl: normalizedUrl },
      create: {
        originalUrl: normalizedUrl,
        scanId: params.scanId ?? null,
        aliexpressProductId: params.aliexpressProductId ?? null,
        aliexpressUrl: params.aliexpressUrl,
        aliexpressData: dataJson,
        matchConfidence: params.matchConfidence ?? null,
        matchQuality: params.matchQuality ?? null,
        source: params.source,
        verifiedAt: now,
        lastHitAt: now,
      },
      update: {
        scanId: params.scanId ?? undefined,
        aliexpressProductId: params.aliexpressProductId ?? undefined,
        aliexpressUrl: params.aliexpressUrl,
        aliexpressData: dataJson,
        matchConfidence: params.matchConfidence ?? undefined,
        matchQuality: params.matchQuality ?? undefined,
        source: params.source,
        verifiedAt: now,
      },
    });
    return true;
  } catch (err) {
    console.error("[verified-map] record failed", err);
    return false;
  }
}

/**
 * Remove any verified mapping for this URL. Called when a user marks a match
 * "wrong" — we must never keep serving a wrong supplier on the hot path. The
 * raw scrape (FetchedPage + ScannedProduct.scrapeData) is intentionally left
 * intact so a re-scan never re-fetches the retail page.
 */
export async function invalidateVerifiedMatch(rawUrl: string): Promise<void> {
  const normalizedUrl = safeNormalize(rawUrl);
  if (!normalizedUrl) return;
  await prisma.verifiedProductMap
    .deleteMany({ where: { originalUrl: normalizedUrl } })
    .catch(() => {
      /* swallow */
    });
}
