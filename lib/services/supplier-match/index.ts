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
  AliExpressSearchError,
  type SupplierMatchResult,
} from "@/lib/aliexpress/types";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import { runService } from "@/lib/services/run";
import { err, ok, type Result } from "@/lib/services/types";

export interface SupplierMatchInput {
  attributes: ScrapedProductAttributes;
  storePriceUsd: number | null;
  prediction: DropshipPrediction | null;
  isSupplierListing: boolean;
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

    emit("find:start", "Running supplier search");
    try {
      const match = await findAliExpressSupplier({
        attributes: input.attributes,
        storePriceUsd: input.storePriceUsd,
        productCategory: input.prediction?.productCategory,
        aiKeywords: input.prediction?.aliexpressKeywords,
      });

      emit("find:done", `Match: ${match.searchMeta.winnerProductId} (${(match.matchConfidence * 100).toFixed(0)}% confidence)`, {
        winnerProductId: match.searchMeta.winnerProductId,
        candidateCount: match.searchMeta.candidateCount,
        matchConfidence: match.matchConfidence,
        matchQuality: match.matchQuality,
        imageMatchScore: match.imageMatchScore,
      });

      return ok<SupplierMatchOutput>({ kind: "matched", match });
    } catch (e) {
      if (e instanceof AliExpressSearchError) {
        const isSoftSkip =
          e.code === "ALIEXPRESS_NO_CONFIDENT_MATCH" ||
          e.code === "ALIEXPRESS_NO_RESULTS";
        emit("find:soft-skip", e.message, { code: e.code });
        if (isSoftSkip) {
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
