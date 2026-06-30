/**
 * eBay supplier adapter — official Buy Browse API (B2C marketplace).
 *
 * Auth: OAuth2 client-credentials (Application access token) minted from
 * EBAY_APP_ID (client_id) + EBAY_CERT_ID (client_secret). The token is cached
 * in-module until ~1 min before expiry so warm invocations skip the mint hop.
 *
 * Search: GET /buy/browse/v1/item_summary/search?q=...
 * Affiliate links: when EBAY_CAMPAIGN_ID is set we pass the affiliate context
 * header so the response includes `itemAffiliateWebUrl`; we fall back to the
 * plain `itemWebUrl` otherwise.
 *
 * Rate-limit handling:
 *  - 429 / 503 → exponential backoff, up to MAX_RETRIES attempts.
 *    Respects the Retry-After header when present; caps wait at RETRY_CAP_MS
 *    so a single slow response can't stall the router's time budget.
 *  - 401 → clears the token cache and retries once (handles rare race where a
 *    2h token expires between cache-check and the actual request).
 *  - All retries are signal-aware: the router's AbortSignal cancels them
 *    immediately so a rate-limited call can't hold a serverless slot open.
 *
 * Credential-gated + fail-open: with no keys the router skips this provider;
 * on any upstream error we throw a SupplierProviderError the router catches,
 * so a bad eBay call never fails the scan.
 *
 * Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 */

import {
  SupplierProviderError,
  SUPPLIER_ERROR,
  type ISupplierProvider,
  type SupplierCandidate,
  type SupplierSearchOptions,
} from "@/lib/supplier/types";

const isSandbox = process.env.EBAY_SANDBOX === "true";
const EBAY_BASE = isSandbox
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";
const EBAY_OAUTH_URL = `${EBAY_BASE}/identity/v1/oauth2/token`;
const EBAY_BROWSE_URL = `${EBAY_BASE}/buy/browse/v1/item_summary/search`;
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";

/** Max Browse search retries on 429/503 (first attempt + MAX_RETRIES more). */
const MAX_RETRIES = 2;
/** Base wait before the first retry; doubles each subsequent attempt. */
const BASE_RETRY_MS = 500;
/** Hard cap on any single retry wait — keeps us inside the router time budget. */
const RETRY_CAP_MS = 3000;

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

function clearTokenCache() {
  cachedToken = null;
}

async function getApplicationToken(
  appId: string,
  certId: string,
  signal?: AbortSignal,
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(`${appId}:${certId}`).toString("base64");
  const res = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_SCOPE,
    }),
    signal,
  });
  if (!res.ok) {
    throw new SupplierProviderError(
      "ebay",
      SUPPLIER_ERROR.UPSTREAM,
      `eBay OAuth token request failed (${res.status}).`,
    );
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000,
  };
  return cachedToken.token;
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

/** Signal-aware sleep. Rejects immediately if the signal fires during the wait. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => { clearTimeout(timer); reject(signal.reason); },
      { once: true },
    );
  });
}

/**
 * Fetch with automatic retry on 429 (Too Many Requests) and 503 (Service
 * Unavailable). Reads the Retry-After header when present; otherwise uses
 * exponential backoff capped at RETRY_CAP_MS. Aborts immediately if the
 * caller's AbortSignal fires.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  maxRetries = MAX_RETRIES,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);

    const retryable = res.status === 429 || res.status === 503;
    if (!retryable || attempt >= maxRetries) return res;

    const retryAfterSec = Number(res.headers.get("Retry-After") ?? NaN);
    const delay = Number.isFinite(retryAfterSec)
      ? Math.min(retryAfterSec * 1000, RETRY_CAP_MS)
      : Math.min(BASE_RETRY_MS * 2 ** attempt, RETRY_CAP_MS);

    await sleep(delay, init.signal);
    attempt++;
  }
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

interface EbayItemSummary {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  image?: { imageUrl?: string };
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  seller?: { feedbackPercentage?: string; feedbackScore?: number };
}

/** Map eBay seller feedback (% positive + volume) into a 0..1 trust score. */
function toTrustScore(seller?: EbayItemSummary["seller"]): number {
  if (!seller) return 0.5;
  const pct = Number(seller.feedbackPercentage ?? "0"); // 0..100
  const pctTrust = Math.max(0, Math.min(1, (pct - 90) / 10)); // 90%→0, 100%→1
  const volTrust = Math.min(1, (seller.feedbackScore ?? 0) / 1000);
  return +(pctTrust * 0.6 + volTrust * 0.4).toFixed(3);
}

function toCandidate(item: EbayItemSummary): SupplierCandidate | null {
  const priceUsd = Number(item.price?.value);
  if (!item.title || !Number.isFinite(priceUsd)) return null;
  return {
    id: item.itemId ?? item.itemWebUrl ?? item.title,
    title: item.title,
    priceUsd,
    imageUrl: item.image?.imageUrl ?? "",
    affiliateLink: item.itemAffiliateWebUrl ?? item.itemWebUrl ?? "",
    storeName: "eBay",
    sourceProvider: "ebay",
    trustScore: toTrustScore(item.seller),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ebayProvider: ISupplierProvider = {
  name: "eBay",
  provider: "ebay",

  isConfigured(): boolean {
    return Boolean(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
  },

  async searchByText(
    keywords: string[],
    opts: SupplierSearchOptions = {},
  ): Promise<SupplierCandidate[]> {
    const appId = process.env.EBAY_APP_ID;
    const certId = process.env.EBAY_CERT_ID;
    if (!appId || !certId) return []; // fail-open

    const q = keywords.filter((k) => k.trim().length > 0).join(" ").trim();
    if (!q) return [];

    const params = new URLSearchParams({
      q,
      limit: String(Math.min(opts.limit ?? 10, 50)),
    });
    if (opts.minPriceUsd != null || opts.maxPriceUsd != null) {
      const min = opts.minPriceUsd ?? "";
      const max = opts.maxPriceUsd ?? "";
      params.set("filter", `price:[${min}..${max}],priceCurrency:USD`);
    }

    const campaignId = process.env.EBAY_CAMPAIGN_ID;

    // Inner search — extracted so we can retry on 401 after refreshing the token.
    const doSearch = async (): Promise<Response> => {
      const token = await getApplicationToken(appId, certId, opts.signal);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      };
      if (campaignId) {
        headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${campaignId}`;
      }
      return fetchWithRetry(
        `${EBAY_BROWSE_URL}?${params.toString()}`,
        { headers, signal: opts.signal },
      );
    };

    let res = await doSearch();

    // 401 = token expired in the wild (rare but possible); refresh once.
    if (res.status === 401) {
      clearTokenCache();
      res = await doSearch();
    }

    if (!res.ok) {
      throw new SupplierProviderError(
        "ebay",
        res.status === 429 ? SUPPLIER_ERROR.TIMEOUT : SUPPLIER_ERROR.UPSTREAM,
        `eBay Browse search failed (${res.status}).`,
      );
    }

    const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
    return (json.itemSummaries ?? [])
      .map(toCandidate)
      .filter((c): c is SupplierCandidate => c !== null);
  },
};
