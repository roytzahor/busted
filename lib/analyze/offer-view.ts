/**
 * What the supplier offer is allowed to say — spec 0002 (agent-os/specs/0002-honest-offer).
 *
 * The result view renders this, not the raw comparison, so every honesty rule
 * lives in one pure, testable place:
 *
 * - Unknown stays unknown. No store price is estimated, no trust metric is
 *   defaulted, no saving is derived from a guess.
 * - A saving is a real, positive delta between two known prices for the same
 *   product. A best-effort "closest match" is a different product, so its price
 *   difference is not a saving.
 * - Identity wording follows evidence: "same" needs a Gold Path hit or a
 *   `high` match that the image AI positively confirmed.
 * - The tier, computed server-side, decides whether there is an offer at all,
 *   and how hard the copy may accuse (trust/presence-tier-contract).
 */
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import { computePresenceTier, type PresenceTier } from "@/lib/analyze/presence-tier";
import type { ProductComparisonResult } from "@/lib/mock-data";

export type MatchKind = "same" | "likely" | "closest";

export interface OfferView {
  /** False at `silent` (or a missing tier): render the quiet line only. */
  show: boolean;
  tier: PresenceTier;
  matchKind: MatchKind;
  networkLabel: string;
  /** Short card label, e.g. "Same product on AliExpress". */
  supplierLabel: string;
  storePriceUsd: number | null;
  supplierPriceUsd: number | null;
  savingsUsd: number | null;
  savingsPercent: number | null;
  /** Only the metrics the supplier source actually provided. */
  trust: { orderCount?: number; sellerRating?: number; shippingDays?: number };
  /** Destination for the CTA, or null — never a placeholder. */
  ctaHref: string | null;
  ctaLabel: string;
}

/**
 * Mirrors the image-verification bar the result view has always used for the
 * "Image-verified" badge: a strong score is not enough on its own, the model
 * must also have positively confirmed the same function.
 */
export const IMAGE_VERIFIED_MIN_SCORE = 0.7;

function knownPrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The one savings formula. `null` means "we cannot claim a saving" — distinct
 * from a real zero, which is also not a saving and is likewise `null` here
 * because no saving claim may be made from it.
 */
export function computeSavings(
  storePriceUsd: number | null | undefined,
  supplierPriceUsd: number | null | undefined,
  bestEffortOnly: boolean | undefined,
): { savingsUsd: number | null; savingsPercent: number | null } {
  const store = knownPrice(storePriceUsd);
  const supplier = knownPrice(supplierPriceUsd);
  if (store === null || supplier === null || bestEffortOnly === true || supplier >= store) {
    return { savingsUsd: null, savingsPercent: null };
  }
  const savingsUsd = Math.round((store - supplier) * 100) / 100;
  return { savingsUsd, savingsPercent: Math.round((savingsUsd / store) * 100) };
}

function networkLabelFor(network: ProductComparisonResult["supplierNetwork"]): string {
  switch (network) {
    case "ebay":
      return "eBay";
    case "amazon":
      return "Amazon";
    default:
      return "AliExpress";
  }
}

function safeHref(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  // Only real web destinations — "#", relative paths and javascript: URLs are
  // not somewhere we can send a buyer.
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function matchKindFor(c: ProductComparisonResult): MatchKind {
  if (c.verified === true) return "same";
  if (c.bestEffortOnly === true) return "closest";
  const imageConfirmed =
    typeof c.imageMatchScore === "number" &&
    c.imageMatchScore >= IMAGE_VERIFIED_MIN_SCORE &&
    c.imageMatchSameFunction === true;
  return c.matchQuality === "high" && imageConfirmed ? "same" : "likely";
}

export function buildOfferView(c: ProductComparisonResult): OfferView {
  // Missing tier degrades to silent, never promotes (presence-tier contract).
  const tier: PresenceTier = c.presenceTier ?? "silent";
  const matchKind = matchKindFor(c);
  const networkLabel = networkLabelFor(c.supplierNetwork);
  const storePriceUsd = knownPrice(c.storeProduct.priceUsd);
  const supplierPriceUsd = knownPrice(c.supplierProduct.priceUsd);
  const { savingsUsd, savingsPercent } = computeSavings(
    storePriceUsd,
    supplierPriceUsd,
    matchKind === "closest",
  );

  const trust: OfferView["trust"] = {};
  const sp = c.supplierProduct;
  // Zero is how marketplaces say "no data" (unrated, unsold, unknown ETA) —
  // printing "0★" or "0+ orders" would be a claim, not an absence.
  if (knownPrice(sp.orderCount) !== null) trust.orderCount = sp.orderCount;
  if (knownPrice(sp.sellerRating) !== null) trust.sellerRating = sp.sellerRating;
  if (knownPrice(sp.shippingDays) !== null) trust.shippingDays = sp.shippingDays;

  const supplierLabel =
    matchKind === "same"
      ? `Same product on ${networkLabel}`
      : matchKind === "likely"
        ? `Likely match on ${networkLabel}`
        : `Closest match on ${networkLabel}`;

  const ctaLabel =
    savingsUsd !== null && matchKind !== "closest"
      ? `Buy on ${networkLabel} & save`
      : `View on ${networkLabel}`;

  return {
    show: tier !== "silent",
    tier,
    matchKind,
    networkLabel,
    supplierLabel,
    storePriceUsd,
    supplierPriceUsd,
    savingsUsd,
    savingsPercent,
    trust,
    // No benefit, no link: when both prices are known and the supplier is not
    // cheaper, an affiliate link only earns us money (spec 0002, REQ-8). With
    // an unknown store price the link stays: the user can still compare, and
    // the copy makes no saving claim.
    ctaHref:
      storePriceUsd !== null && supplierPriceUsd !== null && supplierPriceUsd >= storePriceUsd
        ? null
        : safeHref(sp.affiliateUrl),
    ctaLabel,
  };
}

/**
 * Savings a public or shared surface may repeat about a stored scan (trending
 * grid, share card): only for a scan whose own tier speaks, and only from a
 * real delta. A silent scan's cheaper listing is never advertised — on a
 * `legit` store that would be a public accusation by implication
 * (trust/public-accusation, spec 0002 REQ-10).
 */
export function claimableSavings(args: {
  prediction: DropshipPrediction | null | undefined;
  storePriceUsd: number | null | undefined;
  supplierPriceUsd: number | null | undefined;
  bestEffortOnly?: boolean;
}): { savingsUsd: number; savingsPercent: number } | null {
  if (computePresenceTier(args.prediction) === "silent") return null;
  const s = computeSavings(args.storePriceUsd, args.supplierPriceUsd, args.bestEffortOnly);
  return s.savingsUsd !== null && s.savingsPercent !== null
    ? { savingsUsd: s.savingsUsd, savingsPercent: s.savingsPercent }
    : null;
}
