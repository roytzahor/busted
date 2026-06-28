/**
 * Amazon supplier adapter — official Product Advertising API v5 (PAAPI 5),
 * SearchItems operation. B2C marketplace via the Amazon Associates program.
 *
 * Auth: AWS Signature V4 over AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY, with
 * AMAZON_ASSOCIATE_TAG as the PartnerTag (the affiliate tag is baked into the
 * returned DetailPageURL — that IS the affiliate link).
 *
 * Resilience: a 429 (throttled — PAAPI has tight TPS/TPD quotas) degrades to an
 * empty result rather than failing the scan; other upstream errors throw a
 * SupplierProviderError the router catches.
 *
 * Credential-gated + fail-open. NOTE: the SigV4 signing below is implemented to
 * the PAAPI 5 spec but is UNVERIFIED against the live endpoint here (no keys in
 * this environment) — confirm against a real Associate account before relying
 * on it in production.
 *
 * Docs: https://webservices.amazon.com/paapi5/documentation/search-items.html
 *       https://webservices.amazon.com/paapi5/documentation/sending-request.html
 */

import crypto from "node:crypto";
import {
  SupplierProviderError,
  SUPPLIER_ERROR,
  type ISupplierProvider,
  type SupplierCandidate,
  type SupplierSearchOptions,
} from "@/lib/supplier/types";

const SERVICE = "ProductAdvertisingAPI";
const REGION = process.env.AMAZON_REGION ?? "us-east-1";
const HOST = process.env.AMAZON_HOST ?? "webservices.amazon.com";
const MARKETPLACE = process.env.AMAZON_MARKETPLACE ?? "www.amazon.com";
const REQUEST_PATH = "/paapi5/searchitems";
const TARGET =
  "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

/** Amazon listings have no public seller-rating signal in this resource set; */
/** use a flat marketplace-trust baseline (overridable) and document it.       */
const AMAZON_BASELINE_TRUST = Number(process.env.AMAZON_BASELINE_TRUST ?? "0.6");

const hmac = (key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer =>
  crypto.createHmac("sha256", key).update(data, "utf8").digest();
const sha256hex = (data: string): string =>
  crypto.createHash("sha256").update(data, "utf8").digest("hex");

function deriveSigningKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

interface PaapiItem {
  DetailPageURL?: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Offers?: { Listings?: Array<{ Price?: { Amount?: number } }> };
  Images?: { Primary?: { Medium?: { URL?: string } } };
}

function toCandidate(item: PaapiItem): SupplierCandidate | null {
  const title = item.ItemInfo?.Title?.DisplayValue;
  const priceUsd = item.Offers?.Listings?.[0]?.Price?.Amount;
  if (!title || typeof priceUsd !== "number") return null;
  return {
    id: item.DetailPageURL ?? title,
    title,
    priceUsd,
    imageUrl: item.Images?.Primary?.Medium?.URL ?? "",
    // DetailPageURL already carries the PartnerTag → it is the affiliate link.
    affiliateLink: item.DetailPageURL ?? "",
    storeName: "Amazon",
    sourceProvider: "amazon",
    trustScore: Math.max(0, Math.min(1, AMAZON_BASELINE_TRUST)),
  };
}

export const amazonProvider: ISupplierProvider = {
  name: "Amazon",
  provider: "amazon",

  isConfigured(): boolean {
    return Boolean(
      process.env.AMAZON_ACCESS_KEY &&
        process.env.AMAZON_SECRET_KEY &&
        process.env.AMAZON_ASSOCIATE_TAG,
    );
  },

  async searchByText(
    keywords: string[],
    opts: SupplierSearchOptions = {},
  ): Promise<SupplierCandidate[]> {
    const accessKey = process.env.AMAZON_ACCESS_KEY;
    const secretKey = process.env.AMAZON_SECRET_KEY;
    const partnerTag = process.env.AMAZON_ASSOCIATE_TAG;
    if (!accessKey || !secretKey || !partnerTag) return []; // fail-open

    const q = keywords.filter((k) => k.trim().length > 0).join(" ").trim();
    if (!q) return [];

    const payload = JSON.stringify({
      Keywords: q,
      SearchIndex: "All",
      ItemCount: Math.min(opts.limit ?? 10, 10), // PAAPI caps SearchItems at 10
      PartnerTag: partnerTag,
      PartnerType: "Associates",
      Marketplace: MARKETPLACE,
      Resources: [
        "ItemInfo.Title",
        "Offers.Listings.Price",
        "Images.Primary.Medium",
      ],
    });

    // ── AWS Signature V4 ──────────────────────────────────────────────────
    const amzDate = new Date()
      .toISOString()
      .replace(/[:-]/g, "")
      .replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

    const signedHeaderMap: Record<string, string> = {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      host: HOST,
      "x-amz-date": amzDate,
      "x-amz-target": TARGET,
    };
    const sortedKeys = Object.keys(signedHeaderMap).sort();
    const signedHeaders = sortedKeys.join(";");
    const canonicalHeaders = sortedKeys
      .map((k) => `${k}:${signedHeaderMap[k]}\n`)
      .join("");
    const canonicalRequest = [
      "POST",
      REQUEST_PATH,
      "",
      canonicalHeaders,
      signedHeaders,
      sha256hex(payload),
    ].join("\n");

    const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256hex(canonicalRequest),
    ].join("\n");
    const signature = hmac(
      deriveSigningKey(secretKey, dateStamp),
      stringToSign,
    ).toString("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`https://${HOST}${REQUEST_PATH}`, {
      method: "POST",
      headers: { ...signedHeaderMap, Authorization: authorization },
      body: payload,
      signal: opts.signal,
    });

    if (res.status === 429) {
      // Throttled (TooManyRequests) — degrade gracefully to no results.
      return [];
    }
    if (!res.ok) {
      throw new SupplierProviderError(
        "amazon",
        SUPPLIER_ERROR.UPSTREAM,
        `Amazon PAAPI SearchItems failed (${res.status}).`,
      );
    }
    const json = (await res.json()) as { SearchResult?: { Items?: PaapiItem[] } };
    return (json.SearchResult?.Items ?? [])
      .map(toCandidate)
      .filter((c): c is SupplierCandidate => c !== null);
  },
};
