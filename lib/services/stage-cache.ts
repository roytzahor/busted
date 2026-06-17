/**
 * Per-stage cache for the pipeline.
 *
 * Each stage (identifier, verdict, search, match) caches its output keyed
 * by sha256(stage + promptVersion + inputHash). Lets us re-run individual
 * stages without re-scraping or re-running upstream Gemini calls.
 *
 * Phase 1 lands the helper as a NO-OP (reads always miss, writes are
 * skipped) so the route can adopt cacheOrRun without changing behavior.
 * Phase 6 flips on actual reads and writes.
 *
 * The existing per-URL ScannedProduct cache stays the top-level fast path —
 * stage cache is only consulted on cache MISS at the outer level.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60;

// Phase 1 default — flipped to true in Phase 6 (env-flagged).
function isStageCacheEnabled(): boolean {
  return process.env.STAGE_CACHE_ENABLED === "true";
}

export function stageHash(
  stage: string,
  promptVersion: string,
  inputHash: string,
): string {
  return createHash("sha256")
    .update(`${stage}:${promptVersion}:${inputHash}`)
    .digest("hex");
}

export interface StageCacheResult<T> {
  payload: T;
  age: number;
}

export async function readStage<T>(
  stage: string,
  promptVersion: string,
  inputHash: string,
): Promise<StageCacheResult<T> | null> {
  if (!isStageCacheEnabled()) return null;

  const key = stageHash(stage, promptVersion, inputHash);
  try {
    const row = await prisma.stageCache.findUnique({ where: { key } });
    if (!row) return null;
    const ageSeconds = Math.round((Date.now() - row.createdAt.getTime()) / 1000);
    if (ageSeconds > row.ttl) return null;
    return { payload: row.payload as T, age: ageSeconds };
  } catch {
    return null;
  }
}

export async function writeStage(
  stage: string,
  promptVersion: string,
  inputHash: string,
  payload: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  if (!isStageCacheEnabled()) return;

  const key = stageHash(stage, promptVersion, inputHash);
  try {
    await prisma.stageCache.upsert({
      where: { key },
      create: {
        key,
        stage,
        payload: payload as never,
        ttl: ttlSeconds,
      },
      update: {
        payload: payload as never,
        ttl: ttlSeconds,
        createdAt: new Date(),
      },
    });
  } catch {
    // Stage cache is best-effort — never break the pipeline on a write failure.
  }
}

/**
 * Read-or-compute helper. Pass a function that produces the payload on
 * miss; if cache hit, the function is never called.
 *
 * Returns `{ payload, cacheHit }` so callers can attribute latency
 * correctly in their ServiceEvent emissions.
 */
export async function cacheOrRun<T>(
  stage: string,
  promptVersion: string,
  inputHash: string,
  compute: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<{ payload: T; cacheHit: boolean }> {
  const cached = await readStage<T>(stage, promptVersion, inputHash);
  if (cached) {
    return { payload: cached.payload, cacheHit: true };
  }
  const payload = await compute();
  await writeStage(stage, promptVersion, inputHash, payload, ttlSeconds);
  return { payload, cacheHit: false };
}
