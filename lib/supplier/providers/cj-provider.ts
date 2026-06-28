/**
 * CJ Dropshipping adapter — SKELETON.
 *
 * CJ exposes an official developer OpenAPI (token-based auth + product query
 * endpoints). This adapter is wired for that path but the live client is NOT
 * implemented yet — see `lib/supplier/research-manifest.json` for the endpoint
 * spec the researcher captured.
 *
 * Honesty contract: when CJ_DROPSHIPPING_API_TOKEN is absent the router skips
 * this provider (isConfigured → false). When it IS present but the client is
 * unimplemented, searchByText throws loudly rather than returning fabricated
 * candidates — we never feed synthetic supplier data into match scoring.
 */

import {
  SupplierProviderError,
  SUPPLIER_ERROR,
  type ISupplierProvider,
  type SupplierCandidate,
} from "@/lib/supplier/types";

export const cjDropshippingProvider: ISupplierProvider = {
  name: "CJ Dropshipping",
  provider: "cjdropshipping",

  isConfigured(): boolean {
    return Boolean(process.env.CJ_DROPSHIPPING_API_TOKEN);
  },

  async searchByText(): Promise<SupplierCandidate[]> {
    throw new SupplierProviderError(
      "cjdropshipping",
      SUPPLIER_ERROR.NOT_IMPLEMENTED,
      "CJ Dropshipping official-API client is not implemented yet. " +
        "Implement against the OpenAPI spec in lib/supplier/research-manifest.json " +
        "before enabling. This adapter never returns synthetic data.",
    );
  },
};
