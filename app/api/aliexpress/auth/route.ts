import { NextResponse } from "next/server";
import {
  buildAliExpressAuthorizeUrl,
  resolveAliExpressCallbackUrl,
} from "@/lib/aliexpress/oauth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "aliexpress_oauth_state";
const STATE_MAX_AGE = 600; // 10 minutes

export async function GET(): Promise<NextResponse> {
  const callbackUrl = resolveAliExpressCallbackUrl();

  if (!process.env.ALIEXPRESS_APP_KEY?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Set ALIEXPRESS_APP_KEY before starting OAuth.",
        callbackUrl,
      },
      { status: 503 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildAliExpressAuthorizeUrl(state);

  const response = NextResponse.redirect(authorizeUrl);
  // Store state in a short-lived HttpOnly cookie for CSRF validation in callback.
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_MAX_AGE,
    path: "/api/aliexpress/callback",
  });

  return response;
}
