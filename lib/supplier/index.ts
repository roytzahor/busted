/**
 * Multi-supplier subsystem — public surface.
 *
 * Status: SCAFFOLDING. Not yet wired into the live analyze pipeline
 * (app/api/analyze/route.ts still uses the AliExpress-specific find-supplier
 * path). Integration is a deliberate follow-up, gated on at least one
 * non-AliExpress provider having a real official-API client + hand-labeled
 * multi-supplier eval fixtures to measure against.
 */

export * from "@/lib/supplier/types";
export {
  SUPPLIER_PROVIDERS,
  getEnabledProviders,
} from "@/lib/supplier/providers";
export {
  DEFAULT_SEARCH_BUDGET_MS,
  searchAllSuppliers,
  aggregateSupplierSearch,
  searchAndScoreSuppliers,
  toMatchCandidate,
  type RouterSearchOptions,
  type SupplierRouterResult,
  type ProviderRunStat,
  type ScoredSupplierCandidate,
} from "@/lib/supplier/router";
