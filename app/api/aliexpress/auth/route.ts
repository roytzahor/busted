import { NextResponse } from "next/server";
import {
  buildAliExpressAuthorizeUrl,
  resolveAliExpressCallbackUrl,
} from "@/lib/aliexpress/oauth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return NextResponse.redirect(authorizeUrl);
}
