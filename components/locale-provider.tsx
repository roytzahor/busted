"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  isLocaleCode,
  LOCALE_COOKIE_MAX_AGE_SEC,
  LOCALE_COOKIE_NAME,
  LOCALE_LIST,
  LOCALES,
  type LocaleCode,
  type LocaleMeta,
} from "@/lib/i18n/locale";
import {
  translate,
  type MessageKey,
  type Translator,
} from "@/lib/i18n/messages";

interface LocaleContextValue {
  locale: LocaleCode;
  meta: LocaleMeta;
  autoDetected: boolean;
  setLocale: (next: LocaleCode) => void;
  t: Translator;
  catalog: ReadonlyArray<LocaleMeta>;
  isRtl: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  initialLocale: LocaleCode;
  initialFromOverride: boolean;
  children: ReactNode;
}

function writeLocaleCookie(value: LocaleCode): void {
  if (typeof document === "undefined") return;
  const parts = [
    `${LOCALE_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SEC}`,
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function LocaleProvider({
  initialLocale,
  initialFromOverride,
  children,
}: LocaleProviderProps) {
  const safeInitial = isLocaleCode(initialLocale) ? initialLocale : DEFAULT_LOCALE;
  const [locale, setLocaleState] = useState<LocaleCode>(safeInitial);
  const [autoDetected, setAutoDetected] = useState(!initialFromOverride);

  // Keep <html lang> + <html dir> in sync when the user toggles language.
  // SSR sets them initially via the layout; this catches in-session changes
  // so screen readers and CSS logical properties stay correct.
  useEffect(() => {
    const meta = LOCALES[locale];
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dir = meta.dir;
  }, [locale]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCALE_COOKIE_NAME || !isLocaleCode(e.newValue)) return;
      setLocaleState(e.newValue);
      setAutoDetected(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    if (!isLocaleCode(next)) return;
    setLocaleState(next);
    setAutoDetected(false);
    writeLocaleCookie(next);
    try {
      window.localStorage.setItem(LOCALE_COOKIE_NAME, next);
    } catch {
      /* private mode / quota */
    }
  }, []);

  const t = useCallback<Translator>(
    (key: MessageKey, vars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      meta: LOCALES[locale],
      autoDetected,
      setLocale,
      t,
      catalog: LOCALE_LIST,
      isRtl: LOCALES[locale].dir === "rtl",
    }),
    [locale, autoDetected, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  // Safe fallback so tests / SSR-only contexts keep rendering.
  return {
    locale: DEFAULT_LOCALE,
    meta: LOCALES[DEFAULT_LOCALE],
    autoDetected: true,
    setLocale: () => {},
    t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
    catalog: LOCALE_LIST,
    isRtl: false,
  };
}

export function useT(): Translator {
  return useLocale().t;
}
