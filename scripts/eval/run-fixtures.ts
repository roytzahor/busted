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
  estimatedCostUsd: number;
  notes: string[];
}

/**
 * Projected per-scan cost model — for tracking *relative* cost deltas across
 * refactors, not billing-grade precision. Per-stage figures are the documented
 * costs from CLAUDE.md (Gemini vision ≈ $0.0001/call, preprocess image-gen
 * ≈ $0.039, cold text scan ≈ $0.0015).
 */
const COST_USD = {
  BASE_SCAN: 0.0015, // scrape + text verdict (always incurred)
  VISION_IDENTIFIER: 0.0002, // Gemini Vision canonical-identity call
  IMAGE_RERANK: 0.0001, // batch image rerank (one multimodal call)
  IMAGE_MATCH: 0.0001, // deep per-candidate image verification
  PREPROCESS: 0.039, // image-gen preprocess (off by default)
} as const;

/**
 * Estimate the AI cost a live scan of this fixture would incur, given which
 * escalation stages its characteristics would trigger. Mirrors the runtime
 * gates: image stages only run for a dropship verdict with a source image and
 * a non-trivial text score; preprocess is assumed OFF (prod default).
 */
function projectScanCost(
  fixture: FixtureRecord,
  predictedVerdict: ExpectedVerdict,
): number {
  let cost: number = COST_USD.BASE_SCAN;
  const hasImage = fixture.scrape.attributes.mainImageUrl !== null;
  // Vision identifier runs on every scan with an image (IDENTIFIER_ENABLED default ON).
  if (hasImage) cost += COST_USD.VISION_IDENTIFIER;
  // Image rerank + deep image match only run when a supplier search runs
  // (dropship verdict) AND there is a source image to compare against.
  if (predictedVerdict === "dropship" && hasImage) {
    cost += COST_USD.IMAGE_RERANK + COST_USD.IMAGE_MATCH;
  }
  return cost;
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
    productCategory?: string;
    aliexpressKeywords?: string[];
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

    // Mirror production: fold AI category + keywords into the match text so
    // brand-name-only titles still overlap with generic AliExpress listings.
    const matchTerms = [prediction?.productCategory, ...(prediction?.aliexpressKeywords ?? [])]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .join(" ");

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
          matchTerms,
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
    estimatedCostUsd: projectScanCost(fixture, predictedVerdict),
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

/**
 * The regression guardrail. Two failure classes damage user trust and revenue
 * the most, so we surface them on their own before the generic failure list:
 *   1. verdict FP — a legit / not-a-product page called "dropship"
 *   2. supplier FP — a supplier link shown for a page that should have none
 * Both should stay at ZERO. A refactor that raises either is a regression even
 * if headline accuracy looks flat.
 */
function printFalsePositives(outcomes: FixtureOutcome[]): void {
  const verdictFps = outcomes.filter(
    (o) =>
      (o.expectedVerdict === "legit" || o.expectedVerdict === "not_a_product") &&
      o.predictedVerdict === "dropship",
  );
  const supplierFps = outcomes.filter(
    (o) => !o.expectedSupplier.shouldFindMatch && o.supplierFound,
  );

  console.log("\n=== False Positives (regression guardrail — target: 0) ===\n");
  console.log(`verdict FP (legit/not-a-product → dropship): ${verdictFps.length}`);
  verdictFps.forEach((o) =>
    console.log(`  ✗ ${o.id} [${o.category}] expected=${o.expectedVerdict}`),
  );
  console.log(`supplier FP (link shown when none expected): ${supplierFps.length}`);
  supplierFps.forEach((o) =>
    console.log(`  ✗ ${o.id} [${o.category}] winner_price=$${o.supplierWinnerPriceUsd ?? "?"}`),
  );
  if (verdictFps.length === 0 && supplierFps.length === 0) {
    console.log("✓ no false positives");
  }
}

function printPerCategoryAccuracy(outcomes: FixtureOutcome[]): void {
  console.log("\n=== Per-Category Verdict Accuracy ===\n");
  console.log(pad("category", 20) + pad("n", 6) + pad("correct", 10) + pad("accuracy", 10));
  console.log("-".repeat(46));
  const categories = [...new Set(outcomes.map((o) => o.category))].sort();
  for (const cat of categories) {
    const rows = outcomes.filter((o) => o.category === cat);
    const correct = rows.filter((o) => o.verdictMatch).length;
    const acc = ((correct / rows.length) * 100).toFixed(0);
    console.log(
      pad(cat, 20) + pad(String(rows.length), 6) + pad(String(correct), 10) + pad(`${acc}%`, 10),
    );
  }
}

function printCostProjection(outcomes: FixtureOutcome[]): void {
  console.log("\n=== Projected Cost / Scan (relative tracking — see COST_USD) ===\n");
  const costs = outcomes.map((o) => o.estimatedCostUsd).sort((a, b) => a - b);
  const total = costs.reduce((s, c) => s + c, 0);
  const mean = total / costs.length;
  const median = costs[Math.floor(costs.length / 2)];
  const max = costs[costs.length - 1];
  const fmt = (n: number) => `$${n.toFixed(4)}`;
  console.log(`mean=${fmt(mean)}  median=${fmt(median)}  max=${fmt(max)}  total(${costs.length} scans)=${fmt(total)}`);
  console.log("(estimate: assumes PREPROCESS off; image stages only on dropship+image)");
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
  printPerCategoryAccuracy(outcomes);
  printConfidenceBuckets(outcomes);
  printSupplierAccuracy(outcomes);
  printFalsePositives(outcomes);
  printCostProjection(outcomes);
  printFailures(outcomes);
  printSummary(outcomes);

  const exitCode = outcomes.every((o) => o.verdictMatch && o.supplierMatch) ? 0 : 1;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(99);
});
