/**
 * DropshipVerdictService — scrape + identity → AI verdict
 *
 * Wraps verifyDropshipLikelihood (for retail URLs) and
 * buildSupplierMarketplacePrediction (for AliExpress/Temu/etc URLs).
 *
 * Phase 2: receives the same inputs as today (no identity yet).
 * Phase 3+: will receive ProductIdentity, eventually stop generating
 * its own keywords (Identifier owns them).
 */

import {
  verifyDropshipLikelihood,
  type DropshipPrediction,
} from "@/lib/ai/dropship-verifier";
import { buildSupplierMarketplacePrediction } from "@/lib/ai/supplier-marketplace-analysis";
import { detectProductSource } from "@/lib/scraping/detect-source";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import { runService } from "@/lib/services/run";
import { err, ok, type Result } from "@/lib/services/types";

export interface DropshipVerdictInput {
  url: string;
  attributes: ScrapedProductAttributes;
  markdown: string;
  storePriceUsd: number | null;
}

export interface DropshipVerdictOutput {
  prediction: DropshipPrediction | null;
  provider: string;
  model: string;
  rawResponse: string;
  error: string | null;
  isSupplierListing: boolean;
}

export async function verify(
  input: DropshipVerdictInput,
): Promise<Result<DropshipVerdictOutput>> {
  return runService("dropship-verdict", "verify", async (emit) => {
    const sourceType = detectProductSource(input.url);
    const isSupplierListing = sourceType === "supplier_marketplace";

    if (isSupplierListing) {
      const prediction = buildSupplierMarketplacePrediction(
        input.url,
        input.attributes,
        input.storePriceUsd,
      );
      emit("verify:rules", "Source is a supplier marketplace — rule-based verdict", {
        verdict: prediction.verdict,
        confidence: prediction.confidence,
      });
      return ok<DropshipVerdictOutput>({
        prediction,
        provider: "rules",
        model: "supplier-marketplace-detector",
        rawResponse: JSON.stringify(prediction, null, 2),
        error: null,
        isSupplierListing: true,
      });
    }

    emit("verify:ai", "Calling AI dropship verifier");
    const aiResult = await verifyDropshipLikelihood({
      attributes: input.attributes,
      markdownExcerpt: input.markdown,
      storePriceUsd: input.storePriceUsd,
    });

    if (aiResult.prediction) {
      emit("verify:done", `Verdict ${aiResult.prediction.verdict} at ${Math.round(aiResult.prediction.confidence * 100)}%`, {
        verdict: aiResult.prediction.verdict,
        confidence: aiResult.prediction.confidence,
        category: aiResult.prediction.productCategory,
        keywords: aiResult.prediction.aliexpressKeywords,
        model: aiResult.model,
      });
      return ok<DropshipVerdictOutput>({
        prediction: aiResult.prediction,
        provider: aiResult.provider,
        model: aiResult.model,
        rawResponse: aiResult.rawResponse,
        error: aiResult.error,
        isSupplierListing: false,
      });
    }

    // AI failed to parse — recoverable, callers can still proceed without verdict
    return err<DropshipVerdictOutput>({
      code: "AI_VERDICT_UNAVAILABLE",
      message: aiResult.error ?? "AI verification failed",
      recoverable: true,
      cause: aiResult,
    });
  });
}
