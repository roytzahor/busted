/**
 * Learning-loop recomputation — Sprint 13.
 *
 * Aggregates MatchOutcome + MatchFeedback + AffiliateClick rows from the
 * last LOOKBACK_DAYS into per-domain and per-vertical priors. Replaces the
 * full prior tables atomically per row (upsert).
 *
 * Designed to run under a Vercel cron with 60s max duration:
 *   - One query per source table (3 total reads)
 *   - All aggregation is in-process JS (cheap)
 *   - One upsert per prior row (bounded by domain + vertical cardinality)
 *
 * Never throws — recompute failures must not page anyone.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidatePriorsCache } from "@/lib/learning/priors";
import { deriveOutcomeVertical } from "@/lib/aliexpress/category-map";

const LOOKBACK_DAYS = 14;
const MIN_PROVIDER_SAMPLES = 3;
const PROVIDER_SKIP_FAILURE_RATE = 0.5;
const MIN_KEYWORD_SAMPLES = 3;
const BANNED_KEYWORD_LOSS_RATE = 0.6;
const TOP_KEYWORD_LIMIT = 12;
const MIN_VERTICAL_SAMPLES_FOR_THRESHOLD = 10;
const DEFAULT_IMAGE_MATCH_THRESHOLD = 0.65;
const DEFAULT_TEXT_CONFIDENCE_MIN = 0.4;

type ProviderName = "crawlbase" | "firecrawl" | "playwright";

interface OutcomeRow {
  id: string;
  scanId: string | null;
  domain: string;
  category: string | null;
  vertical: string | null;
  scrapeProvider: string | null;
  matchConfidence: number | null;
  matchQuality: string | null;
  bestEffortOnly: boolean;
  winningKeywords: string[];
  imageMatchScore: number | null;
  sameFunction: boolean | null;
  createdAt: Date;
}

interface FeedbackRow {
  scanId: string;
  verdict: string;
}

interface ClickRow {
  scanId: string | null;
}

export interface RecomputeResult {
  outcomesScanned: number;
  domainsUpdated: number;
  verticalsUpdated: number;
  feedbackJoined: number;
  clicksJoined: number;
  durationMs: number;
}

export async function recomputePriors(): Promise<RecomputeResult> {
  const start = Date.now();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let outcomes: OutcomeRow[] = [];
  let feedback: FeedbackRow[] = [];
  let clicks: ClickRow[] = [];

  try {
    outcomes = await prisma.matchOutcome.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        scanId: true,
        domain: true,
        category: true,
        vertical: true,
        scrapeProvider: true,
        matchConfidence: true,
        matchQuality: true,
        bestEffortOnly: true,
        winningKeywords: true,
        imageMatchScore: true,
        sameFunction: true,
        createdAt: true,
      },
    });
    feedback = await prisma.matchFeedback.findMany({
      where: { createdAt: { gte: since } },
      select: { scanId: true, verdict: true },
    });
    clicks = await prisma.affiliateClick.findMany({
      where: { createdAt: { gte: since } },
      select: { scanId: true },
    });
  } catch (err) {
    console.error(
      "[learning] recompute read failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      outcomesScanned: 0,
      domainsUpdated: 0,
      verticalsUpdated: 0,
      feedbackJoined: 0,
      clicksJoined: 0,
      durationMs: Date.now() - start,
    };
  }

  const feedbackByScan = new Map<string, FeedbackRow["verdict"]>();
  for (const row of feedback) feedbackByScan.set(row.scanId, row.verdict);

  const clicksByScan = new Set<string>();
  for (const row of clicks) {
    if (row.scanId) clicksByScan.add(row.scanId);
  }

  const { domainStats, domainCount } = aggregateDomains(outcomes, feedbackByScan);
  const { verticalStats, verticalCount } = aggregateVerticals(
    outcomes,
    feedbackByScan,
    clicksByScan,
  );

  // Upserts. Each is bounded — domain cardinality ≤ thousands, vertical ≤ dozens.
  await Promise.all(
    Array.from(domainStats.values()).map((s) =>
      prisma.domainScrapeRecipe
        .upsert({
          where: { domain: s.domain },
          create: {
            domain: s.domain,
            preferredProvider: s.preferredProvider,
            skipProvider: s.skipProvider,
            providerWinRates: s.providerWinRates,
            totalScans: s.totalScans,
            successfulScans: s.successfulScans,
            lastComputedAt: new Date(),
          },
          update: {
            preferredProvider: s.preferredProvider,
            skipProvider: s.skipProvider,
            providerWinRates: s.providerWinRates,
            totalScans: s.totalScans,
            successfulScans: s.successfulScans,
            lastComputedAt: new Date(),
          },
        })
        .catch((err) => {
          console.warn(
            `[learning] domain upsert failed for ${s.domain}:`,
            err instanceof Error ? err.message : err,
          );
        }),
    ),
  );

  await Promise.all(
    Array.from(verticalStats.values()).map((s) =>
      prisma.verticalKeywordPrior
        .upsert({
          where: { vertical: s.vertical },
          create: {
            vertical: s.vertical,
            topKeywords: s.topKeywords as unknown as Prisma.InputJsonValue,
            bannedKeywords: s.bannedKeywords as unknown as Prisma.InputJsonValue,
            imageMatchThreshold: s.imageMatchThreshold,
            textConfidenceMin: s.textConfidenceMin,
            totalSamples: s.totalSamples,
            positiveSamples: s.positiveSamples,
            bestEffortClickRate: s.bestEffortClickRate,
            lastComputedAt: new Date(),
          },
          update: {
            topKeywords: s.topKeywords as unknown as Prisma.InputJsonValue,
            bannedKeywords: s.bannedKeywords as unknown as Prisma.InputJsonValue,
            imageMatchThreshold: s.imageMatchThreshold,
            textConfidenceMin: s.textConfidenceMin,
            totalSamples: s.totalSamples,
            positiveSamples: s.positiveSamples,
            bestEffortClickRate: s.bestEffortClickRate,
            lastComputedAt: new Date(),
          },
        })
        .catch((err) => {
          console.warn(
            `[learning] vertical upsert failed for ${s.vertical}:`,
            err instanceof Error ? err.message : err,
          );
        }),
    ),
  );

  invalidatePriorsCache();

  return {
    outcomesScanned: outcomes.length,
    domainsUpdated: domainCount,
    verticalsUpdated: verticalCount,
    feedbackJoined: feedbackByScan.size,
    clicksJoined: clicksByScan.size,
    durationMs: Date.now() - start,
  };
}

interface DomainStat {
  domain: string;
  totalScans: number;
  successfulScans: number;
  providerWinRates: Record<string, number>;
  preferredProvider: string | null;
  skipProvider: string | null;
}

function aggregateDomains(
  outcomes: OutcomeRow[],
  feedbackByScan: Map<string, string>,
): { domainStats: Map<string, DomainStat>; domainCount: number } {
  // domain → provider → { success, total }
  const domainBuckets = new Map<
    string,
    {
      total: number;
      successful: number;
      providerCounts: Map<string, { success: number; total: number }>;
    }
  >();

  for (const o of outcomes) {
    if (!o.domain) continue;
    let bucket = domainBuckets.get(o.domain);
    if (!bucket) {
      bucket = { total: 0, successful: 0, providerCounts: new Map() };
      domainBuckets.set(o.domain, bucket);
    }
    bucket.total += 1;
    const success = isOutcomeSuccessful(o, feedbackByScan);
    if (success) bucket.successful += 1;

    if (o.scrapeProvider) {
      let pc = bucket.providerCounts.get(o.scrapeProvider);
      if (!pc) {
        pc = { success: 0, total: 0 };
        bucket.providerCounts.set(o.scrapeProvider, pc);
      }
      pc.total += 1;
      if (success) pc.success += 1;
    }
  }

  const stats = new Map<string, DomainStat>();
  for (const [domain, bucket] of domainBuckets.entries()) {
    const winRates: Record<string, number> = {};
    let bestProvider: { name: string; rate: number; samples: number } | null = null;
    let worstProvider: { name: string; failureRate: number; samples: number } | null = null;
    for (const [provider, pc] of bucket.providerCounts.entries()) {
      const rate = pc.total > 0 ? pc.success / pc.total : 0;
      winRates[provider] = +rate.toFixed(3);
      if (pc.total >= MIN_PROVIDER_SAMPLES) {
        if (!bestProvider || rate > bestProvider.rate) {
          bestProvider = { name: provider, rate, samples: pc.total };
        }
        const failureRate = 1 - rate;
        if (
          failureRate >= PROVIDER_SKIP_FAILURE_RATE &&
          (!worstProvider || failureRate > worstProvider.failureRate)
        ) {
          worstProvider = { name: provider, failureRate, samples: pc.total };
        }
      }
    }

    stats.set(domain, {
      domain,
      totalScans: bucket.total,
      successfulScans: bucket.successful,
      providerWinRates: winRates,
      preferredProvider: bestProvider?.name ?? null,
      skipProvider:
        worstProvider && worstProvider.name !== bestProvider?.name
          ? worstProvider.name
          : null,
    });
  }

  return { domainStats: stats, domainCount: stats.size };
}

interface VerticalStat {
  vertical: string;
  topKeywords: KeywordEntry[];
  bannedKeywords: string[];
  imageMatchThreshold: number;
  textConfidenceMin: number;
  totalSamples: number;
  positiveSamples: number;
  bestEffortClickRate: number | null;
}

interface KeywordEntry {
  kw: string;
  winRate: number;
  sampleSize: number;
  clickRate: number;
}

function aggregateVerticals(
  outcomes: OutcomeRow[],
  feedbackByScan: Map<string, string>,
  clicksByScan: Set<string>,
): { verticalStats: Map<string, VerticalStat>; verticalCount: number } {
  const verticalBuckets = new Map<
    string,
    {
      total: number;
      positive: number;
      keywordCounts: Map<
        string,
        { wins: number; losses: number; clicks: number; samples: number }
      >;
      imageScores: number[];
      bestEffortTotal: number;
      bestEffortClicks: number;
    }
  >();

  for (const o of outcomes) {
    // Back-fill nulls by re-deriving from the raw category. Recovers
    // historical rows that were written before deriveOutcomeVertical
    // shipped — they have category but no vertical.
    const vertical = o.vertical ?? deriveOutcomeVertical(o.category);
    if (!vertical) continue;
    let bucket = verticalBuckets.get(vertical);
    if (!bucket) {
      bucket = {
        total: 0,
        positive: 0,
        keywordCounts: new Map(),
        imageScores: [],
        bestEffortTotal: 0,
        bestEffortClicks: 0,
      };
      verticalBuckets.set(vertical, bucket);
    }
    bucket.total += 1;
    const success = isOutcomeSuccessful(o, feedbackByScan);
    const wronged = feedbackByScan.get(o.scanId ?? "") === "wrong";
    if (success) bucket.positive += 1;
    const clicked = o.scanId ? clicksByScan.has(o.scanId) : false;

    if (o.bestEffortOnly) {
      bucket.bestEffortTotal += 1;
      if (clicked) bucket.bestEffortClicks += 1;
    }

    if (typeof o.imageMatchScore === "number") {
      bucket.imageScores.push(o.imageMatchScore);
    }

    for (const rawKw of o.winningKeywords) {
      const kw = rawKw.toLowerCase().trim();
      if (!kw) continue;
      let kc = bucket.keywordCounts.get(kw);
      if (!kc) {
        kc = { wins: 0, losses: 0, clicks: 0, samples: 0 };
        bucket.keywordCounts.set(kw, kc);
      }
      kc.samples += 1;
      if (wronged) kc.losses += 1;
      else if (success) kc.wins += 1;
      if (clicked) kc.clicks += 1;
    }
  }

  const stats = new Map<string, VerticalStat>();
  for (const [vertical, bucket] of verticalBuckets.entries()) {
    const top: KeywordEntry[] = [];
    const banned: string[] = [];
    for (const [kw, kc] of bucket.keywordCounts.entries()) {
      const winRate = kc.samples > 0 ? kc.wins / kc.samples : 0;
      const clickRate = kc.samples > 0 ? kc.clicks / kc.samples : 0;
      const lossRate = kc.samples > 0 ? kc.losses / kc.samples : 0;
      if (
        kc.samples >= MIN_KEYWORD_SAMPLES &&
        lossRate >= BANNED_KEYWORD_LOSS_RATE
      ) {
        banned.push(kw);
        continue;
      }
      if (kc.samples >= MIN_KEYWORD_SAMPLES) {
        top.push({
          kw,
          winRate: +winRate.toFixed(3),
          sampleSize: kc.samples,
          clickRate: +clickRate.toFixed(3),
        });
      }
    }
    top.sort((a, b) => b.winRate * (1 + b.clickRate) - a.winRate * (1 + a.clickRate));
    top.splice(TOP_KEYWORD_LIMIT);

    const imageMatchThreshold = computeImageMatchThreshold(
      bucket.imageScores,
      bucket.total,
      bucket.positive,
    );
    const textConfidenceMin = computeTextConfidenceMin(bucket.total, bucket.positive);

    stats.set(vertical, {
      vertical,
      topKeywords: top,
      bannedKeywords: banned,
      imageMatchThreshold,
      textConfidenceMin,
      totalSamples: bucket.total,
      positiveSamples: bucket.positive,
      bestEffortClickRate:
        bucket.bestEffortTotal > 0
          ? +(bucket.bestEffortClicks / bucket.bestEffortTotal).toFixed(3)
          : null,
    });
  }

  return { verticalStats: stats, verticalCount: stats.size };
}

/**
 * An outcome is "successful" when the user did not mark it wrong AND either:
 *   - they explicitly marked it right/similar, or
 *   - matchConfidence ≥ 0.4 (proxy for "we'd have shown it as a real match")
 */
