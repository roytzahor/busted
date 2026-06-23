/**
 * Fire-and-forget MatchOutcome recorder — Sprint 13.
 *
 * Called from /api/analyze at the very end of every pipeline run (both the
 * cache-hit and live-scrape paths). Captures the signals the learning cron
 * needs to build per-domain and per-vertical priors.
 *
 * IMPORTANT: never awaited by the caller. Never throws. A DB outage must
 * not break the analyze response.
 */

import { prisma } from "@/lib/prisma";
import { domainFromUrl } from "@/lib/learning/priors";

export interface MatchOutcomeInput {
  scanId?: string | null;
  originalUrl: string;
  category?: string | null;
  vertical?: string | null;
  scrapeProvider?: string | null;
  verdict?: string | null;
  matchConfidence?: number | null;
  matchQuality?: string | null;
  bestEffortOnly?: boolean;
  winningKeywords?: string[];
  imageMatchScore?: number | null;
  sameFunction?: boolean | null;
}

export function recordMatchOutcome(input: MatchOutcomeInput): void {
  const domain = domainFromUrl(input.originalUrl);
  if (!domain) return; // bad URL — nothing to learn

  const winning = (input.winningKeywords ?? [])
    .map((k) => k.toLowerCase().trim())
    .filter((k, i, arr) => k.length > 0 && arr.indexOf(k) === i)
    .slice(0, 12);

  prisma.matchOutcome
    .create({
      data: {
        scanId: input.scanId ?? undefined,
        domain,
        category: input.category ?? undefined,
        vertical: input.vertical ?? undefined,
        scrapeProvider: input.scrapeProvider ?? undefined,
        verdict: input.verdict ?? undefined,
        matchConfidence: input.matchConfidence ?? undefined,
        matchQuality: input.matchQuality ?? undefined,
        bestEffortOnly: input.bestEffortOnly ?? false,
        winningKeywords: winning,
        imageMatchScore: input.imageMatchScore ?? undefined,
        sameFunction: input.sameFunction ?? undefined,
      },
    })
    .catch((err) => {
      console.warn(
        "[learning] recordMatchOutcome failed:",
        err instanceof Error ? err.message : err,
      );
    });
}
