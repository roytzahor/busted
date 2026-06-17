/**
 * ProductIdentifierService — scrape → canonical ProductIdentity
 *
 * Phase 3: ships behind IDENTIFIER_ENABLED flag (default ON). Wired
 * before the verdict step so its events appear in the timeline, but
 * downstream services don't consume it yet (the wire-up moves accuracy
 * in Phase 4).
 *
 * If the call fails or returns no identity, the orchestrator falls back
 * to today's behavior — title-derived keywords for search.
 */

import { createHash } from "node:crypto";
import {
  IDENTIFIER_PROMPT_VERSION,
  identifyProduct,
  isIdentifierEnabled,
} from "@/lib/ai/product-identifier";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import { runService } from "@/lib/services/run";
import { cacheOrRun } from "@/lib/services/stage-cache";
import { err, ok, type Result, type ProductIdentity } from "@/lib/services/types";

function inputHash(attributes: ScrapedProductAttributes, markdown: string): string {
  // Hash the fields that meaningfully affect the identity output.
  // Markdown is hashed not stored — keeps key small.
  return createHash("sha256")
    .update(attributes.title)
    .update("|")
    .update(attributes.description.slice(0, 800))
    .update("|")
    .update(attributes.mainImageUrl ?? "no-image")
    .update("|")
    .update(markdown.slice(0, 1500))
    .digest("hex");
}

export interface ProductIdentifierInput {
  attributes: ScrapedProductAttributes;
  markdown: string;
}

export interface ProductIdentifierOutput {
  identity: ProductIdentity | null;
  model: string;
  rawResponse: string;
}

export async function identify(
  input: ProductIdentifierInput,
): Promise<Result<ProductIdentifierOutput>> {
  return runService("product-identifier", "identify", async (emit) => {
    if (!isIdentifierEnabled()) {
      emit("identify:disabled", "IDENTIFIER_ENABLED=false — skipping");
      return ok<ProductIdentifierOutput>({ identity: null, model: "disabled", rawResponse: "" });
    }

    emit("identify:start", "Calling Gemini Vision identifier", {
      hasImage: input.attributes.mainImageUrl !== null,
    });

    // Stage cache: keyed on hash of input + prompt version. If a prior scan
    // of this exact title+image produced an identity, reuse it. Stage cache
    // is a no-op unless STAGE_CACHE_ENABLED=true (Phase 6 default ON in prod).
    const hash = inputHash(input.attributes, input.markdown);
    const { payload: result, cacheHit } = await cacheOrRun(
      "identify",
      IDENTIFIER_PROMPT_VERSION,
      hash,
      () =>
        identifyProduct({
          title: input.attributes.title,
          description: input.attributes.description,
          imageUrl: input.attributes.mainImageUrl,
          markdownExcerpt: input.markdown,
        }),
    );

    if (cacheHit) {
      emit("identify:cache-hit", "Identity restored from stage cache");
    }

    if (!result.identity) {
      // Failure is recoverable — orchestrator continues with null identity
      return err<ProductIdentifierOutput>({
        code: "IDENTIFIER_UNAVAILABLE",
        message: result.error ?? "Identifier returned no identity",
        recoverable: true,
        cause: result,
      });
    }

    emit(
      "identify:done",
      `${result.identity.canonicalName} (${result.identity.source}, conf ${Math.round(result.identity.confidence * 100)}%)`,
      {
        canonicalName: result.identity.canonicalName,
        category: result.identity.category,
        productType: result.identity.productType,
        primaryKeywords: result.identity.searchKeywords.primary,
        visualTerms: result.identity.searchKeywords.visualTerms,
        confidence: result.identity.confidence,
        source: result.identity.source,
        model: result.model,
      },
    );

    return ok<ProductIdentifierOutput>({
      identity: result.identity,
      model: result.model,
      rawResponse: result.rawResponse,
    });
  });
}
