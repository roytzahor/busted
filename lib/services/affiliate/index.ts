/**
 * AffiliateService — product URL → affiliate URL + validation
 *
 * Thin wrapper around convertToAffiliateLink + validateAffiliateLink.
 * Currently MatchVerifier calls these directly inside findAliExpressSupplier;
 * this service exists so future code paths (e.g. direct affiliate
 * conversion, link-only endpoints) can reuse the same contract.
 */

import { convertToAffiliateLink } from "@/lib/affiliate/convert-link";
import { validateAffiliateLink } from "@/lib/affiliate/validate-link";
import { runService } from "@/lib/services/run";
import { err, ok, type Result } from "@/lib/services/types";

export interface AffiliateInput {
  productUrl: string;
  promotionLink?: string | null;
}

export interface AffiliateOutput {
  affiliateUrl: string;
  validated: boolean;
  provider: "aliexpress_api" | "admitad" | "direct";
  /** True if we returned the raw product URL as fallback (validation failed) */
  fallback: boolean;
}

export async function resolve(input: AffiliateInput): Promise<Result<AffiliateOutput>> {
  return runService("affiliate", "resolve", async (emit) => {
    emit("convert:start", "Converting to affiliate URL", {
      productUrl: input.productUrl,
      hasPromotionLink: Boolean(input.promotionLink),
    });

    try {
      const { affiliateUrl, provider } = await convertToAffiliateLink({
        productUrl: input.productUrl,
        existingPromotionLink: input.promotionLink ?? undefined,
      });

      const validated = await validateAffiliateLink(affiliateUrl);
      emit("convert:done", `Affiliate via ${provider}${validated ? " (validated)" : " (validation failed — using product URL)"}`, {
        provider,
        validated,
      });

      return ok<AffiliateOutput>({
        affiliateUrl: validated ? affiliateUrl : input.productUrl,
        validated,
        provider,
        fallback: !validated,
      });
    } catch (e) {
      return err<AffiliateOutput>({
        code: "AFFILIATE_RESOLVE_FAILED",
        message: e instanceof Error ? e.message : "Affiliate resolution failed",
        recoverable: true,
        cause: e,
      });
    }
  });
}
