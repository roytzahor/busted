/**
 * Landed-cost engine — deterministic import-cost estimate for a supplier
 * purchase, per destination market (see ROADMAP.md Phase 2).
 *
 * Honesty rules:
 *   - VAT is computed from published rates/thresholds and ADDED to the total.
 *   - Customs duty is NEVER invented — it depends on the HS code we don't
 *     have. Above the duty-free threshold we attach a note, not a number.
 *   - Unknown shipping is treated as 0 with an explicit note, never guessed.
 *
 * The destination market is keyed by the user's display currency
 * (USD→US, ILS→IL, EUR→EU, GBP→UK) — the same picker/cookie the rest of
 * the UI already uses, so there is no separate geo detection to disagree
 * with. Pure module: no network, no env reads beyond lib/currency's FX.
 */

import { convertUsd, type CurrencyCode } from "@/lib/currency";

export interface LandedCostInput {
  /** Supplier item price, USD. */
  itemUsd: number;
  /** Known shipping cost, USD (e.g. matchedVariant.shippingCostUsd). */
  shippingUsd?: number | null;
  /** Destination market, keyed by display currency. */
  currency: CurrencyCode;
}

export interface LandedCostEstimate {
  /** item + shipping + VAT, USD. Duty intentionally excluded (see notes). */
  landedUsd: number;
  itemUsd: number;
  /** Resolved shipping used in the math (0 when unknown). */
  shippingUsd: number;
  vatUsd: number;
  /** Applied VAT rate (0 when under exemption / not applicable). */
  vatRate: number;
  /** Human-readable assumptions — surface these next to the number. */
  notes: string[];
}

interface MarketRule {
  /** VAT rate applied to item + shipping. */
  vatRate: number;
  /**
   * Below this threshold (compared in `thresholdCurrency`) no import VAT is
   * charged. 0 = VAT from the first cent (EU IOSS, UK).
   */
  vatExemptBelow: number;
  /** Above this, customs duty MAY apply — note only, never computed. */
  dutyFreeBelow: number;
  /** Currency the two thresholds are denominated in. */
  thresholdCurrency: CurrencyCode;
  /** Fixed notes always attached for this market. */
  marketNotes: string[];
}

/**
 * Import regimes for low-value e-commerce parcels. Sources: US §321 de
 * minimis ($800); IL personal-import VAT exemption ($75) / duty ($500);
 * EU IOSS (VAT from €0, duty-free under €150); UK (VAT from £0, duty-free
 * under £135). EU VAT uses a representative 21% — actual rate varies
 * 17–27% by member state, which the note discloses.
 */
const MARKET_RULES: Record<CurrencyCode, MarketRule> = {
  USD: {
    vatRate: 0,
    vatExemptBelow: 800,
    dutyFreeBelow: 800,
    thresholdCurrency: "USD",
    marketNotes: ["US: no import fees under the $800 de minimis; marketplace may collect state sales tax at checkout."],
  },
  ILS: {
    vatRate: 0.18,
    vatExemptBelow: 75, // USD-denominated exemption in Israeli regulation
    dutyFreeBelow: 500,
    thresholdCurrency: "USD",
    marketNotes: [],
  },
  EUR: {
    vatRate: 0.21,
    vatExemptBelow: 0,
    dutyFreeBelow: 150,
    thresholdCurrency: "EUR",
    marketNotes: ["EU VAT estimated at 21% — actual rate varies by member state (17–27%)."],
  },
  GBP: {
    vatRate: 0.2,
    vatExemptBelow: 0,
    dutyFreeBelow: 135,
    thresholdCurrency: "GBP",
    marketNotes: [],
  },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function estimateLandedCost(input: LandedCostInput): LandedCostEstimate {
  const itemUsd = Number.isFinite(input.itemUsd) && input.itemUsd > 0 ? input.itemUsd : 0;
  const shippingKnown =
    typeof input.shippingUsd === "number" &&
    Number.isFinite(input.shippingUsd) &&
    input.shippingUsd >= 0;
  const shippingUsd = shippingKnown ? (input.shippingUsd as number) : 0;

  const rule = MARKET_RULES[input.currency];
  const notes: string[] = [...rule.marketNotes];
  if (!shippingKnown) {
    notes.push("Shipping cost unknown — estimate excludes shipping.");
  }

  // VAT base is CIF (item + shipping); thresholds compare the same base in
  // the market's threshold currency.
  const baseUsd = itemUsd + shippingUsd;
  const baseInThresholdCurrency = convertUsd(baseUsd, rule.thresholdCurrency);

  let vatRate = 0;
  let vatUsd = 0;
  if (rule.vatRate > 0) {
    if (baseInThresholdCurrency >= rule.vatExemptBelow) {
      vatRate = rule.vatRate;
      vatUsd = round2(baseUsd * rule.vatRate);
    } else {
      notes.push(
        `Under the import-VAT exemption threshold (${rule.vatExemptBelow} ${rule.thresholdCurrency}) — no VAT.`,
      );
    }
  }

  if (baseInThresholdCurrency >= rule.dutyFreeBelow && rule.dutyFreeBelow > 0) {
    notes.push(
      "Customs duty may apply above the duty-free threshold — not included (depends on product category).",
    );
  }

  return {
    landedUsd: round2(baseUsd + vatUsd),
    itemUsd: round2(itemUsd),
    shippingUsd: round2(shippingUsd),
    vatUsd,
    vatRate,
    notes,
  };
}
