/**
 * Currency module — single source of truth for FX rates, formatting, and
 * USD→local conversion across server and client surfaces.
 *
 * Architecture: the data model is USD-locked end-to-end (prices in DB,
 * AliExpress API responses, cache rows, share/OG URLs). User-visible
 * conversion is presentation-only — `formatMoney(usdAmount, currency)` is
 * the lone touchpoint. This keeps cache keys stable, share links portable,
 * and means swapping the FX rate doesn't invalidate cached scans.
 */

export type CurrencyCode = "USD" | "ILS" | "EUR" | "GBP";

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  /** Three-letter ISO label shown in the picker. */
  label: string;
  /** BCP-47 locale used for Intl.NumberFormat — drives separator + symbol position. */
  locale: string;
  /** Multiplier applied to a USD amount to get the native amount. */
  fxFromUsd: number;
  flag: string;
}

/**
 * Hardcoded FX snapshot. These are rounded mid-market rates; the goal is
 * "in the right ballpark", not "tracks the spot rate to 4 decimals" — that
 * would mislead users into thinking we'd pre-locked the exchange rate.
 *
 * Override at deploy time by setting BUSTED_FX_<CODE>= (e.g.
 * `BUSTED_FX_ILS=3.68`). Bad/zero overrides fall back to the snapshot.
 */
const FX_SNAPSHOT: Record<CurrencyCode, number> = {
  USD: 1,
  ILS: 3.7,
  EUR: 0.92,
  GBP: 0.79,
};

function resolveFxRate(code: CurrencyCode): number {
  const envValue = process.env[`BUSTED_FX_${code}`];
  if (envValue) {
    const parsed = Number.parseFloat(envValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return FX_SNAPSHOT[code];
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: {
    code: "USD",
    symbol: "$",
    label: "USD",
    locale: "en-US",
    fxFromUsd: resolveFxRate("USD"),
    flag: "🇺🇸",
  },
  ILS: {
    code: "ILS",
    symbol: "₪",
    label: "ILS",
    locale: "he-IL",
    fxFromUsd: resolveFxRate("ILS"),
    flag: "🇮🇱",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    label: "EUR",
    locale: "en-IE",
    fxFromUsd: resolveFxRate("EUR"),
    flag: "🇪🇺",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    label: "GBP",
    locale: "en-GB",
    fxFromUsd: resolveFxRate("GBP"),
    flag: "🇬🇧",
  },
};

export const CURRENCY_LIST: ReadonlyArray<CurrencyMeta> = [
  CURRENCIES.USD,
  CURRENCIES.ILS,
  CURRENCIES.EUR,
  CURRENCIES.GBP,
];

/**
 * ISO 3166-1 alpha-2 country code → default currency. Anything not here
 * falls back to DEFAULT_CURRENCY (USD). Keep this list short — every new
 * row is a currency we're committing to maintain an FX rate for.
 */
const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  IL: "ILS",
  US: "USD",
  GB: "GBP",
  UK: "GBP",
  // EU member states (cluster, not exhaustive — add as launch markets expand)
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  PT: "EUR",
  FI: "EUR",
  GR: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  LU: "EUR",
  MT: "EUR",
  SK: "EUR",
  SI: "EUR",
  CY: "EUR",
  HR: "EUR",
};

export function currencyForCountry(countryCode: string | null | undefined): CurrencyCode {
  if (!countryCode) return DEFAULT_CURRENCY;
  const upper = countryCode.toUpperCase();
  return COUNTRY_TO_CURRENCY[upper] ?? DEFAULT_CURRENCY;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    value === "USD" || value === "ILS" || value === "EUR" || value === "GBP"
  );
}

/**
 * Convert a USD amount into the native currency. Always returns a finite
 * number (NaN/negative inputs collapse to 0) so the formatter never explodes.
 */
export function convertUsd(usdAmount: number, currency: CurrencyCode): number {
  if (!Number.isFinite(usdAmount)) return 0;
  const meta = CURRENCIES[currency];
  return usdAmount * meta.fxFromUsd;
}

interface FormatMoneyOpts {
  /** When true, round to whole units (drop cents/agorot). Default: false. */
  whole?: boolean;
  /** When true, use compact notation ($1.2k, ₪450). Default: false. */
  compact?: boolean;
}

/**
 * Format a USD amount in the user's currency. The conversion + formatting
 * are bundled here so callers stay agnostic — they pass `priceUsd` and a
 * currency code; this is the only function that ever touches FX math.
 */
export function formatMoney(
  usdAmount: number,
  currency: CurrencyCode,
  opts: FormatMoneyOpts = {},
): string {
  const meta = CURRENCIES[currency];
  const native = convertUsd(usdAmount, currency);

  const minFrac = opts.compact ? 0 : opts.whole ? 0 : 2;
  const maxFrac = opts.compact ? 1 : opts.whole ? 0 : 2;

  const formatter = new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
    ...(opts.compact ? { notation: "compact" } : {}),
  });

  return formatter.format(native);
}

/**
 * Cookie + storage key for the user's currency override. Read both server-
 * side (via cookies()) and client-side (via document.cookie) so SSR
 * receives the correct value without a hydration flash.
 */
export const CURRENCY_COOKIE_NAME = "busted_currency_v1";
export const CURRENCY_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year
