import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1 hour — see CRON header below

/**
 * Public totals endpoint for the landing-page trust counter.
 *
 * Returns aggregate counts only — never product identities or URLs. Cached for
 * one hour at the Vercel edge via `revalidate`; the route also writes a
 * Cache-Control header for any CDN in front.
 *
 * The savings estimate is intentionally approximate: we sum
 * `estimatedStorePriceUsd - estimatedSupplierPriceUsd` from each prediction
 * JSON blob. Missing values fall through, so the number is a *floor* on real
 * savings — never inflated.
 */

interface TotalsPayload {
  scansThisWeek: number;
  scansAllTime: number;
  totalSavingsUsd: number;
  refreshedAt: string;
}

const FALLBACK: TotalsPayload = {
  scansThisWeek: 0,
  scansAllTime: 0,
  totalSavingsUsd: 0,
  refreshedAt: new Date().toISOString(),
};

function parsePrediction(value: unknown): {
  store?: number;
  supplier?: number;
} | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const store =
    typeof rec.estimatedStorePriceUsd === "number" ? rec.estimatedStorePriceUsd : undefined;
  const supplier =
    typeof rec.estimatedSupplierPriceUsd === "number"
      ? rec.estimatedSupplierPriceUsd
      : undefined;
  if (store === undefined && supplier === undefined) return null;
  return { store, supplier };
}

async function loadTotals(): Promise<TotalsPayload> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [scansAllTime, scansThisWeek, withPredictions] = await Promise.all([
    prisma.scannedProduct.count(),
    prisma.scannedProduct.count({ where: { createdAt: { gt: sevenDaysAgo } } }),
    prisma.scannedProduct.findMany({
      select: { aiPrediction: true },
      where: { aiPrediction: { not: undefined } },
      take: 5000, // cap — we only need a representative sample
    }),
  ]);

  let totalSavingsUsd = 0;
  for (const row of withPredictions) {
    const parsed = parsePrediction(row.aiPrediction as unknown);
    if (!parsed) continue;
    if (parsed.store && parsed.supplier && parsed.store > parsed.supplier) {
      totalSavingsUsd += parsed.store - parsed.supplier;
    }
  }

  return {
    scansAllTime,
    scansThisWeek,
    totalSavingsUsd: Math.round(totalSavingsUsd),
    refreshedAt: new Date().toISOString(),
  };
}

export async function GET(): Promise<NextResponse<TotalsPayload>> {
  try {
    const payload = await loadTotals();
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[stats-totals] query failed", err);
    return NextResponse.json(FALLBACK, { status: 200 });
  }
}
