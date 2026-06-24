/**
 * Locale definitions.
 *
 * Keep this list tight — every new locale is a translation commitment
 * and a font/RTL audit. Add a locale only when there's a real user base.
 */

export type LocaleCode = "en" | "he";

export const DEFAULT_LOCALE: LocaleCode = "en";

export interface LocaleMeta {
  code: LocaleCode;
  /** Label shown in the picker — always in the locale's own script. */
  nativeLabel: string;
  /** BCP-47 language tag used for <html lang>. */
  htmlLang: string;
  /** Writing direction for <html dir>. */
  dir: "ltr" | "rtl";
  /** Flag chip in the picker. */
  flag: string;
}

export const LOCALES: Record<LocaleCode, LocaleMeta> = {
  en: { code: "en", nativeLabel: "English", htmlLang: "en", dir: "ltr", flag: "🇺🇸" },
  he: { code: "he", nativeLabel: "עברית", htmlLang: "he", dir: "rtl", flag: "🇮🇱" },
};

export const LOCALE_LIST: ReadonlyArray<LocaleMeta> = [LOCALES.en, LOCALES.he];

export function isLocaleCode(value: unknown): value is LocaleCode {
  return value === "en" || value === "he";
}

/**
 * Country → preferred locale mapping. Used to set an initial language
 * for visitors who haven't picked one. ISR users default to Hebrew;
 * everyone else gets English.
 */
const COUNTRY_TO_LOCALE: Record<string, LocaleCode> = {
  IL: "he",
};

export function localeForCountry(countryCode: string | null | undefined): LocaleCode {
  if (!countryCode) return DEFAULT_LOCALE;
  return COUNTRY_TO_LOCALE[countryCode.toUpperCase()] ?? DEFAULT_LOCALE;
}

export const LOCALE_COOKIE_NAME = "busted_locale_v1";
export const LOCALE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year
