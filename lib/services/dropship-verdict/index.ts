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
import { err, ok, type ProductIdentity, type Result } from "@/lib/services/types";
import { isTier0Enabled, runStoreFingerprint } from "@/lib/tier0/store-fingerprint";

export interface DropshipVerdictInput {
  url: string;
  attributes: ScrapedProductAttributes;
  markdown: string;
  /** Raw page HTML when the scraper captured it — enables Tier-0 app-footprint signals. */
  html?: string;
  storePriceUsd: number | null;
  /** Vision-grounded identity from ProductIdentifierService, when available.
   *  Passed to the AI verifier as corroborating evidence. */
  identity?: ProductIdentity | null;
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

    // Tier-0 fingerprint gate — deterministic multi-signal detection of
    // template dropship stores. Fires only on overwhelming static evidence
    // (see lib/tier0/store-fingerprint.ts) and short-circuits the AI call.
    // TIER0_FINGERPRINT_ENABLED=false is the kill switch.
    if (isTier0Enabled()) {
      const tier0 = runStoreFingerprint({
        attributes: input.attributes,
        markdown: input.markdown,
        html: input.html,
        storePriceUsd: input.storePriceUsd,
      });
      if (tier0.fired && tier0.prediction) {
        emit(
          "verify:tier0",
          `Tier-0 fingerprint verdict in ${tier0.elapsedMs.toFixed(1)}ms — AI call skipped`,
          {
            verdict: tier0.prediction.verdict,
            confidence: tier0.prediction.confidence,
            signals: tier0.signals,
          },
        );
        return ok<DropshipVerdictOutput>({
          prediction: tier0.prediction,
          provider: "rules",
          model: "tier0-store-fingerprint",
          rawResponse: JSON.stringify(tier0.prediction, null, 2),
          error: null,
          isSupplierListing: false,
        });
      }
    }

    emit("verify:ai", "Calling AI dropship verifier", {
      identityGrounded: input.identity != null,
    });
    const aiResult = await verifyDropshipLikelihood({
      attributes: input.attributes,
      markdownExcerpt: input.markdown,
      storePriceUsd: input.storePriceUsd,
      identity: input.identity ?? null,
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
