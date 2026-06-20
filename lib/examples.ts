/**
 * Example product URLs shown as one-click chips on the empty homepage.
 *
 * Strategy (Sprint 12 Stage 33):
 *  - Primary source: `/api/examples/featured` returns the freshest, high-savings
 *    cached scans from the DB. Always fresh, always backed by a successful scan.
 *  - Fallback: the hardcoded list below. Only used when the API errors or
 *    returns an empty array.
 */

export interface DemoExample {
  /** Short label rendered on the chip. */
  label: string;
  /** Indicative savings — purely for the chip preview, real number comes from the scan. */
  savingsHint: string;
  /** Source product URL to scan. */
  url: string;
  /** Persisted ScannedProduct.id when sourced from the featured API. */
  scanId?: string;
}

/**
 * Hardcoded fallback — only displayed when `/api/examples/featured` returns
 * zero rows (e.g. fresh deploy with empty DB). Keep this short and verified.
 */
export const DEMO_EXAMPLES_FALLBACK: DemoExample[] = [
  {
    label: "Wool loungers",
    savingsHint: "save ~80%",
    url: "https://www.allbirds.com/products/mens-wool-loungers",
  },
];

/**
 * Fetch the live featured-examples list. Returns the fallback list when the
 * API errors or yields nothing. Safe to call from a client component.
 */
export async function fetchFeaturedExamples(
  signal?: AbortSignal,
): Promise<DemoExample[]> {
  try {
    const res = await fetch("/api/examples/featured", {
      signal,
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { examples?: DemoExample[] };
    if (Array.isArray(body.examples) && body.examples.length > 0) {
      return body.examples;
    }
  } catch {
    // swallow — falls back below
  }
  return DEMO_EXAMPLES_FALLBACK;
}
