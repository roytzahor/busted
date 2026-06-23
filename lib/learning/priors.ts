/**
 * Learned-priors read-path — Sprint 13.
 *
 * The hot path (analyze pipeline + scrape router) calls these getters to
 * retrieve per-domain scrape recipes and per-vertical keyword priors. We
 * cache the full snapshot in module-level Maps with a 5-minute TTL so a
 * warm Vercel instance does at most one SELECT per snapshot lifetime.
 *
 * On cache miss or expiry we issue a single batch query for the table.
 * Returning stale data on transient DB errors is intentional — the
 * pipeline must keep working even if the learning DB is down.
 *
 * IMPORTANT: never throw from these functions. Callers expect
 * `getDomainRecipe()` and `getVerticalPrior()` to return null on any
 * error so they can fall back to defaults.
 */

import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface DomainRecipe {
  domain: string;
  preferredProvider: "crawlbase" | "firecrawl" | "playwright" | null;
  skipProvider: "crawlbase" | "firecrawl" | "playwright" | null;
  totalScans: number;
  successfulScans: number;
}

export interface KeywordPriorEntry {
  kw: string;
  winRate: number;
  sampleSize: number;
  clickRate: number;
}

export interface VerticalPrior {
  vertical: string;
  topKeywords: KeywordPriorEntry[];
  bannedKeywords: string[];
  imageMatchThreshold: number;
  textConfidenceMin: number;
  totalSamples: number;
  positiveSamples: number;
  bestEffortClickRate: number | null;
}

interface CacheSnapshot<T> {
  loadedAt: number;
  data: Map<string, T>;
}

let domainSnapshot: CacheSnapshot<DomainRecipe> | null = null;
let verticalSnapshot: CacheSnapshot<VerticalPrior> | null = null;
let domainLoad: Promise<void> | null = null;
let verticalLoad: Promise<void> | null = null;

function isExpired<T>(snap: CacheSnapshot<T> | null): boolean {
  if (!snap) return true;
  return Date.now() - snap.loadedAt > CACHE_TTL_MS;
}

function normaliseProvider(
  value: string | null,
): "crawlbase" | "firecrawl" | "playwright" | null {
  if (value === "crawlbase" || value === "firecrawl" || value === "playwright") {
    return value;
  }
  return null;
}

function parseKeywordPriorList(value: unknown): KeywordPriorEntry[] {
  if (!Array.isArray(value)) return [];
  const out: KeywordPriorEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.kw !== "string") continue;
    out.push({
      kw: obj.kw,
      winRate: typeof obj.winRate === "number" ? obj.winRate : 0,
      sampleSize: typeof obj.sampleSize === "number" ? obj.sampleSize : 0,
      clickRate: typeof obj.clickRate === "number" ? obj.clickRate : 0,
    });
  }
  return out;
}

function parseBannedKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

async function loadDomainSnapshot(): Promise<void> {
  try {
    const rows = await prisma.domainScrapeRecipe.findMany({
      select: {
        domain: true,
        preferredProvider: true,
        skipProvider: true,
        totalScans: true,
        successfulScans: true,
      },
    });
    const map = new Map<string, DomainRecipe>();
    for (const row of rows) {
      map.set(row.domain, {
        domain: row.domain,
        preferredProvider: normaliseProvider(row.preferredProvider),
        skipProvider: normaliseProvider(row.skipProvider),
        totalScans: row.totalScans,
        successfulScans: row.successfulScans,
      });
    }
    domainSnapshot = { loadedAt: Date.now(), data: map };
  } catch (err) {
    console.warn(
      "[priors] domain snapshot load failed:",
      err instanceof Error ? err.message : err,
    );
    // Keep the existing (stale) snapshot if we had one; otherwise install
    // an empty snapshot with a short TTL so we retry sooner.
    if (!domainSnapshot) {
      domainSnapshot = {
        loadedAt: Date.now() - CACHE_TTL_MS + 30_000,
        data: new Map(),
      };
    }
  }
}

async function loadVerticalSnapshot(): Promise<void> {
  try {
    const rows = await prisma.verticalKeywordPrior.findMany({
      select: {
        vertical: true,
        topKeywords: true,
        bannedKeywords: true,
        imageMatchThreshold: true,
        textConfidenceMin: true,
        totalSamples: true,
        positiveSamples: true,
        bestEffortClickRate: true,
      },
    });
    const map = new Map<string, VerticalPrior>();
    for (const row of rows) {
      map.set(row.vertical, {
        vertical: row.vertical,
        topKeywords: parseKeywordPriorList(row.topKeywords),
        bannedKeywords: parseBannedKeywordList(row.bannedKeywords),
        imageMatchThreshold: row.imageMatchThreshold,
        textConfidenceMin: row.textConfidenceMin,
        totalSamples: row.totalSamples,
        positiveSamples: row.positiveSamples,
        bestEffortClickRate: row.bestEffortClickRate,
      });
    }
    verticalSnapshot = { loadedAt: Date.now(), data: map };
  } catch (err) {
    console.warn(
      "[priors] vertical snapshot load failed:",
      err instanceof Error ? err.message : err,
    );
    if (!verticalSnapshot) {
      verticalSnapshot = {
        loadedAt: Date.now() - CACHE_TTL_MS + 30_000,
        data: new Map(),
      };
    }
  }
}

async function ensureDomainFresh(): Promise<void> {
  if (!isExpired(domainSnapshot)) return;
  if (!domainLoad) {
    domainLoad = loadDomainSnapshot().finally(() => {
      domainLoad = null;
    });
  }
  await domainLoad;
}

async function ensureVerticalFresh(): Promise<void> {
  if (!isExpired(verticalSnapshot)) return;
  if (!verticalLoad) {
    verticalLoad = loadVerticalSnapshot().finally(() => {
      verticalLoad = null;
    });
  }
  await verticalLoad;
}

/**
 * Extract the domain key we use for DomainScrapeRecipe lookups.
 * Lowercased host, no port, with `www.` stripped so cookie-cutter Shopify
 * stores that vary `www.` presence still share one recipe row.
 */
export function domainFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.host.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Returns the per-domain scrape recipe, or null when no prior exists yet. */
export async function getDomainRecipe(
  domain: string,
): Promise<DomainRecipe | null> {
  await ensureDomainFresh();
  return domainSnapshot?.data.get(domain) ?? null;
}

/** Returns the per-vertical learned prior, or null when nothing's been learned yet. */
export async function getVerticalPrior(
  vertical: string,
): Promise<VerticalPrior | null> {
  await ensureVerticalFresh();
  return verticalSnapshot?.data.get(vertical) ?? null;
}

/**
 * Cache-busting hook used by the recompute cron after a successful aggregation.
 * Clears both snapshots so the next read forces a fresh DB pull.
 */
export function invalidatePriorsCache(): void {
  domainSnapshot = null;
  verticalSnapshot = null;
}

/** Debug helper — surfaces current snapshot age + size for /monitoring. */
export function getPriorsCacheStatus(): {
  domain: { ageMs: number; size: number } | null;
  vertical: { ageMs: number; size: number } | null;
} {
  return {
    domain: domainSnapshot
      ? {
          ageMs: Date.now() - domainSnapshot.loadedAt,
          size: domainSnapshot.data.size,
        }
      : null,
    vertical: verticalSnapshot
      ? {
          ageMs: Date.now() - verticalSnapshot.loadedAt,
          size: verticalSnapshot.data.size,
        }
      : null,
  };
}
