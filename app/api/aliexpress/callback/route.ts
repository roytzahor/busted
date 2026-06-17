import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  resolveAliExpressCallbackUrl,
} from "@/lib/aliexpress/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function renderHtml(title: string, body: string): NextResponse {
  const safeTitle = escapeHtml(title);
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; line-height: 1.5; }
    h1 { font-size: 1.5rem; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .ok { color: #059669; }
    .warn { color: #b45309; }
    .err { color: #dc2626; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${body}
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const STATE_COOKIE = "aliexpress_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const callbackUrl = resolveAliExpressCallbackUrl();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");

  // CSRF check: verify state matches the nonce we stored in the cookie.
  // Skip when no code is present (plain GET to see callback info page).
  if (code || state) {
    const storedState = request.cookies.get(STATE_COOKIE)?.value;
    if (!storedState || !state || storedState !== state) {
      return renderHtml(
        "Authorization failed",
        `<p class="err">Invalid or missing state parameter. Please restart the authorization flow.</p>`,
      );
    }
  }

  if (error) {
    return renderHtml(
      "AliExpress authorization failed",
      `<p class="err">${escapeHtml(error)}${errorDescription ? `: ${escapeHtml(errorDescription)}` : ""}</p>`,
    );
  }

  if (!code) {
    return renderHtml(
      "Busted · AliExpress callback ready",
      `<p class="ok">This endpoint is live and ready for AliExpress Open Platform.</p>
       <p>Register this callback URL in the AliExpress app console:</p>
       <p><code>${escapeHtml(callbackUrl)}</code></p>
       <p>After seller authorization, AliExpress redirects here with a <code>code</code> query parameter.</p>`,
    );
  }

  try {
    const tokenPayload = await exchangeAuthorizationCode(code);

    if (!tokenPayload.access_token) {
      return renderHtml(
        "Authorization received — token pending",
        `<p class="warn">AliExpress returned an authorization code, but no access token was issued yet.</p>
         <p>Verify <code>ALIEXPRESS_APP_KEY</code> and <code>ALIEXPRESS_APP_SECRET</code> on Vercel.</p>`,
      );
    }

    return renderHtml(
      "AliExpress authorization successful",
      `<p class="ok">Access token received. Store it securely in Vercel env if your app requires seller OAuth.</p>
       <ul>
         <li>User ID: <code>${escapeHtml(String(tokenPayload.user_id ?? "n/a"))}</code></li>
         <li>Expires in: <code>${escapeHtml(String(tokenPayload.expires_in ?? "n/a"))}</code>s</li>
       </ul>
       <p>You can close this window.</p>`,
    );
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error ? exchangeError.message : "Token exchange failed.";

    return renderHtml(
      "Authorization code received",
      `<p class="warn">Code received from AliExpress. Token exchange did not complete:</p>
       <p><code>${escapeHtml(message)}</code></p>
       <p>The callback URL itself is valid — you can still register <code>${escapeHtml(callbackUrl)}</code> in the AliExpress console.</p>`,
    );
  }
}
