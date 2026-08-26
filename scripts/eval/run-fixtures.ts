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
import { rankAliExpressCandidates } from "@/lib/aliexpress/rank-products";
import {
  computeMatchConfidence,
  MATCH_CONFIDENCE_MIN,
} from "@/lib/aliexpress/match-confidence";
import { detectProductSource } from "@/lib/scraping/detect-source";
import { buildSupplierMarketplacePrediction } from "@/lib/ai/supplier-marketplace-analysis";
import { loadAllFixtures } from "@/lib/eval/fixture-store";
import { runStoreFingerprint } from "@/lib/tier0/store-fingerprint";
import type {
  ExpectedVerdict,
  FixtureCategory,
  FixtureRecord,
} from "@/tests/eval/fixture-types";

interface CliOptions {
  filter?: string;
  skipAi: boolean;
  skipSupplier: boolean;
  /** When set, a mean projected cost above the budget fails the run (exit 1). */
  enforceCost: boolean;
  /** Mean-cost budget in USD (default COST_BUDGET_USD). */
  maxMeanCost: number;
}

/**
 * Mean projected cost/scan budget. A refactor that raises accuracy but pushes
 * the mean scan cost above this is a cost regression — run with --enforce-cost
 * (e.g. in CI) to make it fail.
 *
 * Raised 0.004 -> 0.0085 because the BASELINE moved, not because the gate was
 * loosened to get green. The old budget sat above a ~$0.0018 baseline (2.2x
 * headroom) computed on a cheaper model; the 3.x flash bump in this PR puts the
 * real mean at ~$0.0067 (max $0.0068 across the corpus). The new budget is
 * ~1.25x the measured mean, so it is PROPORTIONALLY TIGHTER than what it
 * replaces and will trip on a smaller regression than before.
 *
 * Re-derive this and COST_USD.BASE_SCAN together whenever GOOGLE_AI_MODEL
 * changes price tier. A budget left behind a model bump is a gate that reports
 * "over budget" forever, gets ignored, and then gets deleted.
 */
const COST_BUDGET_USD = 0.0085;

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    skipAi: false,
    skipSupplier: false,
    enforceCost: false,
    maxMeanCost: COST_BUDGET_USD,
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--filter") opts.filter = args[i + 1];
    if (args[i] === "--skip-ai") opts.skipAi = true;
    if (args[i] === "--skip-supplier") opts.skipSupplier = true;
    if (args[i] === "--enforce-cost") opts.enforceCost = true;
    if (args[i] === "--max-mean-cost") opts.maxMeanCost = Number(args[i + 1]);
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
  /** Excluded from the pass/fail gate — see ExpectedSupplier.blockedOnFixtureData. */
  blocked: boolean;
  notes: string[];
}

/**
 * Projected per-scan cost model — for tracking *relative* cost deltas across
 * refactors, not billing-grade precision. Per-stage figures are the documented
 * costs from CLAUDE.md (Gemini vision ≈ $0.0001/call, preprocess image-gen
 * ≈ $0.039, cold text scan ≈ $0.0015).
 */
