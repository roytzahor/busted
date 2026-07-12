import { describe, expect, it } from "vitest";
import { estimateLandedCost } from "@/lib/pricing/landed-cost";

describe("estimateLandedCost", () => {
  it("US: no import fees under de minimis", () => {
    const r = estimateLandedCost({ itemUsd: 20, shippingUsd: 5, currency: "USD" });
    expect(r.vatUsd).toBe(0);
    expect(r.landedUsd).toBe(25);
    expect(r.notes.join(" ")).toMatch(/de minimis/);
  });

  it("IL: no VAT under the $75 exemption", () => {
    const r = estimateLandedCost({ itemUsd: 40, shippingUsd: 10, currency: "ILS" });
    expect(r.vatRate).toBe(0);
    expect(r.landedUsd).toBe(50);
    expect(r.notes.join(" ")).toMatch(/exemption/);
  });

  it("IL: 18% VAT on item+shipping at/above $75", () => {
    const r = estimateLandedCost({ itemUsd: 80, shippingUsd: 20, currency: "ILS" });
    expect(r.vatRate).toBe(0.18);
    expect(r.vatUsd).toBe(18); // 18% of $100
    expect(r.landedUsd).toBe(118);
  });

  it("EU: VAT from the first euro (IOSS)", () => {
    const r = estimateLandedCost({ itemUsd: 10, shippingUsd: 0, currency: "EUR" });
    expect(r.vatRate).toBe(0.21);
    expect(r.vatUsd).toBe(2.1);
    expect(r.landedUsd).toBe(12.1);
    expect(r.notes.join(" ")).toMatch(/varies by member state/);
  });

  it("UK: 20% VAT from zero", () => {
    const r = estimateLandedCost({ itemUsd: 50, shippingUsd: 10, currency: "GBP" });
    expect(r.vatUsd).toBe(12);
    expect(r.landedUsd).toBe(72);
  });

  it("adds a duty note above the duty-free threshold but never a duty amount", () => {
    // €150 threshold ≈ $163 at the 0.92 snapshot — $200 item is above it.
    const r = estimateLandedCost({ itemUsd: 200, shippingUsd: 0, currency: "EUR" });
    expect(r.notes.join(" ")).toMatch(/duty may apply/i);
    expect(r.landedUsd).toBe(round2(200 + 200 * 0.21));
  });

  it("unknown shipping: excluded from the math, disclosed in notes", () => {
    const r = estimateLandedCost({ itemUsd: 30, shippingUsd: null, currency: "GBP" });
    expect(r.shippingUsd).toBe(0);
    expect(r.landedUsd).toBe(36);
    expect(r.notes.join(" ")).toMatch(/Shipping cost unknown/);
  });

  it("collapses non-finite input to zero instead of NaN", () => {
    const r = estimateLandedCost({ itemUsd: Number.NaN, shippingUsd: 5, currency: "USD" });
    expect(r.landedUsd).toBe(5);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
