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
import {
  DEFAULT_LOCALE,
  isLocaleCode,
  localeForCountry,
  LOCALE_COOKIE_NAME,
  LOCALES,
  type LocaleCode,
  type LocaleMeta,
} from "@/lib/i18n/locale";

export interface DetectedLocale {
  currency: CurrencyCode;
  country: string | null;
  /** True when currency came from the cookie (user override). */
  fromOverride: boolean;
  language: LocaleCode;
  /** True when language came from the cookie (user override). */
  languageFromOverride: boolean;
  languageMeta: LocaleMeta;
}

/** Extract the language code (e.g. "he") from an Accept-Language header. */
function languageFromAcceptLanguage(header: string | null): LocaleCode | null {
  if (!header) return null;
  // Examples: "he-IL,he;q=0.9,en-US;q=0.8" → "he"
  const match = header.match(/^\s*([a-z]{2,3})/);
  if (!match) return null;
  return isLocaleCode(match[1]) ? match[1] : null;
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

  const currencyOverride = cookieStore.get(CURRENCY_COOKIE_NAME)?.value;
  const languageOverrideRaw = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const languageOverride = isLocaleCode(languageOverrideRaw) ? languageOverrideRaw : null;

  const vercelCountry =
    headerStore.get("x-vercel-ip-country") ??
    headerStore.get("cf-ipcountry") ??
    headerStore.get("x-country-code");

  const acceptLang = headerStore.get("accept-language");
  const acceptRegion = regionFromAcceptLanguage(acceptLang);
  const acceptLanguage = languageFromAcceptLanguage(acceptLang);

  const inferredCountry = vercelCountry ?? acceptRegion ?? null;

  // Currency: cookie wins; else country-driven default; else USD.
  const currency: CurrencyCode = isCurrencyCode(currencyOverride)
    ? currencyOverride
    : inferredCountry
      ? currencyForCountry(inferredCountry)
      : DEFAULT_CURRENCY;

  // Language: cookie wins; else country-driven (IL → he); else Accept-Language;
  // else English. The IL→he default is the highest-impact rule for this launch.
  const language: LocaleCode = languageOverride
    ?? (inferredCountry ? localeForCountry(inferredCountry) : null)
    ?? acceptLanguage
    ?? DEFAULT_LOCALE;

  return {
    currency,
    country: inferredCountry,
    fromOverride: isCurrencyCode(currencyOverride),
    language,
    languageFromOverride: languageOverride !== null,
    languageMeta: LOCALES[language],
  };
}
