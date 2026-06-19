/**
 * Example product URLs shown as one-click chips on the empty homepage.
 *
 * These are real Shopify-style listings we've vetted through the pipeline so
 * a first-time visitor gets a "wow" demo in one click. Rotate when a chip
 * starts returning low-quality matches; keep the list small so they fit on a
 * single mobile row.
 */

export interface DemoExample {
  /** Short label rendered on the chip. */
  label: string;
  /** Indicative savings — purely for the chip preview, real number comes from the scan. */
  savingsHint: string;
  /** Source product URL to scan. */
  url: string;
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    label: "Shower steamers",
    savingsHint: "save ~85%",
    url: "https://www.calmo.co.il/products/shower-steamers",
  },
  {
    label: "Phone case",
    savingsHint: "save ~80%",
    url: "https://www.casetify.com/product/clear-iphone-15-case",
  },
  {
    label: "Slippers",
    savingsHint: "save ~70%",
    url: "https://www.allbirds.com/products/mens-wool-loungers",
  },
];
