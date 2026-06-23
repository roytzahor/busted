/**
 * Cron-triggered learning recompute — Sprint 13.
 *
 * Triggered by Vercel cron (see vercel.json) every 6 hours. Aggregates the
 * last 14 days of MatchOutcome + MatchFeedback + AffiliateClick into the
 * DomainScrapeRecipe and VerticalKeywordPrior tables, then invalidates the
 * priors cache on this instance.
 *
 * Authentication: Vercel cron sets `Authorization: Bearer <CRON_SECRET>`.
 * We require it in production; in development we accept calls without it
 * so you can hit the route manually with `curl localhost:3000/api/cron/learn`.
 *
 * Designed to finish under Vercel's 60s function limit. The aggregation
 * itself is pure JS over already-fetched rows — the slow part is the
 * upserts, which are bounded by domain + vertical cardinality.
 */

import { NextResponse, type NextRequest } from "next/server";
import { recomputePriors } from "@/lib/learning/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorised(request: NextRequest): boolean {
  // Development: allow any caller so you can curl it locally.
  if (process.env.NODE_ENV !== "production") return true;

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured — refuse to run in production rather than expose
    // a free recompute endpoint to the world.
    console.error("[cron/learn] CRON_SECRET not set; refusing to run");
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header) return false;
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  try {
    const result = await recomputePriors();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[cron/learn] recompute failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "recompute failed",
      },
      { status: 500 },
    );
  }
}
