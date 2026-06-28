/**
 * Provider registry. To add a network: implement an ISupplierProvider adapter
 * in this directory and append it here. The router only ever queries providers
 * whose `isConfigured()` returns true, so listing an unimplemented one is safe.
 */

import type { ISupplierProvider } from "@/lib/supplier/types";
import { aliexpressProvider } from "@/lib/supplier/providers/aliexpress-provider";
import { cjDropshippingProvider } from "@/lib/supplier/providers/cj-provider";
import { zendropProvider } from "@/lib/supplier/providers/zendrop-provider";

/** All known adapters, in priority order. */
export const SUPPLIER_PROVIDERS: readonly ISupplierProvider[] = [
  aliexpressProvider,
  cjDropshippingProvider,
  zendropProvider,
];

/** Providers that are ready to make a live call right now. */
export function getEnabledProviders(): ISupplierProvider[] {
  return SUPPLIER_PROVIDERS.filter((p) => p.isConfigured());
}
