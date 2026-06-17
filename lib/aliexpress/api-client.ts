import {
  getShanghaiTimestamp,
  signAffiliateRequest,
} from "@/lib/aliexpress/sign-request";
import {
  parseEvaluateRateToStars,
  rankAliExpressCandidates,
} from "@/lib/aliexpress/rank-products";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import { AliExpressSearchError } from "@/lib/aliexpress/types";

const DEFAULT_API_URL = "https://api-sg.aliexpress.com/sync";

interface AffiliateApiProduct {
  product_id?: number | string;
  product_title?: string;
  product_detail_url?: string;
  product_main_image_url?: string;
  promotion_link?: string;
  sale_price?: string;
  target_sale_price?: string;
  target_sale_price_currency?: string;
  lastest_volume?: number | string;
  evaluate_rate?: string;
  ship_to_days?: string | number;
}

function getAffiliateConfig() {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  if (!appKey || !appSecret) {
    return null;
  }

  return {
    appKey,
    appSecret,
    apiUrl: process.env.ALIEXPRESS_API_URL ?? DEFAULT_API_URL,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? "busted",
    shipToCountry: process.env.ALIEXPRESS_SHIP_TO_COUNTRY ?? "US",
    deliveryDays: process.env.ALIEXPRESS_DELIVERY_DAYS ?? "10",
  };
}

function normalizeProducts(raw: unknown): AffiliateApiProduct[] {
  if (!raw || typeof raw !== "object") return [];

  if (Array.isArray(raw)) {
    return raw.filter((item): item is AffiliateApiProduct => typeof item === "object");
  }

  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.product)) {
    return record.product.filter(
      (item): item is AffiliateApiProduct => typeof item === "object",
    );
  }

  if (typeof record.product === "object" && record.product !== null) {
    return [record.product as AffiliateApiProduct];
  }

  return [record as AffiliateApiProduct];
}

async function callAffiliateApi(
  method: string,
  businessParams: Record<string, string>,
): Promise<Record<string, unknown>> {
  const config = getAffiliateConfig();
  if (!config) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NOT_CONFIGURED",
      "AliExpress Affiliate API credentials are not configured.",
      500,
    );
  }

  const payload: Record<string, string> = {
    method,
    app_key: config.appKey,
    sign_method: "md5",
    timestamp: getShanghaiTimestamp(),
    format: "json",
    v: "2.0",
    ...businessParams,
  };

  payload.sign = signAffiliateRequest(payload, config.appSecret);

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload),
  });

  if (!response.ok) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_HTTP_ERROR",
      `AliExpress API request failed (${response.status}).`,
      response.status >= 500 ? 500 : 422,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

function mapApiProduct(product: AffiliateApiProduct): AliExpressProductCandidate | null {
  const productId = product.product_id?.toString();
  const title = product.product_title?.trim();
  const productUrl = product.product_detail_url?.trim();

  if (!productId || !title || !productUrl) return null;

  const priceRaw = product.target_sale_price ?? product.sale_price;
  const priceUsd = Number.parseFloat(priceRaw ?? "");
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const orderCount = Number.parseInt(String(product.lastest_volume ?? "0"), 10);

  return {
    productId,
    title,
    priceUsd,
    productUrl,
    imageUrl: product.product_main_image_url ?? null,
    orderCount: Number.isFinite(orderCount) ? orderCount : 0,
    sellerRating: parseEvaluateRateToStars(product.evaluate_rate),
    shippingDays:
      product.ship_to_days !== undefined
        ? Number.parseInt(String(product.ship_to_days), 10)
        : null,
    promotionLink: product.promotion_link ?? null,
  };
}

export function isAliExpressApiConfigured(): boolean {
  return getAffiliateConfig() !== null;
}

