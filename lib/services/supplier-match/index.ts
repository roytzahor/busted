/**
 * SupplierMatchService — scrape + verdict → matched AliExpress supplier
 *
 * Phase 2: thin wrapper around findAliExpressSupplier (no behavior change).
 * It bundles candidate search + match verification + affiliate conversion
 * into a single service call.
 *
 * Phase 4: will be split into CandidateSearchService + MatchVerifierService
 * with the orchestrator owning the retry loop. Affiliate conversion will
 * move out to its own service (already exists at lib/services/affiliate/).
 */

import { isSupplierSearchEnabled } from "@/lib/aliexpress/supplier-enabled";
import { findAliExpressSupplier } from "@/lib/aliexpress/find-supplier";
import {
  findCrossNetworkSupplier,
  isMultiSupplierEnabled,
} from "@/lib/supplier/fallback-match";
import {
  AliExpressSearchError,
  type SupplierMatchResult,
} from "@/lib/aliexpress/types";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import { runService } from "@/lib/services/run";
import { err, ok, type ProductIdentity, type Result } from "@/lib/services/types";

export interface SupplierMatchInput {
  attributes: ScrapedProductAttributes;
  storePriceUsd: number | null;
  prediction: DropshipPrediction | null;
  isSupplierListing: boolean;
  /** Phase 4: vision-grounded identity. When present, its keywords win. */
  identity?: ProductIdentity | null;
  /**
   * Escalation trigger. When true (e.g. a forced re-scan after a "wrong"
   * verdict), the matcher forces the Tier-2 vision preprocess on regardless
   * of the cheap-arm trigger threshold or the global PREPROCESS_ENABLED flag.
   */
  escalate?: boolean;
}

export type SupplierMatchOutput =
  | { kind: "matched"; match: SupplierMatchResult }
  | { kind: "skipped"; reason: string }
  | { kind: "no_match"; reason: string };

export async function findSupplier(
  input: SupplierMatchInput,
): Promise<Result<SupplierMatchOutput>> {
  return runService("supplier-match", "find", async (emit) => {
    // Skip cases that are well-defined
    if (input.isSupplierListing) {
      emit("find:skip", "Already on supplier marketplace");
      return ok<SupplierMatchOutput>({
        kind: "skipped",
        reason: "Already on supplier marketplace",
      });
    }

    if (!isSupplierSearchEnabled()) {
      emit("find:skip", "AliExpress API not configured");
      return ok<SupplierMatchOutput>({
        kind: "skipped",
        reason: "AliExpress Affiliate API keys are not configured in .env",
      });
    }

    const verdict = input.prediction?.verdict;
    if (verdict === "not_a_product" || verdict === "insufficient_evidence") {
      const label = verdict === "not_a_product" ? "not a product page" : "insufficient evidence";
      emit("find:skip", `AI verdict (${label}) — no supplier search performed`);
      return ok<SupplierMatchOutput>({
        kind: "skipped",
        reason: `AI verdict (${label}) — no supplier search performed.`,
      });
    }

    emit("find:start", "Running supplier search", {
      keywordSource: input.identity ? "vision-grounded-identity" : "text-only-verdict",
    });

    const fallbackInput = {
      attributes: input.attributes,
      storePriceUsd: input.storePriceUsd,
      productCategory: input.prediction?.productCategory,
      aiKeywords: input.prediction?.aliexpressKeywords,
      identity: input.identity ?? null,
    };
    const runFallback = (): Promise<SupplierMatchResult | null> =>
      isMultiSupplierEnabled()
        ? findCrossNetworkSupplier(fallbackInput)
        : Promise.resolve(null);

    const emitMatch = (match: SupplierMatchResult, source: string): void => {
      emit(
        "find:done",
        `Match: ${match.searchMeta.winnerProductId} (${(match.matchConfidence * 100).toFixed(0)}% confidence, ${source})`,
        {
          winnerProductId: match.searchMeta.winnerProductId,
          candidateCount: match.searchMeta.candidateCount,
          matchConfidence: match.matchConfidence,
          matchQuality: match.matchQuality,
          imageMatchScore: match.imageMatchScore,
          sourceNetwork: match.searchMeta.sourceNetwork ?? "aliexpress",
        },
      );
    };

    try {
      const aeMatch = await findAliExpressSupplier({
        ...fallbackInput,
        escalate: input.escalate ?? false,
      });

      // Cost short-circuit: a confident AliExpress match wins outright — no
      // cross-network fan-out. Only escalate to eBay/Amazon when AliExpress is
      // weak (best-effort). Highest confidence wins across networks.
      if (aeMatch.bestEffortOnly) {
        const alt = await runFallback();
        if (alt && alt.matchConfidence > aeMatch.matchConfidence) {
          emitMatch(alt, `cross-network:${alt.searchMeta.sourceNetwork}`);
          return ok<SupplierMatchOutput>({ kind: "matched", match: alt });
        }
      }

      emitMatch(aeMatch, "aliexpress");
      return ok<SupplierMatchOutput>({ kind: "matched", match: aeMatch });
    } catch (e) {
      if (e instanceof AliExpressSearchError) {
        const isSoftSkip =
          e.code === "ALIEXPRESS_NO_CONFIDENT_MATCH" ||
          e.code === "ALIEXPRESS_NO_RESULTS";
        emit("find:soft-skip", e.message, { code: e.code });
        if (isSoftSkip) {
          // AliExpress found nothing usable — try the other networks before
          // giving up, so a scan still returns an affiliate link when possible.
          const alt = await runFallback();
          if (alt) {
            emitMatch(alt, `cross-network:${alt.searchMeta.sourceNetwork}`);
            return ok<SupplierMatchOutput>({ kind: "matched", match: alt });
          }
          return ok<SupplierMatchOutput>({ kind: "no_match", reason: e.message });
        }
        return err<SupplierMatchOutput>({
          code: e.code,
          message: e.message,
          recoverable: false,
          cause: e,
        });
      }
      throw e;
    }
  });
}
