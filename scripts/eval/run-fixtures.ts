/**
 * Run all fixtures through the AI verifier and AliExpress matcher,
 * then print a confusion matrix + per-fixture diagnostics.
 *
 * Usage:
 *   npm run eval                       # run all fixtures
 *   npm run eval -- --filter <slug>    # run fixtures whose id contains <slug>
 *   npm run eval -- --skip-ai          # use cached ai-response.json instead of live AI
 *   npm run eval -- --skip-supplier    # don't run supplier matching
 */

import { verifyDropshipLikelihood } from "@/lib/ai/dropship-verifier";
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { rankAliExpressCandidates } from "@/lib/aliexpress/rank-products";
import {
  computeMatchConfidence,
  MATCH_CONFIDENCE_MIN,
} from "@/lib/aliexpress/match-confidence";
import { detectProductSource } from "@/lib/scraping/detect-source";
import { buildSupplierMarketplacePrediction } from "@/lib/ai/supplier-marketplace-analysis";
import { loadAllFixtures } from "@/lib/eval/fixture-store";
import type {
  ExpectedVerdict,
  FixtureCategory,
  FixtureRecord,
} from "@/tests/eval/fixture-types";

interface CliOptions {
  filter?: string;
  skipAi: boolean;
  skipSupplier: boolean;
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = { skipAi: false, skipSupplier: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--filter") opts.filter = args[i + 1];
    if (args[i] === "--skip-ai") opts.skipAi = true;
    if (args[i] === "--skip-supplier") opts.skipSupplier = true;
  }
  return opts;
}


function deriveVerdict(
  prediction: { isLikelyDropship: boolean; confidence: number; verdict?: string } | null,
  attributes: { title: string; description: string; mainImageUrl: string | null },
): ExpectedVerdict {
  if (!prediction) return "insufficient_evidence";

  // AI explicitly flagged a non-product page → honour that verdict directly.
  // "not_a_product" maps directly; "collection_page" represents a legitimate
  // store showing a catalog — map it to "legit" since there IS a real store
  // behind it (the AI dropship determination must come from individual PDPs).
  if (prediction.verdict === "not_a_product") return "not_a_product";
  if (prediction.verdict === "collection_page") return "legit";

  const attrCount =
    Number(attributes.title.length > 0) +
    Number(attributes.description.length > 50) +
    Number(attributes.mainImageUrl !== null);

  if (attrCount < 2) return "not_a_product";
  if (prediction.confidence < 0.4) return "insufficient_evidence";
  return prediction.isLikelyDropship ? "dropship" : "legit";
}

interface FixtureOutcome {
  id: string;
  category: FixtureCategory;
  expectedVerdict: ExpectedVerdict;
  predictedVerdict: ExpectedVerdict;
  confidence: number;
  verdictMatch: boolean;
  expectedSupplier: { shouldFindMatch: boolean };
  supplierFound: boolean;
  supplierMatch: boolean;
  supplierWinnerPriceUsd: number | null;
  notes: string[];
}

