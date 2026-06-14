import { isAliExpressApiConfigured } from "@/lib/aliexpress/api-client";

/** Supplier search runs only when AliExpress Affiliate API keys are configured. */
export function isSupplierSearchEnabled(): boolean {
  return isAliExpressApiConfigured();
}
