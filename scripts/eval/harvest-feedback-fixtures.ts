/**
 * Harvest user match-feedback into DRAFT eval-fixture candidates.
 *
 *   npm run eval:harvest              # last 30 days
 *   npm run eval:harvest -- --days 7
 *
 * The community-verification bridge (ROADMAP Phase 2): MatchFeedback rows
 * ("right"/"wrong" from the results-page thumbs widget) are joined with
 * their cached scan data and written to tests/fixtures/candidates/<id>/ as
 * REVIEW DRAFTS. They are deliberately kept OUT of tests/fixtures/products/
 * (and out of git) — a human must verify each truth.json and move the folder
 * into products/ before the eval trusts it. "similar" feedback is skipped:
 * too ambiguous to seed ground truth.
 *
 * Full markdown is restored from the FetchedPage cache (gzip) when present;
 * otherwise the 1,500-char cached preview is used and flagged in the notes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { domainFromUrl } from "@/lib/learning/priors";
import { prisma } from "@/lib/prisma";
import { parseCachedAiPrediction, parseCachedScrapeData } from "@/lib/types/cache";
import { parseAliExpressData } from "@/lib/types/analyze";
import type { FixtureRecord, FixtureTruth } from "@/tests/eval/fixture-types";

const CANDIDATES_ROOT = join(process.cwd(), "tests/fixtures/candidates");

function parseDays(): number {
  const idx = process.argv.indexOf("--days");
  const parsed = idx !== -1 ? Number(process.argv[idx + 1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function slugify(url: string, scanId: string): string {
  const host = (domainFromUrl(url) ?? "unknown").replace(/[^a-z0-9.-]/g, "");
  return `feedback-${host.replace(/\./g, "-")}-${scanId.slice(0, 6)}`;
}

function writeJson(dir: string, file: string, data: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
}

async function fullMarkdownFor(url: string): Promise<string | null> {
  try {
    const page = await prisma.fetchedPage.findUnique({ where: { url } });
    if (page?.markdown) return gunzipSync(page.markdown).toString("utf-8");
  } catch {
    /* cache miss / decompress failure — caller falls back to preview */
  }
  return null;
}

async function main(): Promise<void> {
  const days = parseDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const feedback = await prisma.matchFeedback.findMany({
    where: { createdAt: { gte: since }, verdict: { in: ["right", "wrong"] } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Found ${feedback.length} right/wrong feedback row(s) in the last ${days} day(s).`);

  let written = 0;
  let skipped = 0;

  for (const fb of feedback) {
    const row = await prisma.scannedProduct.findUnique({ where: { id: fb.scanId } });
    const scrape = row ? parseCachedScrapeData(row.scrapeData) : null;
    const ai = row ? parseCachedAiPrediction(row.aiPrediction) : null;
    const ali = row ? parseAliExpressData(row.aliexpressData) : null;

    if (!row || !scrape || !ai?.prediction) {
      skipped += 1;
      console.log(`  ⤫ ${fb.scanId} — scan row missing or unparseable, skipped`);
      continue;
    }

    const fullMarkdown = await fullMarkdownFor(row.originalUrl);
    const markdown = fullMarkdown ?? scrape.markdownPreview ?? "";
    const aiVerdict = ai.prediction.verdict;
    // Map pipeline verdicts onto the eval's ExpectedVerdict space (the eval
    // treats collection_page as legit; see deriveVerdict in run-fixtures.ts).
    const draftVerdict = aiVerdict === "collection_page" ? "legit" : aiVerdict;

    const notes = [
      `DRAFT from user feedback ("${fb.verdict}" on ${fb.createdAt.toISOString().slice(0, 10)})`,
      "HAND-VERIFY every field, then move this folder into tests/fixtures/products/.",
      fb.verdict === "wrong"
        ? "User said the shown supplier was NOT the same product — decide shouldFindMatch yourself; the AI verdict below is unreviewed."
        : "User confirmed the supplier match — verdict and price band below are still drafts.",
      ...(fullMarkdown === null
        ? ["Markdown is the 1,500-char cached preview only (FetchedPage cache had no full copy)."]
        : []),
      ...(fb.note ? [`User note: ${fb.note}`] : []),
    ].join(" | ");

    const truth: FixtureTruth = {
      url: row.originalUrl,
      // Draft default; the reviewer re-buckets (dropship_subtle etc.).
      category: draftVerdict === "dropship" ? "dropship_obvious" : "legit_brand",
      expectedVerdict: draftVerdict as FixtureTruth["expectedVerdict"],
      expectedSupplier:
        fb.verdict === "right" && ali
          ? {
              shouldFindMatch: true,
              expectedPriceUsdBand: [
                Math.max(0, Math.floor(ali.priceUsd * 0.6)),
                Math.ceil(ali.priceUsd * 1.4),
              ],
              notes: "Band = confirmed match price ±40% (draft).",
            }
          : { shouldFindMatch: false, notes: "DRAFT — set by reviewer." },
      notes,
      capturedAt: new Date().toISOString().slice(0, 10),
    };

    const id = slugify(row.originalUrl, fb.scanId);
    const dir = join(CANDIDATES_ROOT, id);
    const record: Omit<FixtureRecord, "id"> = {
      truth,
      scrape: {
        raw: {
          provider: scrape.provider ?? "crawlbase",
          markdown,
          metadata: {
            title: scrape.attributes.title,
            description: scrape.attributes.description,
            sourceUrl: row.originalUrl,
          },
        },
        attributes: scrape.attributes,
        detectedStorePriceUsd: scrape.detectedStorePriceUsd,
        storeName: scrape.storeName,
      } as FixtureRecord["scrape"],
      aiResponse: {
        prediction: ai.prediction,
        rawResponse: ai.rawResponse ?? "",
        model: ai.model ?? "unknown",
        provider: ai.provider ?? "unknown",
        error: ai.error ?? null,
      },
    };

    writeJson(dir, "truth.json", record.truth);
    writeJson(dir, "scrape.json", record.scrape);
    writeJson(dir, "ai-response.json", record.aiResponse);
    written += 1;
    console.log(`  ✓ ${id} [feedback=${fb.verdict}] → tests/fixtures/candidates/`);
  }

  console.log(`\nHarvested ${written} draft candidate(s), skipped ${skipped}.`);
  if (written > 0) {
    console.log("Review each truth.json by hand, then move the folder into tests/fixtures/products/.");
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[harvest] fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
