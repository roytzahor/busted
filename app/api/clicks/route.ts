import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate click ingestion — Sprint 11 Stage 27.
 *
 * Fired as a fire-and-forget beacon when the user clicks the Buy-on-AliExpress
 * CTA. We don't proxy/redirect through here because that would add latency
 * and break right-click → open-in-new-tab. The CTA still navigates directly
 * to the affiliate URL; this records the intent in parallel.
 *
 * Returns 204 No Content.
 */

interface IncomingClick {
  scanId?: unknown;
  sessionId?: unknown;
  targetHost?: unknown;
  surface?: unknown;
}

const ALLOWED_SURFACES = new Set(["web", "extension"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingClick;
  try {
    body = (await request.json()) as IncomingClick;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const scanId =
    typeof body.scanId === "string" && body.scanId.length <= 64
      ? body.scanId
      : undefined;
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length <= 64
      ? body.sessionId
      : undefined;
  const targetHost =
    typeof body.targetHost === "string" && body.targetHost.length <= 200
      ? body.targetHost
      : undefined;
  const surface =
    typeof body.surface === "string" && ALLOWED_SURFACES.has(body.surface)
      ? body.surface
      : "web";

  try {
    await prisma.affiliateClick.create({
      data: { scanId, sessionId, targetHost, surface },
    });
  } catch (err) {
    console.error("[clicks] write failed", err);
  }

  return new NextResponse(null, { status: 204 });
}
