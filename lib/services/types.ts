/**
 * Shared types for all Busted services.
 *
 * Every service has a sharp interface, returns Result<T> (never throws across
 * the boundary), and emits ServiceEvent[] that the orchestrator aggregates
 * into a timeline for /monitoring.
 */

export type ServiceStatus = "ok" | "skip" | "error" | "degraded";

export interface ServiceEvent {
  service: string;
  stage: string;
  status: ServiceStatus;
  latencyMs: number;
  cacheStatus: "HIT" | "MISS" | "BYPASS";
  message?: string;
  meta?: Record<string, unknown>;
  at: string;
}

export interface ServiceError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
}

export type Result<T> =
  | { ok: true; value: T; events: ServiceEvent[] }
  | { ok: false; error: ServiceError; events: ServiceEvent[] };

export function ok<T>(value: T, events: ServiceEvent[] = []): Result<T> {
  return { ok: true, value, events };
}

export function err<T>(error: ServiceError, events: ServiceEvent[] = []): Result<T> {
  return { ok: false, error, events };
}

/**
 * Canonical product identity — the OUTPUT of ProductIdentifierService.
 * This is the keystone that downstream services use to search and match.
 *
 * Produced by Gemini Vision on the scraped product image + text. Replaces
 * the title-only heuristic that caused "The CapBlast" → "capblast" failures.
 */
export interface ProductIdentity {
  /** "spring-loaded bottle cap launcher" — never the brand name */
  canonicalName: string;
  /** "Toys & Hobbies > Novelty Gadgets" — best-guess AliExpress category */
  category: string;
  /** "handheld launcher" — short product-type label */
  productType: string;
  /** "Mounts on bottle, launches caps via spring tension" — what it DOES */
  functionDescription: string;
  /** Concrete visual features the image revealed */
  visualFeatures: string[];
  /** Best-guess material if observable */
  materialGuess: string | null;
  /** Keywords stratified by specificity */
  searchKeywords: {
    /** 2–3 best terms for AliExpress (most specific) */
    primary: string[];
    /** 2–3 broader category terms (used if pool is small) */
    fallback: string[];
    /** Visual-grounded terms ("spring loaded launcher") */
    visualTerms: string[];
  };
  /** 0..1 — how confident the Identifier is in this identity */
  confidence: number;
  /** Why this identity was chosen (cited from the prompt input) */
  notes: string;
  /** Whether image was used or text-only fallback */
  source: "vision+text" | "text_only_fallback";
}

/**
 * Stable identity hash for caching downstream stages. Computed from the
 * fields that meaningfully affect search/match output. Excludes `notes`
 * and `confidence` so cosmetic re-runs don't invalidate caches.
 */
export function identityCacheKey(identity: ProductIdentity): string {
  return [
    identity.canonicalName.toLowerCase().trim(),
    identity.productType.toLowerCase().trim(),
    identity.searchKeywords.primary.map((k) => k.toLowerCase().trim()).sort().join("|"),
  ].join("::");
}
