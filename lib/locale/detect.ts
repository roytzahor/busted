/**
 * Server-side locale detection.
 *
 * Reads geo + cookie hints to determine which currency to serve to a new
 * visitor. Called once from the root layout so the initial render is
 * already in the user's currency — no hydration flash, no client-side
 * "redetect" round-trip.
 *
 * Resolution order:
 *   1. Explicit cookie override (user picked a currency)
 *   2. Vercel-provided geo header (x-vercel-ip-country)
 *   3. Best-effort Accept-Language parse (last-resort fallback)
 *   4. DEFAULT_CURRENCY (USD)
 */

import { cookies, headers } from "next/headers";
import {
  CURRENCY_COOKIE_NAME,
  currencyForCountry,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

export interface DetectedLocale {
  currency: CurrencyCode;
  country: string | null;
  /** True when currency came from the cookie (user override). */
  fromOverride: boolean;
}

/** Pull the first 2-letter region code we can find from `Accept-Language`. */
function regionFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  // Examples: "he-IL,he;q=0.9,en-US;q=0.8" → "IL"
  const match = header.match(/[a-z]{2,3}-([A-Z]{2})/);
  return match ? match[1] : null;
}

export async function detectServerLocale(): Promise<DetectedLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const cookieOverride = cookieStore.get(CURRENCY_COOKIE_NAME)?.value;
  if (isCurrencyCode(cookieOverride)) {
    return {
      currency: cookieOverride,
      country: headerStore.get("x-vercel-ip-country"),
      fromOverride: true,
    };
  }

  const vercelCountry =
    headerStore.get("x-vercel-ip-country") ??
    headerStore.get("cf-ipcountry") ??
    headerStore.get("x-country-code");

  if (vercelCountry) {
    return {
      currency: currencyForCountry(vercelCountry),
      country: vercelCountry,
      fromOverride: false,
    };
  }

  const acceptLang = headerStore.get("accept-language");
  const region = regionFromAcceptLanguage(acceptLang);
  if (region) {
    return {
      currency: currencyForCountry(region),
      country: region,
      fromOverride: false,
    };
  }

  return {
    currency: DEFAULT_CURRENCY,
    country: null,
    fromOverride: false,
  };
}
