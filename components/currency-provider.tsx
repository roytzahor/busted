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
  CURRENCIES,
  CURRENCY_COOKIE_MAX_AGE_SEC,
  CURRENCY_COOKIE_NAME,
  CURRENCY_LIST,
  DEFAULT_CURRENCY,
  formatMoney as formatMoneyCore,
  isCurrencyCode,
  type CurrencyCode,
  type CurrencyMeta,
} from "@/lib/currency";

interface CurrencyContextValue {
  currency: CurrencyCode;
  meta: CurrencyMeta;
  /** True when the active currency was inferred (no manual user pick yet). */
  autoDetected: boolean;
  /** The country code that drove auto-detection (when known). */
  detectedCountry: string | null;
  setCurrency: (next: CurrencyCode) => void;
  /** Bind once-per-render: passes the active currency. */
  formatMoney: (
    usdAmount: number,
    opts?: { whole?: boolean; compact?: boolean },
  ) => string;
  catalog: ReadonlyArray<CurrencyMeta>;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface CurrencyProviderProps {
  initialCurrency: CurrencyCode;
  initialCountry: string | null;
  initialFromOverride: boolean;
  children: ReactNode;
}

function writeCurrencyCookie(value: CurrencyCode): void {
  if (typeof document === "undefined") return;
  const parts = [
    `${CURRENCY_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${CURRENCY_COOKIE_MAX_AGE_SEC}`,
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function CurrencyProvider({
  initialCurrency,
  initialCountry,
  initialFromOverride,
  children,
}: CurrencyProviderProps) {
  const safeInitial = isCurrencyCode(initialCurrency)
    ? initialCurrency
    : DEFAULT_CURRENCY;

  const [currency, setCurrencyState] = useState<CurrencyCode>(safeInitial);
  const [autoDetected, setAutoDetected] = useState(!initialFromOverride);

  // Cross-tab sync — when the user changes currency in another tab, propagate
  // via the `storage` event so all open tabs stay coherent without a reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CURRENCY_COOKIE_NAME || !isCurrencyCode(e.newValue)) return;
      setCurrencyState(e.newValue);
      setAutoDetected(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    if (!isCurrencyCode(next)) return;
    setCurrencyState(next);
    setAutoDetected(false);
    writeCurrencyCookie(next);
    try {
      // localStorage mirrors the cookie purely for cross-tab sync via the
      // `storage` event (cookies don't fire it). The cookie remains the
      // source of truth that SSR reads.
      window.localStorage.setItem(CURRENCY_COOKIE_NAME, next);
    } catch {
      /* private mode / quota */
    }
  }, []);

  const formatMoney = useCallback(
    (usdAmount: number, opts?: { whole?: boolean; compact?: boolean }) =>
      formatMoneyCore(usdAmount, currency, opts),
    [currency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      meta: CURRENCIES[currency],
      autoDetected,
      detectedCountry: initialCountry,
      setCurrency,
      formatMoney,
      catalog: CURRENCY_LIST,
    }),
    [currency, autoDetected, initialCountry, setCurrency, formatMoney],
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

/**
 * Active-currency hook. Safe to call without a provider — falls back to a
 * USD formatter so server components / tests / Storybook keep rendering.
 * In production, the provider is mounted at the layout root.
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    currency: DEFAULT_CURRENCY,
    meta: CURRENCIES[DEFAULT_CURRENCY],
    autoDetected: true,
    detectedCountry: null,
    setCurrency: () => {},
    formatMoney: (usd, opts) => formatMoneyCore(usd, DEFAULT_CURRENCY, opts),
    catalog: CURRENCY_LIST,
  };
}

/** Convenience hook when you only need the formatter. */
export function useMoney(): CurrencyContextValue["formatMoney"] {
  return useCurrency().formatMoney;
}
