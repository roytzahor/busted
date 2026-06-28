/**
 * Multi-supplier abstraction — unified contract every supplier network adapter
 * implements so the router can fan out one search across many networks.
 *
 * SCOPE NOTE (read before extending): this subsystem is scaffolding. Only the
 * AliExpress adapter is backed by a live, configured API today. CJ Dropshipping
 * and Zendrop adapters are credential-gated and intentionally return NO data
 * until their official partner/affiliate API clients are implemented — we never
 * synthesize candidates, because fabricated supplier data would silently
 * corrupt match-confidence scoring and any evaluation built on top of it.
 *
 * Networks that only expose data behind anti-bot/ToS barriers (DHgate, Temu,
 * 1688) are deliberately OUT of scope: official-API sourcing only.
 */

export type SupplierProvider =
  | "aliexpress"
  | "cjdropshipping"
  | "zendrop"
  | "temu"
  | "dhgate"
  | "1688";

/**
 * A normalized supplier listing. `trustScore` is provider-normalized to 0..1
 * (the adapter is responsible for mapping its native trust signals — order
 * volume, seller rating, fulfillment SLA — into this band) so the router can
 * compare candidates across heterogeneous networks on one scale.
 */
export interface SupplierCandidate {
  id: string;
  title: string;
  priceUsd: number;
  imageUrl: string;
  affiliateLink: string;
  storeName: string;
  sourceProvider: SupplierProvider;
  /** Provider-normalized trust, 0 (unknown) … 1 (highly trusted). */
  trustScore: number;
}

export interface SupplierSearchOptions {
  /** ISO-2 country the buyer ships to — affects price/availability. */
  shipToCountry?: string;
  /** ISO-4217 currency for price quotes. */
  targetCurrency?: string;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  /** Max candidates to return per provider. */
  limit?: number;
  /**
   * Abort signal wired by the router to the per-scan time budget so a slow
   * network can be cancelled instead of holding a serverless invocation open.
   */
  signal?: AbortSignal;
}

export interface ISupplierProvider {
  /** Human-readable name for logs/UI. */
  name: string;
  /** Stable machine key (matches SupplierCandidate.sourceProvider). */
  readonly provider: SupplierProvider;
  /**
   * True only when this adapter has everything it needs to make a live call
   * (API keys, tokens). The router skips unconfigured providers silently, so a
   * missing CJ token degrades gracefully to "AliExpress only" rather than
   * erroring the scan.
   */
  isConfigured(): boolean;
  searchByText(
    keywords: string[],
    opts?: SupplierSearchOptions,
  ): Promise<SupplierCandidate[]>;
}

export const SUPPLIER_ERROR = {
  /** Adapter is missing credentials — should be filtered out before calling. */
  NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  /** Adapter is configured but its official-API client isn't implemented yet. */
  NOT_IMPLEMENTED: "PROVIDER_NOT_IMPLEMENTED",
  /** The provider call exceeded the router's time budget. */
  TIMEOUT: "PROVIDER_TIMEOUT",
  /** Upstream API error. */
  UPSTREAM: "PROVIDER_UPSTREAM_ERROR",
} as const;

export type SupplierErrorCode =
  (typeof SUPPLIER_ERROR)[keyof typeof SUPPLIER_ERROR];

export class SupplierProviderError extends Error {
  readonly code: SupplierErrorCode;
  readonly provider: SupplierProvider;

  constructor(
    provider: SupplierProvider,
    code: SupplierErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SupplierProviderError";
    this.provider = provider;
    this.code = code;
  }
}
