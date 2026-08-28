/**
 * Real-world accuracy validation: run a hand-labeled list of LIVE URLs
 * (not the fixture corpus) through the live scrape + AI pipeline and
 * measure shown-verdict precision the same way run-fixtures.ts does.
 *
 * This is the "100 hand-labeled live URLs" check named as a hard
 * prerequisite in ROADMAP.md / agent-os/product/context.md open question #1.
 * It intentionally does NOT touch tests/fixtures/products/ — this is a
 * point-in-time measurement, not a permanent addition to the CI-gated
 * corpus. AliExpress supplier search is skipped: the open question is
 * verdict precision, not supplier match, and skipping it keeps the run
 * fast and cheap.
 *
 * Usage:
 *   npx tsx scripts/eval/live-url-validation.ts <candidates.json> [out.json]
 *
 * candidates.json: array of { id, url, category, expectedVerdict, notes? }
 */
import * as fs from "node:fs";
import { scrapeProductUrl } from "@/lib/scraping/router";
import { detectPriceInMarkdown } from "@/lib/scraping/extract-price";
import { verifyDropshipLikelihood } from "@/lib/ai/dropship-verifier";
import { computePresenceTier, type PresenceTier } from "@/lib/analyze/presence-tier";
import type { DropshipVerdict } from "@/lib/ai/dropship-verifier";

interface Candidate {
  id: string;
  url: string;
  category: string;
  expectedVerdict: DropshipVerdict;
  notes?: string;
}

interface Outcome {
  id: string;
  url: string;
  category: string;
  expectedVerdict: DropshipVerdict;
  notes?: string;
  status: "ok" | "scrape_failed" | "ai_failed";
  error?: string;
  actualVerdict?: DropshipVerdict;
  confidence?: number;
  presenceTier?: PresenceTier;
  verdictMatch?: boolean;
  title?: string;
  provider?: string;
  markdownExcerpt?: string;
}

const CONCURRENCY = 6;

async function runOne(c: Candidate): Promise<Outcome> {
  let scrape;
  try {
    scrape = await scrapeProductUrl(c.url);
  } catch (err) {
    return { ...c, status: "scrape_failed", error: (err as Error).message };
  }

  try {
    const detectedPrice = detectPriceInMarkdown(scrape.raw.markdown);
    const result = await verifyDropshipLikelihood({
      attributes: scrape.attributes,
      markdownExcerpt: scrape.raw.markdown,
      storePriceUsd: detectedPrice?.amountUsd ?? null,
    });
    if (!result.prediction) {
      return { ...c, status: "ai_failed", error: result.error ?? "no prediction" };
    }
    const tier = computePresenceTier(result.prediction);
    return {
      ...c,
      status: "ok",
      actualVerdict: result.prediction.verdict,
      confidence: result.prediction.confidence,
      presenceTier: tier,
      verdictMatch: result.prediction.verdict === c.expectedVerdict,
      title: scrape.attributes.title?.slice(0, 80),
      provider: scrape.raw.provider,
      markdownExcerpt: scrape.raw.markdown?.slice(0, 400),
    };
  } catch (err) {
    return { ...c, status: "ai_failed", error: (err as Error).message };
  }
}

async function runBatch(candidates: Candidate[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = new Array(candidates.length);
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const i = next++;
      const c = candidates[i];
      process.stdout.write(`[${i + 1}/${candidates.length}] ${c.id} ${c.url}\n`);
      const o = await runOne(c);
      const tag =
        o.status !== "ok"
          ? `✗ ${o.status}: ${o.error}`
          : `✓ verdict=${o.actualVerdict} conf=${(o.confidence! * 100).toFixed(0)}% tier=${o.presenceTier} ${o.verdictMatch ? "MATCH" : "MISMATCH (expected " + c.expectedVerdict + ")"}`;
      process.stdout.write(`    ${tag}\n`);
      outcomes[i] = o;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return outcomes;
}

function printReport(outcomes: Outcome[]): void {
  const evaluated = outcomes.filter((o) => o.status === "ok");
  const failed = outcomes.filter((o) => o.status !== "ok");

  const shown = evaluated.filter((o) => o.presenceTier !== "silent");
  const falsePositives = shown.filter((o) => o.expectedVerdict !== "dropship");
  const truePositives = shown.length - falsePositives.length;
  const precision = shown.length === 0 ? 1 : truePositives / shown.length;

  const missedDropships = evaluated.filter(
    (o) => o.presenceTier === "silent" && o.expectedVerdict === "dropship",
  );

  const verdictCorrect = evaluated.filter((o) => o.verdictMatch).length;

  console.log("\n=== Live URL Validation ===\n");
  console.log(`candidates:        ${outcomes.length}`);
  console.log(`scraped+verdicted: ${evaluated.length}`);
  console.log(`failed (scrape/AI):${failed.length}`);
  console.log(
    `raw verdict accuracy (evaluated only): ${verdictCorrect}/${evaluated.length} = ${((verdictCorrect / evaluated.length) * 100).toFixed(1)}%`,
  );

  console.log("\n--- Shown-Verdict Precision (Phase 1 exit gate, same metric as eval harness) ---");
  console.log("(only flame/amber count as 'shown' — silent accuses nobody)");
  for (const tier of ["flame", "amber"] as const) {
    const rows = shown.filter((o) => o.presenceTier === tier);
    const bad = rows.filter((o) => o.expectedVerdict !== "dropship").length;
    console.log(`  ${tier}: shown=${rows.length} correct=${rows.length - bad} false_accusations=${bad}`);
  }
  console.log(
    `\nshown-verdict precision: ${truePositives}/${shown.length} = ${shown.length === 0 ? "n/a" : (precision * 100).toFixed(1) + "%"}  (gate: >= 95%)`,
  );

  if (falsePositives.length > 0) {
    console.log("\nFALSE ACCUSATIONS (a non-dropship live URL we spoke up on):");
    for (const o of falsePositives) {
      console.log(`  • ${o.id}  ${o.url}`);
      console.log(`    expected=${o.expectedVerdict} tier=${o.presenceTier} conf=${o.confidence?.toFixed(2)} title="${o.title}"`);
    }
  }

  console.log(`\nstayed silent on ${missedDropships.length} known live dropshipper(s) — recall, not gated:`);
  for (const o of missedDropships) {
    console.log(`  • ${o.id}  actual=${o.actualVerdict} conf=${o.confidence?.toFixed(2)}  ${o.url}`);
  }

  if (failed.length > 0) {
    console.log("\n--- Failed (scrape or AI error, excluded from accuracy) ---");
    for (const o of failed) {
      console.log(`  • ${o.id}  [${o.status}] ${o.error}  ${o.url}`);
    }
  }
}

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: npx tsx scripts/eval/live-url-validation.ts <candidates.json> [out.json]");
    process.exit(1);
  }
  const candidates: Candidate[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  console.log(`[live-validation] ${candidates.length} candidates, concurrency=${CONCURRENCY}\n`);

  const outcomes = await runBatch(candidates);
  printReport(outcomes);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(outcomes, null, 2));
    console.log(`\n[live-validation] wrote ${outputPath}`);
  }
}

main().catch((err) => {
  console.error("[live-validation] fatal:", err);
  process.exit(99);
});
