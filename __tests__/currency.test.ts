import { describe, expect, it } from "vitest";
import {
  convertUsd,
  currencyForCountry,
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
} from "@/lib/currency";

describe("convertUsd", () => {
  it("returns the same value when target is USD", () => {
    expect(convertUsd(100, "USD")).toBe(100);
  });

  it("applies the FX multiplier for non-USD currencies", () => {
    const ils = convertUsd(10, "ILS");
    const eur = convertUsd(10, "EUR");
    const gbp = convertUsd(10, "GBP");
    expect(ils).toBeCloseTo(10 * CURRENCIES.ILS.fxFromUsd, 4);
    expect(eur).toBeCloseTo(10 * CURRENCIES.EUR.fxFromUsd, 4);
    expect(gbp).toBeCloseTo(10 * CURRENCIES.GBP.fxFromUsd, 4);
  });

  it("collapses NaN / non-finite inputs to 0 (formatter safety)", () => {
    expect(convertUsd(Number.NaN, "ILS")).toBe(0);
    expect(convertUsd(Number.POSITIVE_INFINITY, "ILS")).toBe(0);
  });

  it("handles zero and negative inputs without throwing", () => {
    expect(convertUsd(0, "ILS")).toBe(0);
    expect(convertUsd(-50, "ILS")).toBeCloseTo(-50 * CURRENCIES.ILS.fxFromUsd, 4);
  });
});

describe("formatMoney", () => {
  it("renders USD with a $ sign", () => {
    const out = formatMoney(19.99, "USD");
    expect(out).toContain("$");
    expect(out).toContain("19.99");
  });

  it("renders ILS with the shekel symbol", () => {
    const out = formatMoney(10, "ILS");
    // Different ICU versions may emit ‎₪‎ with bidi marks — substring match is robust.
    expect(out).toContain("₪");
  });

  it("respects { whole: true } and drops fractional digits", () => {
    const usd = formatMoney(19.99, "USD", { whole: true });
    expect(usd).not.toContain(".");
    expect(usd).toContain("20");
  });

  it("respects { compact: true } and uses k/M suffixes", () => {
    const out = formatMoney(12_345, "USD", { compact: true });
    expect(out).toMatch(/[kK]/);
  });

  it("never throws on extreme inputs", () => {
    expect(() => formatMoney(0, "ILS")).not.toThrow();
    expect(() => formatMoney(Number.NaN, "ILS")).not.toThrow();
    expect(() => formatMoney(1e9, "EUR")).not.toThrow();
  });
});

describe("currencyForCountry", () => {
  it("maps Israel → ILS", () => {
    expect(currencyForCountry("IL")).toBe("ILS");
    expect(currencyForCountry("il")).toBe("ILS"); // case-insensitive
  });

  it("maps EU countries → EUR", () => {
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("ES")).toBe("EUR");
  });

  it("maps UK / GB → GBP", () => {
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("UK")).toBe("GBP");
  });

  it("falls back to default for unmapped countries", () => {
    expect(currencyForCountry("JP")).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry("BR")).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry("")).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry(null)).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry(undefined)).toBe(DEFAULT_CURRENCY);
  });
});

describe("isCurrencyCode", () => {
  it("accepts all known codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("ILS")).toBe(true);
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("GBP")).toBe(true);
  });

  it("rejects unknown / malformed values", () => {
    expect(isCurrencyCode("JPY")).toBe(false);
    expect(isCurrencyCode("usd")).toBe(false); // case-sensitive
    expect(isCurrencyCode("")).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode(undefined)).toBe(false);
    expect(isCurrencyCode(123)).toBe(false);
  });
});
