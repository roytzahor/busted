import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

export const MIN_SELLER_RATING = 4.5;

export function rankAliExpressCandidates(
  candidates: AliExpressProductCandidate[],
): AliExpressProductCandidate[] {
  const qualified = candidates.filter(
    (candidate) => candidate.sellerRating >= MIN_SELLER_RATING,
  );

  const pool = qualified.length > 0 ? qualified : candidates;

  return [...pool].sort((left, right) => {
    if (right.orderCount !== left.orderCount) {
      return right.orderCount - left.orderCount;
    }

    if (right.sellerRating !== left.sellerRating) {
      return right.sellerRating - left.sellerRating;
    }

    const leftShipping = left.shippingDays ?? 999;
    const rightShipping = right.shippingDays ?? 999;
    return leftShipping - rightShipping;
  });
}

export function parseEvaluateRateToStars(evaluateRate: string | undefined): number {
  if (!evaluateRate) return 0;

  const numeric = Number.parseFloat(evaluateRate.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;

  if (numeric <= 5) return numeric;
  if (numeric <= 100) return Math.round((numeric / 100) * 50) / 10;

  return 0;
}
