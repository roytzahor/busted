import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-party analytics ingestion — Sprint 11 Stage 26.
 *
 * Accepts a tiny event payload from the browser. Validates the event name
 * against an allow-list (so a leaked endpoint can't be used as a free
 * write-anywhere table). Writes one TelemetryEvent row.
 *
 * Returns 204 No Content — never a body. The client doesn't wait on the
 * response so we don't need to be chatty.
 */

const ALLOWED_EVENT_NAMES = new Set([
  "page_view",
  "scan_start",
  "scan_complete",
  "scan_partial",
  "scan_error",
  "example_click",
  "history_click",
  "share_click",
  "faq_open",
  "paste_click",
  "permalink_view",
]);

const MAX_PROPS_BYTES = 4 * 1024;
const ALLOWED_SURFACES = new Set(["web", "extension"]);

interface IncomingEvent {
  name?: unknown;
  props?: unknown;
  sessionId?: unknown;
  scanId?: unknown;
  surface?: unknown;
}

function badRequest(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingEvent;
  try {
    body = (await request.json()) as IncomingEvent;
  } catch {
    return badRequest("invalid_json");
  }

  if (typeof body.name !== "string" || !ALLOWED_EVENT_NAMES.has(body.name)) {
    return badRequest("unknown_event");
  }
  if (typeof body.sessionId !== "string" || body.sessionId.length > 64) {
    return badRequest("bad_session_id");
  }

  const surface =
    typeof body.surface === "string" && ALLOWED_SURFACES.has(body.surface)
      ? body.surface
      : "web";

  let propsJson: object | undefined;
  if (body.props && typeof body.props === "object") {
    const serialized = JSON.stringify(body.props);
    if (serialized.length <= MAX_PROPS_BYTES) {
      propsJson = body.props as object;
    }
  }

  try {
    await prisma.telemetryEvent.create({
      data: {
        name: body.name,
        sessionId: body.sessionId,
        scanId: typeof body.scanId === "string" ? body.scanId : undefined,
        surface,
        ...(propsJson ? { props: propsJson } : {}),
      },
    });
  } catch (err) {
    // Never fail loudly — analytics must not break the user flow.
    console.error("[track] write failed", err);
  }

  return new NextResponse(null, { status: 204 });
}
