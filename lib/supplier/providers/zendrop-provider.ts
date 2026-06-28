/**
 * Zendrop adapter — SKELETON.
 *
 * IMPORTANT caveat (see `lib/supplier/research-manifest.json`): Zendrop's public
 * API is primarily fulfillment/order oriented, and a public product-CATALOG
 * search endpoint may be partner-gated or unavailable. If the researcher
 * confirms no public catalog search exists, this provider stays disabled and
 * `isConfigured()` should remain false even when a key is present — there is
 * nothing legitimate to search against.
 *
 * Same honesty contract as the CJ adapter: no fabricated candidates, ever.
 */

import {
  SupplierProviderError,
  SUPPLIER_ERROR,
  type ISupplierProvider,
  type SupplierCandidate,
} from "@/lib/supplier/types";

export const zendropProvider: ISupplierProvider = {
  name: "Zendrop",
  provider: "zendrop",

  isConfigured(): boolean {
    // Requires BOTH an API key AND an explicit opt-in flag confirming a
    // partner catalog-search entitlement exists, because Zendrop's public API
    // may not expose catalog search at all.
    return (
      Boolean(process.env.ZENDROP_API_KEY) &&
      process.env.ZENDROP_CATALOG_SEARCH_ENABLED === "true"
    );
  },

  async searchByText(): Promise<SupplierCandidate[]> {
    throw new SupplierProviderError(
      "zendrop",
      SUPPLIER_ERROR.NOT_IMPLEMENTED,
      "Zendrop catalog-search client is not implemented. Confirm a partner " +
        "catalog-search API entitlement (see lib/supplier/research-manifest.json) " +
        "before enabling. This adapter never returns synthetic data.",
    );
  },
};
