import {
  generateAliExpressAffiliateLink,
  isAliExpressApiConfigured,
} from "@/lib/aliexpress/api-client";

interface AdmitadTokenResponse {
  access_token?: string;
  expires_in?: number;
}

let cachedAdmitadToken: { token: string; expiresAt: number } | null = null;

function getAdmitadConfig() {
  const clientId = process.env.ADMITAD_CLIENT_ID;
  const clientSecret = process.env.ADMITAD_CLIENT_SECRET;
  const websiteId = process.env.ADMITAD_WEBSITE_ID;
  const campaignId = process.env.ADMITAD_ALIEXPRESS_CAMPAIGN_ID;

  if (!clientId || !clientSecret || !websiteId || !campaignId) {
    return null;
  }

  return { clientId, clientSecret, websiteId, campaignId };
}

async function getAdmitadAccessToken(): Promise<string | null> {
  const config = getAdmitadConfig();
  if (!config) return null;

  const now = Date.now();
  if (cachedAdmitadToken && cachedAdmitadToken.expiresAt > now + 60_000) {
    return cachedAdmitadToken.token;
  }

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8",
  ).toString("base64");

  const response = await fetch("https://api.admitad.com/token/", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      scope: "deeplink_generator public_data",
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as AdmitadTokenResponse;
  if (!payload.access_token) return null;

  cachedAdmitadToken = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };

  return payload.access_token;
}

async function generateAdmitadAffiliateLink(sourceUrl: string): Promise<string | null> {
  const config = getAdmitadConfig();
  const token = await getAdmitadAccessToken();
  if (!config || !token) return null;

  const endpoint = new URL(
    `https://api.admitad.com/deeplink/${config.websiteId}/advcampaign/${config.campaignId}/`,
  );
  endpoint.searchParams.set("ulp", sourceUrl);

  const response = await fetch(endpoint.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Array<{ link?: string }>;
  const first = payload[0];
  return typeof first?.link === "string" ? first.link : null;
}

export type AffiliateProvider = "aliexpress_api" | "admitad" | "direct";

export async function convertToAffiliateLink(params: {
  productUrl: string;
  existingPromotionLink?: string | null;
}): Promise<{ affiliateUrl: string; provider: AffiliateProvider }> {
  const preferred = process.env.AFFILIATE_PROVIDER ?? "auto";

  if (params.existingPromotionLink) {
    return {
      affiliateUrl: params.existingPromotionLink,
      provider: "aliexpress_api",
    };
  }

  if (preferred === "admitad") {
    const admitadLink = await generateAdmitadAffiliateLink(params.productUrl);
    if (admitadLink) {
      return { affiliateUrl: admitadLink, provider: "admitad" };
    }
  }

  if (isAliExpressApiConfigured()) {
    const aliLink = await generateAliExpressAffiliateLink(params.productUrl);
    if (aliLink) {
      return { affiliateUrl: aliLink, provider: "aliexpress_api" };
    }
  }

  if (preferred === "auto") {
    const admitadLink = await generateAdmitadAffiliateLink(params.productUrl);
    if (admitadLink) {
      return { affiliateUrl: admitadLink, provider: "admitad" };
    }
  }

  return { affiliateUrl: params.productUrl, provider: "direct" };
}
