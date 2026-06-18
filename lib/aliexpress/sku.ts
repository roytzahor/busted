import {
  getShanghaiTimestamp,
  signAffiliateRequest,
} from "@/lib/aliexpress/sign-request";

const DEFAULT_API_URL = "https://api-sg.aliexpress.com/sync";

// In-memory cache keyed by productId. Vercel keeps warm functions briefly,
// so this absorbs repeat lookups within a request burst without hitting the
// AliExpress API again. Persistence across cold starts is not required —
// SKU data is mainly variant labels which change rarely.
const SKU_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SKU_CACHE_MAX = 200;
const skuCache = new Map<
  string,
  { value: AliExpressProductDetail; expiresAt: number }
>();

export interface AliExpressSku {
  skuId: string;
  // Human-readable variant attributes. Keys are normalised to lowercase
  // (e.g. "color", "size", "capacity"); values keep their original casing.
  attrs: Record<string, string>;
  priceUsd: number;
  /**
   * Warehouse origin country code when known ("US", "CN", "ES", "RU").
   * AliExpress productdetail.get does not always return this — when absent
   * we leave it null and the matcher treats it as unknown.
   */
  warehouseCountry: string | null;
  /**
   * Estimated shipping cost to `ALIEXPRESS_SHIP_TO_COUNTRY`. Null when not
   * available from the basic productdetail call. A future improvement could
   * call `aliexpress.ds.freight.query` per SKU to populate this.
   */
  shippingCostUsd: number | null;
  shippingDays: number | null;
}

export interface AliExpressProductDetail {
  productId: string;
  skus: AliExpressSku[];
  /**
   * Base price when the product has no SKU variation (or all SKUs share
   * the same price). Used as a fallback by the matcher.
   */
  basePriceUsd: number | null;
}

function getAffiliateConfig() {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) return null;
  return {
    appKey,
    appSecret,
    apiUrl: process.env.ALIEXPRESS_API_URL ?? DEFAULT_API_URL,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? "busted",
    shipToCountry: process.env.ALIEXPRESS_SHIP_TO_COUNTRY ?? "US",
  };
}

function pruneCache(): void {
  if (skuCache.size <= SKU_CACHE_MAX) return;
  // Drop the oldest 25% — Map preserves insertion order
  const dropCount = Math.floor(SKU_CACHE_MAX * 0.25);
  let i = 0;
  for (const key of skuCache.keys()) {
    if (i >= dropCount) break;
    skuCache.delete(key);
    i += 1;
  }
}

function readCache(productId: string): AliExpressProductDetail | null {
  const entry = skuCache.get(productId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    skuCache.delete(productId);
    return null;
  }
  return entry.value;
}

function writeCache(productId: string, value: AliExpressProductDetail): void {
  skuCache.set(productId, {
    value,
    expiresAt: Date.now() + SKU_CACHE_TTL_MS,
  });
  pruneCache();
}

function normalizeAttrName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Map common AliExpress property names to our canonical keys
  if (/colou?r/.test(lower)) return "color";
  if (/size/.test(lower)) return "size";
  if (/capacity|storage|memory|volume/.test(lower)) return "capacity";
  if (/material|fabric/.test(lower)) return "material";
  return lower;
}

interface SkuPropertyDto {
  sku_property_name?: string;
  property_value_definition_name?: string;
  property_value_name?: string;
}

interface SkuInfoDto {
  sku_id?: string | number;
  sku_attr?: string;
  sku_price?: string;
  offer_sale_price?: string;
  ae_sku_property_dtos?: {
    ae_sku_property_d_t_o?: SkuPropertyDto[] | SkuPropertyDto;
  };
}

function toArray<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseSku(dto: SkuInfoDto): AliExpressSku | null {
  const skuId = dto.sku_id?.toString();
  if (!skuId) return null;

  const priceRaw = dto.offer_sale_price ?? dto.sku_price;
  const priceUsd = Number.parseFloat(priceRaw ?? "");
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const propertyDtos = toArray(dto.ae_sku_property_dtos?.ae_sku_property_d_t_o);
  const attrs: Record<string, string> = {};
  for (const prop of propertyDtos) {
    const name = prop.sku_property_name?.trim();
    const value =
      prop.property_value_definition_name?.trim() ??
      prop.property_value_name?.trim();
    if (name && value) {
      attrs[normalizeAttrName(name)] = value;
    }
  }

  return {
    skuId,
    attrs,
    priceUsd,
    warehouseCountry: null,
    shippingCostUsd: null,
    shippingDays: null,
  };
}

interface ProductDetailRecord {
  product_id?: string | number;
  ae_item_sku_info_dtos?: {
    ae_item_sku_info_d_t_o?: SkuInfoDto[] | SkuInfoDto;
  };
  target_sale_price?: string;
  sale_price?: string;
}

/**
 * Fetch SKU-level detail for an AliExpress product. Returns null when the
 * API is unconfigured or the call fails — callers must treat this as
 * best-effort.
 */
export async function fetchAliExpressProductDetail(
  productId: string,
): Promise<AliExpressProductDetail | null> {
  const cached = readCache(productId);
  if (cached) return cached;

  const config = getAffiliateConfig();
  if (!config) return null;

  try {
    const payload: Record<string, string> = {
      method: "aliexpress.affiliate.productdetail.get",
      app_key: config.appKey,
      sign_method: "md5",
      timestamp: getShanghaiTimestamp(),
      format: "json",
      v: "2.0",
      product_ids: productId,
      target_currency: "USD",
      target_language: "EN",
      tracking_id: config.trackingId,
      country: config.shipToCountry,
      fields:
        "product_id,target_sale_price,sale_price,ae_item_sku_info_dtos",
    };
    payload.sign = signAffiliateRequest(payload, config.appSecret);

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams(payload),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as Record<string, unknown>;
    const wrapper = json.aliexpress_affiliate_productdetail_get_response as
      | Record<string, unknown>
      | undefined;
    const respResult = wrapper?.resp_result as Record<string, unknown> | undefined;
    if (Number(respResult?.resp_code ?? 0) !== 200) return null;

    const result = respResult?.result as Record<string, unknown> | undefined;
    const productsWrapper = result?.products as Record<string, unknown> | undefined;
    const productList = toArray(
      (productsWrapper?.product as ProductDetailRecord[] | ProductDetailRecord | undefined),
    );

    const product = productList[0];
    if (!product) return null;

    const skuDtos = toArray(product.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o);
    const skus = skuDtos
      .map(parseSku)
      .filter((sku): sku is AliExpressSku => sku !== null);

    const baseRaw = product.target_sale_price ?? product.sale_price;
    const baseParsed = Number.parseFloat(baseRaw ?? "");
    const basePriceUsd = Number.isFinite(baseParsed) && baseParsed > 0 ? baseParsed : null;

    const detail: AliExpressProductDetail = {
      productId: product.product_id?.toString() ?? productId,
      skus,
      basePriceUsd,
    };

    writeCache(productId, detail);
    return detail;
  } catch {
    return null;
  }
}
