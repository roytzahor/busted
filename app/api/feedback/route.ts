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
 * Beyond the learning loop, feedback drives the permanent VerifiedProductMap
 * (the "Gold Path"):
 *   - "right" → commit this scan's retail→supplier mapping so future scans of
 *     the same URL skip the entire pipeline for the TTL window.
 *   - "wrong" → invalidate any verified mapping AND clear the cached supplier
 *     match so neither the gold path nor the 14-day cache re-serves it. The
 *     raw scrape is intentionally kept so a re-scan never re-fetches the
 *     retail page — the next scan re-runs supplier search only (escalated).
 *   - "similar" → left as-is.
 *
 * Abuse surface: scanIds are publicly discoverable and there is no auth, so the
 * endpoint is rate-limited per IP and the Gold Path commit ("right") requires a
 * sessionId — see applyVerificationFeedback for why "wrong" stays open.
 *
 * Returns 204 No Content on success, 429 when rate-limited. Never throws to
 * the client.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  invalidateVerifiedMatch,
  recordVerifiedMatch,
} from "@/lib/cache/verified-map";
import { checkRateLimit, resolveClientIp } from "@/lib/api/rate-limit";
import { isAttributedSession } from "@/lib/api/session-attribution";
import { parseAliExpressData } from "@/lib/types/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apply the verification side-effect of a feedback verdict. Fire-and-forget —
 * never blocks the 204 and never throws. Loads the scan to recover the
 * retail URL + winning supplier snapshot (neither is in the feedback payload).
 *
 * The two verdicts are deliberately asymmetric about attribution:
 *   - "right" ADDS a permanent claim that bypasses the whole pipeline for the
 *     TTL window and outranks auto-commits, so it requires an attributed
 *     session. An unattributed 👍 still lands in MatchFeedback (learning signal
 *     preserved) but must not write the Gold Path. Attribution is recoverable
 *     later via VerifiedProductMap.scanId → MatchFeedback.sessionId.
 *   - "wrong" REMOVES a claim. Under precision-first that direction is
 *     fail-safe (the system gets quieter, never more confident), so it stays
 *     open to anonymous callers — rate limiting alone covers the cost
 *     amplification of forcing re-searches.
 */
async function applyVerificationFeedback(
  scanId: string,
  verdict: string,
  sessionId: string | null,
): Promise<void> {
  const scan = await prisma.scannedProduct
    .findUnique({
      where: { id: scanId },
      select: { originalUrl: true, aliexpressUrl: true, aliexpressData: true },
    })
    .catch(() => null);
  if (!scan) return;

  if (verdict === "right") {
    if (!isAttributedSession(sessionId)) return;
    const aliexpressData = parseAliExpressData(scan.aliexpressData);
    if (scan.aliexpressUrl && aliexpressData) {
      await recordVerifiedMatch({
        originalUrl: scan.originalUrl,
        aliexpressUrl: scan.aliexpressUrl,
        aliexpressData,
        source: "user_feedback",
        scanId,
      });
    }
  } else if (verdict === "wrong") {
    await invalidateVerifiedMatch(scan.originalUrl);
    // Also clear the cached supplier match — otherwise the 14-day cache-hit
    // path keeps re-serving the exact match the user just rejected. Scrape +
    // AI verdict stay intact so the retry re-searches without re-fetching.
    await prisma.scannedProduct
      .update({
        where: { id: scanId },
        data: { aliexpressUrl: null, aliexpressData: Prisma.DbNull },
      })
      .catch(() => {
        /* swallow — cache cleanup must never break the feedback ack */
      });
  }
}

const ALLOWED_VERDICTS = new Set(["right", "similar", "wrong"]);
const MAX_NOTE_CHARS = 280;

/**
 * Per-IP feedback submissions allowed per minute. Generous for a human tapping
 * 👍/👎 on a few scans, restrictive for a loop walking scanIds — which are
 * publicly discoverable via /api/stats/trending and /api/examples/featured.
 */
const FEEDBACK_RATE_LIMIT_PER_MIN = 20;

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
  const rateLimit = checkRateLimit(
    `feedback:${resolveClientIp(request)}`,
    FEEDBACK_RATE_LIMIT_PER_MIN,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

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
    typeof body.sessionId === "string" &&
    body.sessionId.length > 0 &&
    body.sessionId.length <= 64
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

  // Gold Path side-effect — fire-and-forget so it never blocks the response.
  void applyVerificationFeedback(body.scanId, body.verdict, sessionId).catch(
    (err) => {
      console.error("[feedback] verification side-effect failed", err);
    },
  );

  return new NextResponse(null, { status: 204 });
}