const COST_USD = {
  // Re-derived 2026-08-26 against gemini-3.7-flash ($0.75/M in, $3.75/M out —
  // see PRICING in scripts/eval/model-benchmark.ts). The old 0.0015 was
  // calibrated on a cheaper model and understated real spend ~4x, which made
  // this CI gate blind to the very cost increase the model bump introduced.
  //   in : (19_722-char prompt + 2_600 chars of capped page content) / 4
  //        = ~5_580 tok -> $0.0042
  //   out: ~600 tok of structured JSON                              -> $0.0023
  // Re-derive whenever GOOGLE_AI_MODEL changes tier; a stale figure here is a
  // gate that passes while spend climbs.
  BASE_SCAN: 0.0064, // scrape + text verdict (always incurred)
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

  // Mirror production gating exactly. Production blocks supplier search on
  // not_a_product + insufficient_evidence (lib/services/supplier-match:69 and
  // app/api/analyze/route.ts:417) and routes collection_page to browse mode
  // instead — but it does NOT block `legit`, so a legit verdict really does
  // reach the matcher in production.
  //
  // This previously gated on `=== "dropship"`, which was stricter than the
  // pipeline it claims to model: legit fixtures never reached the scorer, so a
  // supplier false positive on a legit brand was structurally invisible to the
  // eval. Keep this predicate in sync with the two call sites above.
  const supplierSearchVerdict = prediction?.verdict ?? predictedVerdict;
  const verdictBlocksSupplier =
    supplierSearchVerdict === "not_a_product" ||
    supplierSearchVerdict === "insufficient_evidence" ||
    supplierSearchVerdict === "collection_page";
  const supplierSearchEnabled =
    !opts.skipSupplier && fixture.aliexpress !== undefined && !verdictBlocksSupplier;

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
    const confidenceFloor = fixture.truth.expectedSupplier.acceptLowConfidence
      ? 0
      : MATCH_CONFIDENCE_MIN;
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
      .filter(({ confidence }) => confidence.score >= confidenceFloor);

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
    // Supplier search was skipped (no aliexpress.json, skipSupplier flag, or a
    // blocking verdict). For collection_page/not_a_product/insufficient_evidence
    // the production system would never have run the search, so "no match found"
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

  const blocked = fixture.truth.expectedSupplier.blockedOnFixtureData === true;
  if (blocked && !supplierMatch) {
    notes.push("blocked on fixture data — excluded from pass/fail gate");
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
    blocked,
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

/** Prints the cost projection and returns true if the mean breached the budget. */
function printCostProjection(
  outcomes: FixtureOutcome[],
  budget: number,
  enforce: boolean,
): boolean {
  console.log("\n=== Projected Cost / Scan (relative tracking — see COST_USD) ===\n");
  const costs = outcomes.map((o) => o.estimatedCostUsd).sort((a, b) => a - b);
  const total = costs.reduce((s, c) => s + c, 0);
  const mean = total / costs.length;
  const median = costs[Math.floor(costs.length / 2)];
  const max = costs[costs.length - 1];
  const fmt = (n: number) => `$${n.toFixed(4)}`;
  console.log(`mean=${fmt(mean)}  median=${fmt(median)}  max=${fmt(max)}  total(${costs.length} scans)=${fmt(total)}`);
  console.log("(estimate: assumes PREPROCESS off; image stages only on dropship+image)");
  const breached = mean > budget;
  const verb = enforce ? "ENFORCED" : "advisory";
  console.log(
    `budget mean ≤ ${fmt(budget)} [${verb}]: ${breached ? "✗ OVER BUDGET" : "✓ within budget"}`,
  );
  return breached;
}

/**
 * Tier-0 fingerprint precision report. The gate runs in production BEFORE the
 * AI verdict (lib/services/dropship-verdict), so a fire on a non-dropship
 * fixture is a real production false positive — it fails the run. Fires on
 * dropship fixtures are the win metric: each one is an AI call saved.
 * Verdict/supplier metrics above are unaffected (they replay the cached AI),
 * so results stay comparable with pre-Tier-0 baselines.
 */
function printTier0Report(fixtures: FixtureRecord[]): number {
  console.log("\n=== Tier-0 Fingerprint Gate (deterministic — target: 0 false fires) ===\n");
  let fired = 0;
  let elapsedTotal = 0;
  let maxElapsed = 0;
  const falseFires: string[] = [];

  for (const f of fixtures) {
    const res = runStoreFingerprint({
      attributes: f.scrape.attributes,
      markdown: f.scrape.raw.markdown,
      html: f.scrape.raw.html,
      storePriceUsd: f.scrape.detectedStorePriceUsd,
    });
    elapsedTotal += res.elapsedMs;
    maxElapsed = Math.max(maxElapsed, res.elapsedMs);
    if (!res.fired) continue;
    fired += 1;
    if (f.truth.expectedVerdict !== "dropship") {
      falseFires.push(`${f.id} [${f.truth.category}] — ${res.signals.join("; ")}`);
    }
  }

  console.log(`fired: ${fired}/${fixtures.length} fixtures (each fire = one AI verdict call saved)`);
  console.log(`latency: mean=${(elapsedTotal / fixtures.length).toFixed(2)}ms  max=${maxElapsed.toFixed(2)}ms`);
  console.log(`false fires (non-dropship truth): ${falseFires.length}`);
  falseFires.forEach((s) => console.log(`  ✗ ${s}`));
  if (falseFires.length === 0) console.log("✓ no false fires");
  return falseFires.length;
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

/**
 * Fixtures marked blockedOnFixtureData that are still failing don't count
 * toward the gate — but never disappear silently, so list them every run.
 */
function printBlockedFixtures(outcomes: FixtureOutcome[]): void {
  const excluded = outcomes.filter((o) => o.blocked && !o.supplierMatch);
  if (excluded.length === 0) return;

  console.log("\n=== Excluded From Gate (blocked on fixture data) ===\n");
  for (const o of excluded) {
    console.log(`  • ${o.id}`);
  }
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
  const tier0FalseFires = printTier0Report(fixtures);
  const costBreached = printCostProjection(outcomes, opts.maxMeanCost, opts.enforceCost);
  printFailures(outcomes);
  printSummary(outcomes);
  printBlockedFixtures(outcomes);

  const accuracyFailed = !outcomes.every(
    (o) => o.verdictMatch && (o.supplierMatch || o.blocked),
  );
  const exitCode =
    accuracyFailed || tier0FalseFires > 0 || (opts.enforceCost && costBreached) ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(99);
});
