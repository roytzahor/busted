/**
 * Affiliate-link reputation tracking for AliExpress suppliers.
 *
 * Records whether the affiliate link for a given (productId, shipToCountry)
 * pair validated successfully. Over time this surfaces products whose links
 * reliably fail for specific markets — typically because the seller has not
 * enabled their listing for the AliExpress affiliate program in that country.
 *
 * Penalty logic (applied in find-supplier.ts):
 *   total = linkFailures + linkSuccesses
 *   if total >= MIN_OUTCOMES_FOR_PENALTY && (linkFailures / total) > FAILURE_RATE_THRESHOLD
 *     → multiply match confidence by REPUTATION_PENALTY_MULTIPLIER
 *
 * Writes are fire-and-forget — never block the response path.
 */

import { prisma } from "@/lib/prisma";

/** Minimum recorded outcomes before the penalty can fire. Avoids penalising
 *  a product after a single transient failure. */
export const MIN_OUTCOMES_FOR_PENALTY = 5;

/** Failure rate above which the penalty multiplier is applied. */
export const FAILURE_RATE_THRESHOLD = 0.8;

/** Score multiplier applied to candidates with a bad reputation. */
export const REPUTATION_PENALTY_MULTIPLIER = 0.7;

export interface SupplierReputationRow {
  productId: string;
  shipToCountry: string;
  linkFailures: number;
  linkSuccesses: number;
  lastFailedAt: Date | null;
  lastCheckedAt: Date;
}

/**
 * Fetch reputation rows for the given product IDs and country in one query.
 * Returns an empty Map on any DB error — never throws.
 */
export async function getReputationForProducts(
  productIds: string[],
  shipToCountry: string,
): Promise<Map<string, SupplierReputationRow>> {
  if (productIds.length === 0) return new Map();
  try {
    const rows = await prisma.supplierReputation.findMany({
      where: {
        productId: { in: productIds },
        shipToCountry,
      },
      select: {
        productId: true,
        shipToCountry: true,
        linkFailures: true,
        linkSuccesses: true,
        lastFailedAt: true,
        lastCheckedAt: true,
      },
    });
    return new Map(rows.map((r) => [r.productId, r]));
  } catch {
    return new Map();
  }
}

/**
 * Record the outcome of an affiliate-link validation. Fire-and-forget —
 * call without `await`. Never throws to the caller.
 */
export function recordLinkOutcome(
  productId: string,
  shipToCountry: string,
  validated: boolean,
): void {
  const now = new Date();
  const successUpdate = { linkSuccesses: { increment: 1 }, lastCheckedAt: now };
  const failureUpdate = { linkFailures: { increment: 1 }, lastFailedAt: now, lastCheckedAt: now };

  prisma.supplierReputation
    .upsert({
      where: { productId_shipToCountry: { productId, shipToCountry } },
      create: {
        productId,
        shipToCountry,
        linkFailures: validated ? 0 : 1,
        linkSuccesses: validated ? 1 : 0,
        lastFailedAt: validated ? null : now,
        lastCheckedAt: now,
      },
      update: validated ? successUpdate : failureUpdate,
    })
    .catch((err) => {
      console.warn("[reputation] recordLinkOutcome failed:", err instanceof Error ? err.message : err);
    });
}

/**
 * Returns a human-readable reason string when a product should be penalised,
 * or null when the reputation is clean / insufficient data.
 */
export function buildReputationPenaltyReason(
  rep: SupplierReputationRow,
): string | null {
  const total = rep.linkFailures + rep.linkSuccesses;
  if (total < MIN_OUTCOMES_FOR_PENALTY) return null;
  const rate = rep.linkFailures / total;
  if (rate <= FAILURE_RATE_THRESHOLD) return null;
  return (
    `Reputation penalty (${(rate * 100).toFixed(0)}% link failures for ` +
    `${rep.shipToCountry}, ${total} samples)`
  );
}
