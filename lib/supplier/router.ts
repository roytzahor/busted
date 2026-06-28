/**
 * Multi-supplier router — fans one keyword search out across every configured
 * provider concurrently, consolidates the pool, and (optionally) scores it with
 * the existing `computeMatchConfidence`.
 *
 * DevOps guards:
 *  - Hard time budget (default 3.5s, under the 4s serverless ceiling) enforced
 *    two ways: an AbortSignal passed to each provider AND a per-provider
 *    deadline race, so a network that ignores the signal still can't stall the
 *    scan.
 *  - Providers run via Promise.allSettled — one dead/slow network never fails
 *    the others (graceful degradation to "AliExpress only").
 *
 * Honesty note: this router only ever sees whatever the adapters return. The
 * CJ/Zendrop adapters return nothing until their official clients are built, so
 * today this consolidates exactly one real source (AliExpress). It does NOT
 * fabricate cross-provider candidates to inflate any metric.
 */

import {
  computeMatchConfidence,
  type MatchConfidence,
} from "@/lib/aliexpress/match-confidence";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import {
  SupplierProviderError,
  SUPPLIER_ERROR,
  type ISupplierProvider,
  type SupplierCandidate,
  type SupplierProvider,
  type SupplierSearchOptions,
} from "@/lib/supplier/types";
import { getEnabledProviders } from "@/lib/supplier/providers";

/** Total concurrent-search budget. Kept under the 4s serverless ceiling. */
export const DEFAULT_SEARCH_BUDGET_MS = 3500;

export interface RouterSearchOptions extends SupplierSearchOptions {
  /** Override the concurrent time budget (ms). */
  budgetMs?: number;
  /**
   * Per-provider multiplier applied to each candidate's trustScore before
   * ranking — the tuning hook for provider trust penalties. Default 1.0.
   */
  providerTrustWeights?: Partial<Record<SupplierProvider, number>>;
}

export interface ProviderRunStat {
  provider: SupplierProvider;
  ok: boolean;
  count: number;
  ms: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface SupplierRouterResult {
  candidates: SupplierCandidate[];
  perProvider: ProviderRunStat[];
  providersQueried: number;
  totalMs: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Reject if the provider hasn't resolved within `ms`, regardless of signal. */
function withDeadline<T>(
  p: Promise<T>,
  ms: number,
  provider: SupplierProvider,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new SupplierProviderError(
          provider,
          SUPPLIER_ERROR.TIMEOUT,
          `Provider exceeded the ${ms}ms search budget.`,
        ),
      );
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Stable dedup key — same product surfacing from two feeds collapses to one. */
function dedupeKey(c: SupplierCandidate): string {
  const titleKey = c.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return `${titleKey}|${Math.round(c.priceUsd)}`;
}

function consolidate(
  groups: SupplierCandidate[][],
  weights: RouterSearchOptions["providerTrustWeights"],
): SupplierCandidate[] {
  const byKey = new Map<string, SupplierCandidate>();
  for (const group of groups) {
    for (const raw of group) {
      const weight = weights?.[raw.sourceProvider] ?? 1;
      const c: SupplierCandidate = {
        ...raw,
        trustScore: clamp01(raw.trustScore * weight),
      };
      // Within-provider exact-id dedup + cross-provider title/price dedup,
      // keeping the higher-trust listing.
      const key = `${c.sourceProvider}:${c.id}`;
      const crossKey = dedupeKey(c);
      const existing = byKey.get(key) ?? byKey.get(crossKey);
      if (!existing || c.trustScore > existing.trustScore) {
        byKey.set(key, c);
        byKey.set(crossKey, c);
      }
    }
  }
  // Map values can contain the same object under two keys — dedupe by identity.
  return [...new Set(byKey.values())].sort((a, b) => b.trustScore - a.trustScore);
}

/**
 * Run every configured provider concurrently within the time budget and return
 * a consolidated, trust-ranked candidate pool plus per-provider diagnostics.
 */
export async function searchAllSuppliers(
  keywords: string[],
  opts: RouterSearchOptions = {},
  providers: ISupplierProvider[] = getEnabledProviders(),
): Promise<SupplierRouterResult> {
  const budgetMs = opts.budgetMs ?? DEFAULT_SEARCH_BUDGET_MS;
  const startedAt = Date.now();

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), budgetMs);
  const callOpts: SupplierSearchOptions = { ...opts, signal: controller.signal };

  const runs = await Promise.allSettled(
    providers.map(async (provider): Promise<{ stat: ProviderRunStat; candidates: SupplierCandidate[] }> => {
      const t0 = Date.now();
      try {
        const candidates = await withDeadline(
          provider.searchByText(keywords, callOpts),
          budgetMs,
          provider.provider,
        );
        return {
          stat: { provider: provider.provider, ok: true, count: candidates.length, ms: Date.now() - t0 },
          candidates,
        };
      } catch (e) {
        const code = e instanceof SupplierProviderError ? e.code : SUPPLIER_ERROR.UPSTREAM;
        return {
          stat: {
            provider: provider.provider,
            ok: false,
            count: 0,
            ms: Date.now() - t0,
            errorCode: code,
            errorMessage: e instanceof Error ? e.message : String(e),
          },
          candidates: [],
        };
      }
    }),
  );
  clearTimeout(abortTimer);

  const perProvider: ProviderRunStat[] = [];
  const groups: SupplierCandidate[][] = [];
  for (const r of runs) {
    if (r.status === "fulfilled") {
      perProvider.push(r.value.stat);
      groups.push(r.value.candidates);
    }
  }

  return {
    candidates: consolidate(groups, opts.providerTrustWeights),
    perProvider,
    providersQueried: providers.length,
    totalMs: Date.now() - startedAt,
  };
}

/**
 * Bridge a normalized SupplierCandidate into the shape `computeMatchConfidence`
 * expects. The order/rating fields are SYNTHESIZED from the normalized
 * trustScore — a provisional mapping; calibrate per provider once real native
 * trust data is available for non-AliExpress networks.
 */
export function toMatchCandidate(c: SupplierCandidate): AliExpressProductCandidate {
  return {
    productId: `${c.sourceProvider}:${c.id}`,
    title: c.title,
    priceUsd: c.priceUsd,
    productUrl: c.affiliateLink,
    imageUrl: c.imageUrl || null,
    orderCount: Math.round(c.trustScore * 1000),
    sellerRating: +(3.5 + c.trustScore * 1.5).toFixed(2),
    shippingDays: null,
    promotionLink: null,
  };
}

export interface ScoredSupplierCandidate {
  candidate: SupplierCandidate;
  confidence: MatchConfidence;
}

/**
 * Convenience: search all suppliers, then score the consolidated pool with the
 * existing match-confidence engine (same scorer the AliExpress path uses), so
 * cross-network candidates compete on one ranking.
 */
export async function searchAndScoreSuppliers(args: {
  scrapedAttrs: ScrapedProductAttributes;
  storePriceUsd: number | null;
  keywords: string[];
  /** AI productCategory + functional keywords, for the title-overlap bridge. */
  extraMatchTerms?: string;
  opts?: RouterSearchOptions;
}): Promise<{ scored: ScoredSupplierCandidate[]; router: SupplierRouterResult }> {
  const router = await searchAllSuppliers(args.keywords, args.opts);
  const scored = router.candidates
    .map((candidate) => ({
      candidate,
      confidence: computeMatchConfidence(
        args.scrapedAttrs,
        args.storePriceUsd,
        toMatchCandidate(candidate),
        args.extraMatchTerms,
      ),
    }))
    .sort((a, b) => b.confidence.score - a.confidence.score);
  return { scored, router };
}
