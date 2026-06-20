import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction } from "@/lib/types/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1 hour

/**
 * Self-healing example chips — Sprint 12 Stage 33.
 *
 * Returns up to N (default 3) recent scans that have:
 *   - AliExpress data attached (so we know supplier search succeeded)
 *   - estimatedStorePriceUsd > estimatedSupplierPriceUsd (real savings)
 *   - last-scraped within 30 days (within cache TTL)
 *
 * The home page hits this on mount; if it errors we fall back to a tiny
 * hard-coded list in `lib/examples.ts`. Cached for 1h at the edge.
 */

interface FeaturedExample {
  label: string;
  savingsHint: string;
  url: string;
  scanId: string;
}

const FALLBACK: FeaturedExample[] = [];

export async function GET(): Promise<NextResponse<{ examples: FeaturedExample[] }>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.scannedProduct.findMany({
      select: {
        id: true,
        originalUrl: true,
        scrapeData: true,
        aiPrediction: true,
        aliexpressData: true,
        lastScrapedAt: true,
      },
      where: {
        aliexpressData: { not: Prisma.JsonNull },
        lastScrapedAt: { gt: thirtyDaysAgo },
      },
      orderBy: { lastScrapedAt: "desc" },
      take: 30, // sample pool — we filter + rank below
    });

    const candidates: Array<FeaturedExample & { savings: number }> = [];

    for (const row of rows) {
      const ai = parseCachedAiPrediction(row.aiPrediction);
      const ali = parseAliExpressData(row.aliexpressData);
      if (!ai?.prediction || !ali) continue;

      const storeUsd = ai.prediction.estimatedStorePriceUsd ?? 0;
      const supplierUsd = ai.prediction.estimatedSupplierPriceUsd ?? ali.priceUsd;
      if (storeUsd <= 0 || supplierUsd <= 0 || supplierUsd >= storeUsd) continue;

      const savingsPct = Math.round(((storeUsd - supplierUsd) / storeUsd) * 100);
      if (savingsPct < 30) continue; // not a wow-worthy example

      const cat = ai.prediction.productCategory?.trim() ?? "Product";
      const label = cat.length > 28 ? `${cat.slice(0, 27)}…` : cat;

      candidates.push({
        label,
        savingsHint: `save ~${savingsPct}%`,
        url: row.originalUrl,
        scanId: row.id,
        savings: savingsPct,
      });
    }

    // De-dupe by URL, pick the 3 with highest savings, but spread across the pool.
    const seen = new Set<string>();
    const ranked = candidates
      .sort((a, b) => b.savings - a.savings)
      .filter((c) => {
        if (seen.has(c.url)) return false;
        seen.add(c.url);
        return true;
      })
      .slice(0, 3)
      .map(({ savings, ...rest }) => {
        void savings;
        return rest;
      });

    return NextResponse.json(
      { examples: ranked },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    console.error("[examples-featured] query failed", err);
    return NextResponse.json({ examples: FALLBACK });
  }
}
