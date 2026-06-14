import { createHmac } from "crypto";
import { getShanghaiTimestamp } from "@/lib/aliexpress/sign-request";

const TOKEN_CREATE_PATH = "/auth/token/create";
const OAUTH_AUTHORIZE_URL = "https://api-sg.aliexpress.com/oauth/authorize";
const TOKEN_CREATE_URL = "https://api-sg.aliexpress.com/rest/auth/token/create";

function sortParams(params: Record<string, string>): Record<string, string> {
  return Object.keys(params)
    .sort()
    .reduce<Record<string, string>>((result, key) => {
      result[key] = params[key];
      return result;
    }, {});
}

export function signOpenPlatformRequest(
  apiPath: string,
  parameters: Record<string, string>,
  appSecret: string,
): string {
  const sorted = sortParams(parameters);
  const concatenated =
    apiPath +
    Object.keys(sorted).reduce((acc, key) => `${acc}${key}${sorted[key]}`, "");

  return createHmac("sha256", appSecret)
    .update(concatenated, "utf8")
    .digest("hex")
    .toUpperCase();
}

export function resolveAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`;
  }

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }

  return "http://localhost:3000";
}

export function resolveAliExpressCallbackUrl(): string {
  if (process.env.ALIEXPRESS_CALLBACK_URL?.trim()) {
    return process.env.ALIEXPRESS_CALLBACK_URL.trim();
  }

  return `${resolveAppBaseUrl()}/api/aliexpress/callback`;
}

export function buildAliExpressAuthorizeUrl(state: string): string {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  if (!appKey) {
    throw new Error("ALIEXPRESS_APP_KEY is not configured.");
  }

  const redirectUri = resolveAliExpressCallbackUrl();
  const params = new URLSearchParams({
    response_type: "code",
    force_auth: "true",
    redirect_uri: redirectUri,
    client_id: appKey,
    state,
    sp: "ae",
  });

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export interface AliExpressTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  user_id?: string;
  account?: string;
  code?: string;
  message?: string;
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<AliExpressTokenResponse> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error("AliExpress app credentials are not configured.");
  }

  const payload: Record<string, string> = {
    app_key: appKey,
    timestamp: getShanghaiTimestamp(),
    sign_method: "sha256",
    code,
  };

  payload.sign = signOpenPlatformRequest(TOKEN_CREATE_PATH, payload, appSecret);

  const response = await fetch(TOKEN_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${raw.slice(0, 300)}`);
  }

  try {
    return JSON.parse(raw) as AliExpressTokenResponse;
  } catch {
    throw new Error(`Token exchange returned non-JSON: ${raw.slice(0, 300)}`);
  }
}