async function evaluateFixture(
  fixture: FixtureRecord,
  opts: CliOptions,
): Promise<FixtureOutcome> {
  const notes: string[] = [];
  const sourceType = detectProductSource(fixture.scrape.attributes.sourceUrl);
  const isSupplierListing = sourceType === "supplier_marketplace";

  let prediction: {
    isLikelyDropship: boolean;
    confidence: number;
    verdict?: string;
  } | null = null;

  if (isSupplierListing) {
    prediction = buildSupplierMarketplacePrediction(
      fixture.scrape.attributes.sourceUrl,
      fixture.scrape.attributes,
      fixture.scrape.detectedStorePriceUsd,
    );
    notes.push("supplier marketplace — rule-based verdict");
  } else if (opts.skipAi && fixture.aiResponse?.prediction) {
    prediction = fixture.aiResponse.prediction;
    notes.push("AI replayed from fixture");
  } else {
    try {
      const result = await verifyDropshipLikelihood({
        attributes: fixture.scrape.attributes,
        markdownExcerpt: fixture.scrape.raw.markdown,
        storePriceUsd: fixture.scrape.detectedStorePriceUsd,
      });
      prediction = result.prediction;
      if (!result.prediction) notes.push(`AI error: ${result.error}`);
    } catch (err) {
      notes.push(`AI threw: ${(err as Error).message}`);
    }
  }

  const predictedVerdict = deriveVerdict(prediction, fixture.scrape.attributes);
  const verdictMatch = predictedVerdict === fixture.truth.expectedVerdict;

  let supplierFound = false;
  let supplierMatch = false;
  let supplierWinnerPriceUsd: number | null = null;

  // Mirror production gating: supplier search only runs when verdict is dropship.
  // legit / collection_page / not_a_product / insufficient_evidence all suppress
  // the supplier search in the real pipeline, so we must do the same here to
  // avoid false-positive supplier matches on legit/collection pages.
  const supplierSearchVerdict = prediction?.verdict ?? predictedVerdict;
  const supplierSearchEnabled =
    !opts.skipSupplier &&
    fixture.aliexpress !== undefined &&
    supplierSearchVerdict === "dropship";

  if (supplierSearchEnabled && fixture.aliexpress) {
    const ranked = rankAliExpressCandidates(fixture.aliexpress.candidates);

    // Apply the same confidence floor that production uses (MATCH_CONFIDENCE_MIN).
    // Without this, any random high-volume AliExpress listing is treated as a
    // "found" supplier even when its title is completely unrelated (e.g. a USB
    // charger returned for a Hebrew candle brand search).
    const confidenceRanked = ranked
      .map((candidate) => ({
        candidate,
        confidence: computeMatchConfidence(
          fixture.scrape.attributes,
          fixture.scrape.detectedStorePriceUsd,
          candidate,
        ),
      }))
      .filter(({ confidence }) => confidence.score >= MATCH_CONFIDENCE_MIN);

    supplierFound = confidenceRanked.length > 0;
    supplierWinnerPriceUsd = confidenceRanked[0]?.candidate.priceUsd ?? null;

    const truthExpected = fixture.truth.expectedSupplier;
    if (truthExpected.shouldFindMatch && supplierFound) {
      const band = truthExpected.expectedPriceUsdBand;
      supplierMatch =
        !band || (supplierWinnerPriceUsd !== null &&
          supplierWinnerPriceUsd >= band[0] &&
          supplierWinnerPriceUsd <= band[1]);
    } else if (!truthExpected.shouldFindMatch) {
      supplierMatch = !supplierFound;
    }
  } else {
    // Supplier search was skipped (no aliexpress.json, skipSupplier flag, or
    // non-dropship verdict). For legit/collection/not_a_product verdicts the
    // production system would never have run the search, so "no match found"
    // is the correct production outcome — count it correct iff shouldFindMatch=false.
    if (fixture.truth.expectedSupplier.shouldFindMatch) {
      if (!fixture.aliexpress) {
        notes.push("expected supplier match but no aliexpress.json captured");
      }
      // supplierMatch stays false — we didn't find a supplier
    } else {
      // shouldFindMatch=false and we found nothing — correct outcome
      supplierMatch = true;
    }
  }

  return {
    id: fixture.id,
    category: fixture.truth.category,
    expectedVerdict: fixture.truth.expectedVerdict,
    predictedVerdict,
    confidence: prediction?.confidence ?? 0,
    verdictMatch,
    expectedSupplier: { shouldFindMatch: fixture.truth.expectedSupplier.shouldFindMatch },
    supplierFound,
    supplierMatch,
    supplierWinnerPriceUsd,
    notes,
  };
}

const VERDICTS: ExpectedVerdict[] = [
  "dropship",
  "legit",
  "insufficient_evidence",
  "not_a_product",
];

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

function printConfusionMatrix(outcomes: FixtureOutcome[]): void {
  console.log("\n=== Confusion Matrix (rows=truth, cols=predicted) ===\n");
  const header = ["truth \\ pred", ...VERDICTS, "total"].map((c) => pad(c, 22)).join("");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const truth of VERDICTS) {
    const row = [pad(truth, 22)];
    let rowTotal = 0;
    for (const pred of VERDICTS) {
      const count = outcomes.filter(
        (o) => o.expectedVerdict === truth && o.predictedVerdict === pred,
      ).length;
      rowTotal += count;
      const isCorrect = truth === pred;
      const cell = count === 0 ? "." : isCorrect ? `✓ ${count}` : `✗ ${count}`;
      row.push(pad(cell, 22));
    }
    row.push(pad(String(rowTotal), 22));
    console.log(row.join(""));
  }
}

function printConfidenceBuckets(outcomes: FixtureOutcome[]): void {
  console.log("\n=== Confidence Calibration ===\n");
  console.log(pad("bucket", 14) + pad("count", 8) + pad("correct", 10) + pad("accuracy", 10));
  console.log("-".repeat(42));
  const buckets = [
    [0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.01],
  ];
  for (const [lo, hi] of buckets) {
    const inBucket = outcomes.filter((o) => o.confidence >= lo && o.confidence < hi);
    if (inBucket.length === 0) continue;
    const correct = inBucket.filter((o) => o.verdictMatch).length;
    const accuracy = ((correct / inBucket.length) * 100).toFixed(0);
    console.log(
      pad(`${lo.toFixed(1)}–${hi.toFixed(1)}`, 14) +
        pad(String(inBucket.length), 8) +
        pad(String(correct), 10) +
        pad(`${accuracy}%`, 10),
    );
  }
}

