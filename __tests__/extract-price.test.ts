import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@/lib/currency";
import {
  detectPriceInMarkdown,
  extractPriceFromMarkdown,
} from "@/lib/scraping/extract-price";

/**
 * Every Hebrew snippet here is copied from a real capture in
 * tests/fixtures/products — these are the exact shapes that made the previous
 * USD/EUR/GBP-only extractor return null on the .co.il market.
 */
describe("detectPriceInMarkdown — currency recognition", () => {
  it("reads shekels with the symbol AFTER the number (Shopify he-IL)", () => {
    const found = detectPriceInMarkdown("מחיר רגיל 238 ₪ מחיר מבצע 238 ₪");
    expect(found?.amount).toBe(238);
    expect(found?.currency).toBe("ILS");
  });

  it("reads shekels with the symbol BEFORE the number", () => {
    const found = detectPriceInMarkdown("קייס מנומר ורוד בהיר ₪159.90 לפרטים");
    expect(found?.amount).toBe(159.9);
    expect(found?.currency).toBe("ILS");
  });

  it("still reads plain USD / EUR / GBP pages", () => {
    expect(detectPriceInMarkdown("Price: $30.00")).toMatchObject({
      amount: 30,
      currency: "USD",
    });
    expect(detectPriceInMarkdown("Only €24,99 today")).toMatchObject({
      amount: 24.99,
      currency: "EUR",
    });
    expect(detectPriceInMarkdown("£18.50")).toMatchObject({
      amount: 18.5,
      currency: "GBP",
    });
  });

  it("accepts ISO codes and NIS as well as symbols", () => {
    expect(detectPriceInMarkdown("Total 149 ILS")?.currency).toBe("ILS");
    expect(detectPriceInMarkdown("Total 149 NIS")?.currency).toBe("ILS");
    expect(detectPriceInMarkdown("Total 149 USD")?.currency).toBe("USD");
  });

  it("tolerates RTL bidi marks between the number and the symbol", () => {
    // U+200F RIGHT-TO-LEFT MARK, exactly as Firecrawl captured Davincified.
    const found = detectPriceInMarkdown("החל מ-‏88.90 ‏₪");
    expect(found?.amount).toBe(88.9);
    expect(found?.currency).toBe("ILS");
  });

  it("returns null when the page has no price at all", () => {
    expect(detectPriceInMarkdown("About us — contact our team")).toBeNull();
  });
});

describe("detectPriceInMarkdown — rejecting non-prices", () => {
  /**
   * Regression guard for the bug that hid every shekel price: the extractor
   * tested only the FIRST match of each pattern, and Shopify renders the cart
   * before the product. One "0 ₪" empty-cart total disqualified the pattern and
   * the real price further down the page was never reached.
   */
  it("skips a zero cart total and finds the product price after it", () => {
    const markdown =
      'העגלה שלך טוען... סה"כ: 0 ₪ עדכון מעבר לתשלום ' +
      "My Baby Necklace 445 ביקורות מחיר רגיל 238 ₪";
    expect(detectPriceInMarkdown(markdown)?.amount).toBe(238);
  });

  it("skips a free-shipping threshold (By Yardi: ₪399 banner, ₪159.90 product)", () => {
    const markdown =
      "By Yardi ✦ משלוח חינם מעל ₪399 חנות עלינו ✕ תפריט " +
      "קייס מנומר ורוד בהיר ₪159.90 לפרטים";
    expect(detectPriceInMarkdown(markdown)?.amount).toBe(159.9);
  });

  it("skips an English free-shipping threshold", () => {
    expect(
      detectPriceInMarkdown("Free shipping on orders over $75. Sale price $19.99")
        ?.amount,
    ).toBe(19.99);
  });

  it("does not treat 'סך הכל ביקורות' (total REVIEWS) as a cart total", () => {
    // Remora prints the review count immediately before the price. Treating the
    // generic Hebrew word for "total" as a cart marker discarded the real price
    // and let the compare-at price win.
    const found = detectPriceInMarkdown("4.9 / 5.0 (49) 49 סך הכל ביקורות מחיר רגיל 199 ₪");
    expect(found?.amount).toBe(199);
  });

  it("rejects implausible magnitudes that are really ids or SKUs", () => {
    expect(detectPriceInMarkdown("SKU $99999999")).toBeNull();
  });

  it("does not mistake 'על' (on) for 'מעל' (over)", () => {
    // "הילד שלך — על הצוואר" precedes the real price on imri-jewelry; a naive
    // substring check for the threshold marker would have discarded it.
    const found = detectPriceInMarkdown("הילד שלך — על הצוואר מחיר רגיל 238 ₪");
    expect(found?.amount).toBe(238);
  });
});

/**
 * Israeli Shopify themes render the compare-at price BEFORE the sale price, so
 * "first labelled number wins" systematically overstates what the shopper pays
 * — and therefore overstates the markup the dropship verdict rests on.
 */
describe("detectPriceInMarkdown — prefers the price actually charged", () => {
  it("prefers מחיר מבצע (sale) over מחיר מקורי (original)", () => {
    const found = detectPriceInMarkdown(
      "צמידי מגע שמש & ירח מחיר מקורי ₪674.00 מחיר מבצע ₪539.00 חסוך 20%",
    );
    expect(found?.amount).toBe(539);
  });

  it("prefers במבצע (on sale) over the compare-at price", () => {
    const found = detectPriceInMarkdown("מחיר רגיל 199 ₪ מחיר רגיל 269 ₪ במבצע 199 ₪");
    expect(found?.amount).toBe(199);
  });

  it("prefers an English sale price over the list price", () => {
    const found = detectPriceInMarkdown("Regular price $269.00 Sale price $199.00");
    expect(found?.amount).toBe(199);
  });

  it("falls back to the only price when there is no sale label", () => {
    expect(detectPriceInMarkdown("מחיר רגיל 269.00 ₪")?.amount).toBe(269);
  });
});

describe("detectPriceInMarkdown — USD conversion", () => {
  it("converts the native amount into USD using the shared FX snapshot", () => {
    const found = detectPriceInMarkdown("מחיר רגיל 238 ₪");
    expect(found?.amountUsd).toBeCloseTo(238 / CURRENCIES.ILS.fxFromUsd, 4);
  });

  it("leaves USD amounts untouched", () => {
    const found = detectPriceInMarkdown("Price: $30.00");
    expect(found?.amountUsd).toBe(30);
  });

  /**
   * The whole point of the fix: a shekel price read as dollars inflates the
   * store price ~3.7×, which then feeds the markup ratio the dropship verdict
   * is built on.
   */
  it("does not report a shekel amount as if it were dollars", () => {
    const found = detectPriceInMarkdown("מחיר רגיל 238 ₪");
    expect(found?.amountUsd).toBeLessThan(100);
    expect(found?.amount).toBe(238);
  });
});

describe("extractPriceFromMarkdown — USD-only wrapper", () => {
  it("returns the CONVERTED usd value, not the native amount", () => {
    // AliExpress listings are USD, so this caller is unaffected in practice —
    // but if a page is in shekels the wrapper must not leak a native number
    // into a field named *Usd.
    expect(extractPriceFromMarkdown("מחיר רגיל 238 ₪")).toBeCloseTo(
      238 / CURRENCIES.ILS.fxFromUsd,
      4,
    );
  });

  it("returns null when nothing is found", () => {
    expect(extractPriceFromMarkdown("no prices here")).toBeNull();
  });

  it("is unchanged for the USD pages the AliExpress parser sees", () => {
    expect(extractPriceFromMarkdown("US $12.99")).toBe(12.99);
  });
});