function isOutcomeSuccessful(
  outcome: OutcomeRow,
  feedbackByScan: Map<string, string>,
): boolean {
  const fb = outcome.scanId ? feedbackByScan.get(outcome.scanId) : undefined;
  if (fb === "wrong") return false;
  if (fb === "right" || fb === "similar") return true;
  return (outcome.matchConfidence ?? 0) >= 0.4;
}

/**
 * Adapt image-match threshold per vertical based on what's working:
 *   - Lots of samples, high positive rate → keep threshold modest (don't over-tighten).
 *   - Lots of samples, low positive rate → raise threshold (we've been too loose).
 *   - Few samples → fall back to default.
 *
 * Threshold is clamped to [0.5, 0.85] so we never disable image-match entirely
 * and never lock out every candidate.
 */
function computeImageMatchThreshold(
  scores: number[],
  total: number,
  positive: number,
): number {
  if (total < MIN_VERTICAL_SAMPLES_FOR_THRESHOLD || scores.length === 0) {
    return DEFAULT_IMAGE_MATCH_THRESHOLD;
  }
  const positiveRate = positive / total;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Anchor on median observed score, nudge by how often we've been right.
  // High positive rate → trust scores around the median (keep threshold slightly below).
  // Low positive rate → push threshold above median to be stricter.
  const delta = (0.6 - positiveRate) * 0.3;
  const raw = median + delta;
  return clamp(+raw.toFixed(2), 0.5, 0.85);
}

function computeTextConfidenceMin(total: number, positive: number): number {
  if (total < MIN_VERTICAL_SAMPLES_FOR_THRESHOLD) {
    return DEFAULT_TEXT_CONFIDENCE_MIN;
  }
  const positiveRate = positive / total;
  // Low positive rate → raise the bar; high positive rate → relax a bit.
  const raw = DEFAULT_TEXT_CONFIDENCE_MIN + (0.6 - positiveRate) * 0.2;
  return clamp(+raw.toFixed(2), 0.3, 0.6);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