function printSupplierAccuracy(outcomes: FixtureOutcome[]): void {
  console.log("\n=== Supplier Match Accuracy ===\n");
  const tp = outcomes.filter(
    (o) => o.expectedSupplier.shouldFindMatch && o.supplierFound && o.supplierMatch,
  ).length;
  const fp = outcomes.filter(
    (o) => !o.expectedSupplier.shouldFindMatch && o.supplierFound,
  ).length;
  const fn = outcomes.filter(
    (o) => o.expectedSupplier.shouldFindMatch && !o.supplierFound,
  ).length;
  const tn = outcomes.filter(
    (o) => !o.expectedSupplier.shouldFindMatch && !o.supplierFound,
  ).length;
  const precision = tp + fp > 0 ? ((tp / (tp + fp)) * 100).toFixed(0) : "n/a";
  const recall = tp + fn > 0 ? ((tp / (tp + fn)) * 100).toFixed(0) : "n/a";
  console.log(`TP=${tp}  FP=${fp}  FN=${fn}  TN=${tn}`);
  console.log(`precision=${precision}%   recall=${recall}%`);
  console.log("(FP = wrong supplier shown for a legit/non-product page — the WORST failure mode)");
}

function printFailures(outcomes: FixtureOutcome[]): void {
  const failures = outcomes.filter((o) => !o.verdictMatch || !o.supplierMatch);
  if (failures.length === 0) {
    console.log("\n✓ All fixtures pass.\n");
    return;
  }
  console.log("\n=== Per-Fixture Failures ===\n");
  for (const f of failures) {
    const verdictFlag = f.verdictMatch ? "✓" : "✗";
    const supplierFlag = f.supplierMatch ? "✓" : "✗";
    console.log(`${f.id}  [${f.category}]`);
    console.log(
      `  verdict ${verdictFlag}  expected=${f.expectedVerdict}  predicted=${f.predictedVerdict}  conf=${f.confidence.toFixed(2)}`,
    );
    console.log(
      `  supplier ${supplierFlag}  expected_match=${f.expectedSupplier.shouldFindMatch}  found=${f.supplierFound}  winner_price=$${f.supplierWinnerPriceUsd ?? "?"}`,
    );
    if (f.notes.length > 0) {
      f.notes.forEach((n) => console.log(`  • ${n}`));
    }
    console.log();
  }
}

function printSummary(outcomes: FixtureOutcome[]): void {
  const total = outcomes.length;
  const verdictCorrect = outcomes.filter((o) => o.verdictMatch).length;
  const supplierCorrect = outcomes.filter((o) => o.supplierMatch).length;
  const verdictPct = ((verdictCorrect / total) * 100).toFixed(0);
  const supplierPct = ((supplierCorrect / total) * 100).toFixed(0);

  console.log("\n=== Summary ===\n");
  console.log(`fixtures evaluated: ${total}`);
  console.log(`verdict accuracy:   ${verdictCorrect}/${total}  (${verdictPct}%)`);
  console.log(`supplier accuracy:  ${supplierCorrect}/${total}  (${supplierPct}%)`);
}

async function main(): Promise<void> {
  const opts = parseOptions();
  const allFixtures = loadAllFixtures();
  if (allFixtures.length === 0) {
    console.error("No fixtures found in tests/fixtures/products/.");
    console.error("Run npm run eval:capture to add some.");
    process.exit(1);
  }

  const fixtures = opts.filter
    ? allFixtures.filter((f) => f.id.includes(opts.filter!))
    : allFixtures;

  console.log(`Evaluating ${fixtures.length} fixture(s)…`);
  if (opts.skipAi) console.log("(replaying AI from cached responses)");
  if (opts.skipSupplier) console.log("(skipping supplier matching)");

  const outcomes: FixtureOutcome[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  • ${fixture.id} …`);
    const outcome = await evaluateFixture(fixture, opts);
    const pass = outcome.verdictMatch && outcome.supplierMatch;
    process.stdout.write(` ${pass ? "✓" : "✗"}\n`);
    outcomes.push(outcome);
  }

  printConfusionMatrix(outcomes);
  printConfidenceBuckets(outcomes);
  printSupplierAccuracy(outcomes);
  printFailures(outcomes);
  printSummary(outcomes);

  const exitCode = outcomes.every((o) => o.verdictMatch && o.supplierMatch) ? 0 : 1;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(99);
});
