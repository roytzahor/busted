/**
 * Match-feedback ingestion — Sprint 13 self-improving loop.
 *
 * Accepts a user verdict on a specific scan ("right" | "similar" | "wrong")
 * plus an optional free-form note. We allow one feedback row per scan;
 * subsequent submissions update the same row (upsert by scanId).
 *
 * The feedback joins to the MatchOutcome row for that scan in the nightly
 * recompute. We don't enforce that the outcome exists yet because a fast
 * user might click "wrong" before the fire-and-forget outcome write lands.
 *
 * Returns 204 No Content on success. Never throws to the client.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VERDICTS = new Set(["right", "similar", "wrong"]);
const MAX_NOTE_CHARS = 280;

interface IncomingFeedback {
  scanId?: unknown;
  verdict?: unknown;
  note?: unknown;
  sessionId?: unknown;
}

function badRequest(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingFeedback;
  try {
    body = (await request.json()) as IncomingFeedback;
  } catch {
    return badRequest("invalid_json");
  }

  if (typeof body.scanId !== "string" || body.scanId.length === 0 || body.scanId.length > 64) {
    return badRequest("bad_scan_id");
  }
  if (typeof body.verdict !== "string" || !ALLOWED_VERDICTS.has(body.verdict)) {
    return badRequest("bad_verdict");
  }

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_NOTE_CHARS)
      : null;
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length <= 64
      ? body.sessionId
      : null;

  try {
    // Find the most recent MatchOutcome for this scanId so we can join. Best
    // effort — if the outcome hasn't been written yet the recompute will
    // still pick this row up via scanId.
    const outcome = await prisma.matchOutcome
      .findFirst({
        where: { scanId: body.scanId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      .catch(() => null);

    await prisma.matchFeedback.upsert({
      where: { scanId: body.scanId },
      create: {
        scanId: body.scanId,
        verdict: body.verdict,
        note: note ?? undefined,
        sessionId: sessionId ?? undefined,
        outcomeId: outcome?.id,
      },
      update: {
        verdict: body.verdict,
        note: note ?? undefined,
        sessionId: sessionId ?? undefined,
        outcomeId: outcome?.id,
      },
    });
  } catch (err) {
    console.error("[feedback] write failed", err);
  }

  return new NextResponse(null, { status: 204 });
}