export async function searchAliExpressProducts(
  keywords: string,
): Promise<AliExpressProductCandidate[]> {
  const config = getAffiliateConfig();
  if (!config) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NOT_CONFIGURED",
      "AliExpress Affiliate API credentials are not configured.",
      500,
    );
  }

  const response = await callAffiliateApi("aliexpress.affiliate.product.query", {
    keywords,
    page_no: "1",
    page_size: "40",
    sort: "LAST_VOLUME_DESC",
    target_currency: "USD",
    target_language: "EN",
    tracking_id: config.trackingId,
    ship_to_country: config.shipToCountry,
    delivery_days: config.deliveryDays,
    fields:
      "product_id,product_title,product_detail_url,product_main_image_url,promotion_link,sale_price,target_sale_price,lastest_volume,evaluate_rate,ship_to_days",
  });

  const queryResponse = response.aliexpress_affiliate_product_query_response as
    | Record<string, unknown>
    | undefined;

  const respResult = queryResponse?.resp_result as Record<string, unknown> | undefined;
  const respCode = respResult?.resp_code;

  if (respCode !== undefined && Number(respCode) !== 200) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_QUERY_FAILED",
      String(respResult?.resp_msg ?? "AliExpress product query failed."),
      422,
    );
  }

  const result = respResult?.result as Record<string, unknown> | undefined;
  const products = normalizeProducts(result?.products);

  const candidates = products
    .map(mapApiProduct)
    .filter((candidate): candidate is AliExpressProductCandidate => candidate !== null);

  return rankAliExpressCandidates(candidates);
}

/**
 * Image-based candidate search via AliExpress `smartmatch` endpoint.
 *
 * Takes a hosted image URL (the scraped product image) and asks AliExpress
 * to return visually similar products from their catalog. This catches
 * cases where text keywords miss the right product entirely.
 *
 * The endpoint requires API tier access — returns null gracefully on any
 * failure (HTTP error, auth tier mismatch, no results, etc.) so the
 * orchestrator can fall back to keyword arms only.
 *
 * Phase 5 — best-effort, never breaks the pipeline.
 */
export async function searchAliExpressBySmartMatch(
  imageUrl: string,
): Promise<AliExpressProductCandidate[] | null> {
  const config = getAffiliateConfig();
  if (!config) return null;

  try {
    const response = await callAffiliateApi(
      "aliexpress.affiliate.product.smartmatch",
      {
        product_id: "0",
        site: "aliexpress",
        device: "PC",
        country: config.shipToCountry,
        target_currency: "USD",
        target_language: "EN",
        tracking_id: config.trackingId,
        app_signature: imageUrl,
        fields:
          "product_id,product_title,product_detail_url,product_main_image_url,promotion_link,sale_price,target_sale_price,lastest_volume,evaluate_rate,ship_to_days",
      },
    );

    const queryResponse = response.aliexpress_affiliate_product_smartmatch_response as
      | Record<string, unknown>
      | undefined;
    const respResult = queryResponse?.resp_result as Record<string, unknown> | undefined;
    const respCode = respResult?.resp_code;
    if (respCode !== undefined && Number(respCode) !== 200) return null;

    const result = respResult?.result as Record<string, unknown> | undefined;
    const products = normalizeProducts(result?.products);
    const candidates = products
      .map(mapApiProduct)
      .filter((candidate): candidate is AliExpressProductCandidate => candidate !== null);
    return candidates.length > 0 ? rankAliExpressCandidates(candidates) : null;
  } catch {
    return null;
  }
}

export async function generateAliExpressAffiliateLink(
  sourceUrl: string,
): Promise<string | null> {
  const config = getAffiliateConfig();
  if (!config) return null;

  const response = await callAffiliateApi("aliexpress.affiliate.link.generate", {
    promotion_link_type: "0",
    source_values: sourceUrl,
    tracking_id: config.trackingId,
  });

  const linkResponse = response.aliexpress_affiliate_link_generate_response as
    | Record<string, unknown>
    | undefined;

  const respResult = linkResponse?.resp_result as Record<string, unknown> | undefined;
  const result = respResult?.result as Record<string, unknown> | undefined;
  const promotionLinks = result?.promotion_links as
    | Record<string, unknown>
    | undefined;

  const linkList = promotionLinks?.promotion_link;
  if (Array.isArray(linkList) && linkList.length > 0) {
    const first = linkList[0] as Record<string, unknown>;
    return typeof first.promotion_link === "string" ? first.promotion_link : null;
  }

  if (typeof linkList === "object" && linkList !== null) {
    const single = linkList as Record<string, unknown>;
    return typeof single.promotion_link === "string" ? single.promotion_link : null;
  }

  return null;
}
