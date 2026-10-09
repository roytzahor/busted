/**
 * Scoring a store-price source against hand-labelled truth — spec 0003.
 *
 * Four outcomes, because they fail differently:
 *   correct     — within tolerance of the truth (or both say "no price")
 *   wrong       — a price, but not this product's price (the agas-tamar $30)
 *   false_price — a price on a page that has no single product price
 *   missed      — no price where the truth has one (silence: the safe miss)
 */
import { convertToUsd, type CurrencyCode } from "@/lib/currency";

export type PriceTruth = { amount: number; currency: CurrencyCode } | null;
export type PriceOutcome = "correct" | "wrong" | "false_price" | "missed";

/**
 * 2% absorbs FX-snapshot drift and `.92`-style rounding (3121.92 vs ₪3,122)
 * without accepting another product's price.
 */
export const PRICE_TOLERANCE = 0.02;

export function scorePrice(
  truth: PriceTruth,
  candidateUsd: number | null | undefined,
  tolerance: number = PRICE_TOLERANCE,
): PriceOutcome {
  const candidate =
    typeof candidateUsd === "number" && Number.isFinite(candidateUsd) && candidateUsd > 0
      ? candidateUsd
      : null;
  if (truth === null) return candidate === null ? "correct" : "false_price";
  if (candidate === null) return "missed";
  const truthUsd = convertToUsd(truth.amount, truth.currency);
  return Math.abs(candidate - truthUsd) / truthUsd <= tolerance ? "correct" : "wrong";
}

export interface PriceTally {
  correct: number;
  wrong: number;
  false_price: number;
  missed: number;
}

export function emptyTally(): PriceTally {
  return { correct: 0, wrong: 0, false_price: 0, missed: 0 };
}
