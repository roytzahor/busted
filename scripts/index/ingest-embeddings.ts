/**
 * Ingest cached scans into the product embedding index.
 *
 *   npm run index:ingest -- --limit 50
 *   npm run index:ingest -- --limit 5 --dry-run
 *
 * Embeds the retail product (title + AI category) and, when the scan has a
 * matched supplier listing, the AliExpress side too — both keyed by URL so
 * re-runs are idempotent upserts. This is the Phase 2 groundwork feed; the
 * ANN lookup path in find-supplier stays behind VECTOR_INDEX_ENABLED.
 */

import { prisma } from "@/lib/prisma";
import {
  embedProductText,
  upsertProductEmbedding,
} from "@/lib/index/embeddings";
import { parseAliExpressData } from "@/lib/types/analyze";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";

function argNum(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  const parsed = idx !== -1 ? Number(process.argv[idx + 1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const limit = argNum("--limit", 50);
  const dryRun = process.argv.includes("--dry-run");

  const rows = await prisma.scannedProduct.findMany({
    orderBy: { lastScrapedAt: "desc" },
    take: limit,
  });
  console.log(`Ingesting up to ${rows.length} scan(s)${dryRun ? " (dry run)" : ""}…`);

  let embedded = 0;
  let skipped = 0;

  for (const row of rows) {
    const scrape = parseCachedScrapeData(row.scrapeData);
    const ai = parseCachedAiPrediction(row.aiPrediction);
    const ali = parseAliExpressData(row.aliexpressData);
    if (!scrape) {
      skipped += 1;
      continue;
    }

    const retailText = [
      scrape.attributes.translatedTitle ?? scrape.attributes.title,
      ai?.prediction?.productCategory ?? "",
    ]
      .filter(Boolean)
      .join(" — ");

    if (dryRun) {
      console.log(`  · would embed retail: ${retailText.slice(0, 80)}`);
      if (ali && row.aliexpressUrl) {
        console.log(`  · would embed aliexpress: ${ali.title.slice(0, 80)}`);
      }
      embedded += 1;
      continue;
    }

    const retailVec = await embedProductText(retailText);
    if (retailVec) {
      await upsertProductEmbedding({
        scanId: row.id,
        network: "retail",
        title: scrape.attributes.title,
        sourceUrl: row.originalUrl,
        priceUsd: scrape.detectedStorePriceUsd,
        imageUrl: scrape.attributes.mainImageUrl,
        embedding: retailVec,
      });
      embedded += 1;
      console.log(`  ✓ retail ${row.originalUrl.slice(0, 70)}`);
    } else {
      skipped += 1;
      console.log(`  ⤫ embed failed for ${row.id}`);
    }

    if (ali && row.aliexpressUrl) {
      const aliVec = await embedProductText(ali.title);
      if (aliVec) {
        await upsertProductEmbedding({
          scanId: row.id,
          network: "aliexpress",
          title: ali.title,
          sourceUrl: row.aliexpressUrl,
          priceUsd: ali.priceUsd,
          imageUrl: ali.imageUrl ?? null,
          embedding: aliVec,
        });
        embedded += 1;
        console.log(`  ✓ aliexpress ${ali.title.slice(0, 60)}`);
      }
    }
  }

  console.log(`\nEmbedded ${embedded} listing(s), skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[ingest-embeddings] fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
