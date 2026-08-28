/**
 * Real-world accuracy validation: run a hand-labeled list of LIVE URLs
 * (not the fixture corpus) through the SAME service chain
 * app/api/analyze/route.ts uses in production — scraper -> identifier ->
 * dropship-verdict (Tier-0 gate, supplier-marketplace rules, then the AI
 * verifier with vision-grounded identity) — and measure shown-verdict
 * precision the same way run-fixtures.ts does.
 *
 * Earlier version of this script called verifyDropshipLikelihood() directly,
 * skipping the Tier-0 fingerprint gate and the identifier step entirely.
 * That measures a different, easier pipeline than the one users actually see
 * — corrected here to call the real services.
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
import { scrape as scraperService } from "@/lib/services/scraper";
import { identify as identifierService } from "@/lib/services/product-identifier";
import { verify as verdictService } from "@/lib/services/dropship-verdict";
import { detectProductSource } from "@/lib/scraping/detect-source";
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
  status: "ok" | "scrape_failed" | "verdict_failed";
  error?: string;
  actualVerdict?: DropshipVerdict;
  confidence?: number;
  presenceTier?: PresenceTier;
  verdictMatch?: boolean;
  title?: string;
  provider?: string;
  verdictSource?: string; // "rules" (Tier-0 / supplier-marketplace) or the AI provider/model
  identityName?: string | null;
  markdownExcerpt?: string;
}

const CONCURRENCY = 6;

async function runOne(c: Candidate): Promise<Outcome> {
  const scrapeRes = await scraperService({ url: c.url });
  if (!scrapeRes.ok) {
    return { ...c, status: "scrape_failed", error: scrapeRes.error.message };
  }
  const scrapeOut = scrapeRes.value;

  const sourceType = detectProductSource(c.url);
  let identity = null;
  let identityName: string | null = null;
  if (sourceType !== "supplier_marketplace") {
    const identifierRes = await identifierService({
      attributes: scrapeOut.attributes,
      markdown: scrapeOut.markdown,
    });
    if (identifierRes.ok) {
      identity = identifierRes.value.identity;
      identityName = identity?.canonicalName ?? null;
    }
  }

  const verdictRes = await verdictService({
    url: c.url,
    attributes: scrapeOut.attributes,
    markdown: scrapeOut.markdown,
    html: scrapeOut.html,
    storePriceUsd: scrapeOut.detectedStorePriceUsd,
    identity,
  });

  if (!verdictRes.ok || !verdictRes.value.prediction) {
    return {
      ...c,
      status: "verdict_failed",
      error: verdictRes.ok ? (verdictRes.value.error ?? "no prediction") : verdictRes.error.message,
    };
  }

  const prediction = verdictRes.value.prediction;
  const tier = computePresenceTier(prediction);
  return {
    ...c,
    status: "ok",
    actualVerdict: prediction.verdict,
    confidence: prediction.confidence,
    presenceTier: tier,
    verdictMatch: prediction.verdict === c.expectedVerdict,
    title: scrapeOut.attributes.title?.slice(0, 80),
    provider: scrapeOut.provider,
    verdictSource: verdictRes.value.model,
    identityName,
    markdownExcerpt: scrapeOut.markdown?.slice(0, 400),
  };
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
          : `✓ verdict=${o.actualVerdict} conf=${(o.confidence! * 100).toFixed(0)}% tier=${o.presenceTier} src=${o.verdictSource} ${o.verdictMatch ? "MATCH" : "MISMATCH (expected " + c.expectedVerdict + ")"}`;
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
  console.log(`failed (scrape/verdict):${failed.length}`);
  console.log(
    evaluated.length === 0
      ? "raw verdict accuracy (evaluated only): n/a (0 evaluated)"
      : `raw verdict accuracy (evaluated only): ${verdictCorrect}/${evaluated.length} = ${((verdictCorrect / evaluated.length) * 100).toFixed(1)}%`,
  );

  const tier0Count = evaluated.filter((o) => o.verdictSource === "tier0-store-fingerprint").length;
  const rulesCount = evaluated.filter((o) => o.verdictSource === "supplier-marketplace-detector").length;
  console.log(`\nverdict source breakdown: tier0=${tier0Count} supplier-rules=${rulesCount} ai=${evaluated.length - tier0Count - rulesCount}`);

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
      console.log(`    expected=${o.expectedVerdict} tier=${o.presenceTier} conf=${o.confidence?.toFixed(2)} src=${o.verdictSource} title="${o.title}"`);
    }
  }

  console.log(`\nstayed silent on ${missedDropships.length} known live dropshipper(s) — recall, not gated:`);
  for (const o of missedDropships) {
    console.log(`  • ${o.id}  actual=${o.actualVerdict} conf=${o.confidence?.toFixed(2)} src=${o.verdictSource}  ${o.url}`);
  }

  if (failed.length > 0) {
    console.log("\n--- Failed (scrape or verdict error, excluded from accuracy) ---");
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
