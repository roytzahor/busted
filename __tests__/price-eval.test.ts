import { describe, expect, it } from "vitest";
import { listFixtureIds, loadFixture } from "@/lib/eval/fixture-store";
import { scorePrice } from "@/lib/eval/price-score";

describe("scorePrice", () => {
  // @spec 0003/AC-4
  it("scores a price within 2% of the truth after FX as correct, anything else as wrong", () => {
    const ring = { amount: 3122, currency: "ILS" as const };
    expect(scorePrice(ring, 843.76)).toBe("correct");
    expect(scorePrice(ring, 30)).toBe("wrong");
    expect(scorePrice({ amount: 24.99, currency: "USD" }, 24.99)).toBe("correct");
    expect(scorePrice({ amount: 24.99, currency: "USD" }, 26)).toBe("wrong");
  });

  // @spec 0003/AC-4
  it("separates a price on a no-price page, and a missed price, from a wrong one", () => {
    expect(scorePrice(null, 53.78)).toBe("false_price");
    expect(scorePrice(null, null)).toBe("correct");
    expect(scorePrice({ amount: 165, currency: "ILS" }, null)).toBe("missed");
    expect(scorePrice({ amount: 165, currency: "ILS" }, 0)).toBe("missed");
  });
});

describe("the store-price truth exists", () => {
  // @spec 0003/AC-5
  it("labels every real fixture, or says why not", () => {
    const real = listFixtureIds().filter((id) => id.startsWith("real-"));
    expect(real.length).toBeGreaterThan(0);
    for (const id of real) {
      const t = loadFixture(id)!.truth;
      const labelled = t.expectedStorePrice !== undefined;
      expect(labelled || Boolean(t.expectedStorePriceUnlabelled), `${id} has no price label`).toBe(true);
      if (labelled) {
        // A label carries the evidence it was read from.
        expect(t.expectedStorePriceNote, `${id} label has no evidence note`).toBeTruthy();
        if (t.expectedStorePrice) expect(t.expectedStorePrice.amount).toBeGreaterThan(0);
      }
    }
  });
});
