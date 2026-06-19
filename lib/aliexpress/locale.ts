/**
 * Map a source store URL to the AliExpress `ship_to_country` + `target_currency`
 * pair that matches the buyer the store is actually selling to.
 *
 * Why this matters: AliExpress quotes warehouse availability and shipping
 * cost per-country. A US-default lookup against an IL-targeted dropship
 * store (calmo.co.il, vivify.co.il) returns US-warehouse prices the buyer
 * can never get — the "savings" number becomes fiction.
 *
 * Resolution order:
 *   1. Explicit ccTLD or `co.XX` suffix on the hostname
 *   2. Env default (`ALIEXPRESS_SHIP_TO_COUNTRY`) — falls back to US/USD
 *
 * Add new entries here as we observe new dropship verticals. Keep entries
 * minimal — the table is consulted on every analyse() call.
 */

export interface LocaleResolution {
  shipToCountry: string;
  targetCurrency: string;
  /** Resolution mechanism — useful for logging / debug. */
  source: "tld" | "env_default" | "fallback";
}

/**
 * TLD-suffix → locale. Longer suffixes (`co.uk`) must be checked before
 * shorter ones (`.uk`) — we iterate in declaration order.
 */
const TLD_TO_LOCALE: Array<{
  suffix: string;
  country: string;
  currency: string;
}> = [
  { suffix: ".co.il", country: "IL", currency: "ILS" },
  { suffix: ".co.uk", country: "GB", currency: "GBP" },
  { suffix: ".com.au", country: "AU", currency: "AUD" },
  { suffix: ".com.br", country: "BR", currency: "BRL" },
  { suffix: ".com.mx", country: "MX", currency: "MXN" },
  { suffix: ".com.tr", country: "TR", currency: "TRY" },
  { suffix: ".co.nz", country: "NZ", currency: "NZD" },
  { suffix: ".co.za", country: "ZA", currency: "ZAR" },
  { suffix: ".il", country: "IL", currency: "ILS" },
  { suffix: ".uk", country: "GB", currency: "GBP" },
  { suffix: ".de", country: "DE", currency: "EUR" },
  { suffix: ".fr", country: "FR", currency: "EUR" },
  { suffix: ".es", country: "ES", currency: "EUR" },
  { suffix: ".it", country: "IT", currency: "EUR" },
  { suffix: ".nl", country: "NL", currency: "EUR" },
  { suffix: ".be", country: "BE", currency: "EUR" },
  { suffix: ".pt", country: "PT", currency: "EUR" },
  { suffix: ".pl", country: "PL", currency: "PLN" },
  { suffix: ".se", country: "SE", currency: "SEK" },
  { suffix: ".no", country: "NO", currency: "NOK" },
  { suffix: ".dk", country: "DK", currency: "DKK" },
  { suffix: ".fi", country: "FI", currency: "EUR" },
  { suffix: ".ch", country: "CH", currency: "CHF" },
  { suffix: ".au", country: "AU", currency: "AUD" },
  { suffix: ".ca", country: "CA", currency: "CAD" },
  { suffix: ".jp", country: "JP", currency: "JPY" },
  { suffix: ".kr", country: "KR", currency: "KRW" },
  { suffix: ".sg", country: "SG", currency: "SGD" },
  { suffix: ".my", country: "MY", currency: "MYR" },
  { suffix: ".ae", country: "AE", currency: "AED" },
  { suffix: ".sa", country: "SA", currency: "SAR" },
  { suffix: ".br", country: "BR", currency: "BRL" },
  { suffix: ".mx", country: "MX", currency: "MXN" },
  { suffix: ".ar", country: "AR", currency: "ARS" },
  { suffix: ".cl", country: "CL", currency: "CLP" },
  { suffix: ".co", country: "CO", currency: "COP" },
  { suffix: ".tr", country: "TR", currency: "TRY" },
];

export function resolveLocaleFromSourceUrl(sourceUrl: string): LocaleResolution {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    for (const entry of TLD_TO_LOCALE) {
      if (host.endsWith(entry.suffix)) {
        return {
          shipToCountry: entry.country,
          targetCurrency: entry.currency,
          source: "tld",
        };
      }
    }
  } catch {
    /* malformed URL — fall through */
  }

  const envCountry = process.env.ALIEXPRESS_SHIP_TO_COUNTRY?.trim();
  if (envCountry) {
    return {
      shipToCountry: envCountry,
      targetCurrency: "USD",
      source: "env_default",
    };
  }

  return {
    shipToCountry: "US",
    targetCurrency: "USD",
    source: "fallback",
  };
}
