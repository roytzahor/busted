import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-error ingestion — Sprint 11 Stage 29.
 *
 * Accepts truncated error payloads from the browser. De-dupes within the
 * current hour by (sessionId, errorHash) so a runaway loop can't fill the
 * table. Returns 204; never echoes the payload back.
 */

interface IncomingError {
  message?: unknown;
  stack?: unknown;
  url?: unknown;
  userAgent?: unknown;
  sessionId?: unknown;
  source?: unknown;
}

const MAX_MESSAGE = 500;
const MAX_STACK = 4 * 1024;
const MAX_URL = 500;
const MAX_UA = 500;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

function clip(s: unknown, max: number): string | undefined {
  if (typeof s !== "string" || !s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function hashError(message: string, stack: string | undefined): string {
  const firstFrame = stack?.split("\n", 2)[1]?.trim() ?? "";
  return createHash("sha256").update(`${message}::${firstFrame}`).digest("hex");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingError;
  try {
    body = (await request.json()) as IncomingError;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = clip(body.message, MAX_MESSAGE);
  const url = clip(body.url, MAX_URL);
  if (!message || !url) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const stack = clip(body.stack, MAX_STACK);
  const userAgent = clip(body.userAgent, MAX_UA);
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length <= 64
      ? body.sessionId
      : undefined;

  const errorHash = hashError(message, stack);

  try {
    // Dedup within a 1h window — same hash + same session, only one row.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const recent = await prisma.clientError.findFirst({
      where: { errorHash, sessionId: sessionId ?? null, createdAt: { gt: since } },
      select: { id: true },
    });
    if (recent) {
      return new NextResponse(null, { status: 204 });
    }

    await prisma.clientError.create({
      data: { message, errorHash, stack, url, userAgent, sessionId },
    });
  } catch (err) {
    console.error("[errors] write failed", err);
  }

  return new NextResponse(null, { status: 204 });
}
