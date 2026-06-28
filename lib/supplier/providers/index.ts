/**
 * Provider registry. To add a network: implement an ISupplierProvider adapter
 * in this directory and append it here. The router only ever queries providers
 * whose `isConfigured()` returns true, so listing one without credentials is
 * safe — it's simply skipped.
 *
 * Focus: B2C global marketplaces with official, ToS-compliant affiliate APIs.
 */

import type { ISupplierProvider } from "@/lib/supplier/types";
import { aliexpressProvider } from "@/lib/supplier/providers/aliexpress-provider";
import { ebayProvider } from "@/lib/supplier/providers/ebay-provider";
import { amazonProvider } from "@/lib/supplier/providers/amazon-provider";

/** All known adapters, in priority order. */
export const SUPPLIER_PROVIDERS: readonly ISupplierProvider[] = [
  aliexpressProvider,
  ebayProvider,
  amazonProvider,
];

/** Providers that are ready to make a live call right now. */
export function getEnabledProviders(): ISupplierProvider[] {
  return SUPPLIER_PROVIDERS.filter((p) => p.isConfigured());
}
