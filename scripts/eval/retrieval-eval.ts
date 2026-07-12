/**
 * Retrieval eval — ROADMAP Phase 2 item 1 gate. Measures whether the ANN
 * vector-candidate arm (lib/aliexpress/find-supplier.ts's
 * findVectorCandidates()) would actually surface the right AliExpress
 * listing, BEFORE VECTOR_INDEX_ENABLED is ever flipped on anywhere.
 *
 * Self-contained by design: embeds each fixture's own captured
 * `aliexpress.json` candidate pool in-process and ranks by cosine distance,
 * rather than depending on whatever happens to be ingested into the live
 * ProductEmbedding table. That keeps this reproducible regardless of ingest
 * state, mirrors how run-fixtures.ts replays fixtures offline, and tests
 * the actual thing that matters: given a real captured candidate pool,
 * does embedding similarity rank the plausible-correct one highest?
 *
 * NOT wired into eval.yml / CI — this makes live Gemini embedding calls
 * (small cost, ~$0.00001-0.0001/call) and is meant to be run manually as a
 * one-time or periodic gate before enabling the flag, not on every PR.
 *
 * Usage:
 *   npm run eval:retrieval                # all eligible fixtures
 *   npm run eval:retrieval -- --limit 5    # cap embed calls for a quick check
 */

import { embedProductText } from "@/lib/index/embeddings";
import { loadAllFixtures } from "@/lib/eval/fixture-store";
import type { FixtureRecord } from "@/tests/eval/fixture-types";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";

// Recall bar for the "safe to enable" recommendation. This arm only ever
// ADDS candidates to a pool still gated by MATCH_CONFIDENCE_MIN downstream
// (see find-supplier.ts) — so even modest recall is net-positive, not a
// precision risk. This is deliberately lower than a hard verdict-path bar.
const RECOMMENDED_RECALL_BAR = 0.6;

function parseLimit(): number | null {
  const idx = process.argv.indexOf("--limit");
  if (idx === -1) return null;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 1; // treat degenerate vectors as unrelated
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Same query-text construction as find-supplier.ts's vectorQueryText, using
 * the fields available on a replayed fixture (cached AI prediction instead
 * of a live productCategory param).
 */
function buildQueryText(fixture: FixtureRecord): string {
  const effectiveTitle =
    fixture.scrape.attributes.translatedTitle ?? fixture.scrape.attributes.title;
  const category = fixture.aiResponse?.prediction?.productCategory ?? null;
  return [effectiveTitle, category]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" — ");
}

/**
 * Same "is this candidate plausible" check run-fixtures.ts uses for
 * supplierMatch: price-band match when the fixture's truth specifies one,
 * otherwise any candidate counts (no per-candidate-id ground truth exists
 * in these fixtures — see tests/eval/fixture-types.ts).
 */
function isPlausibleMatch(
  candidate: AliExpressProductCandidate,
  band: [number, number] | undefined,
): boolean {
  if (!band) return true;
  return candidate.priceUsd >= band[0] && candidate.priceUsd <= band[1];
}

interface FixtureResult {
  id: string;
  candidateCount: number;
  top1Hit: boolean;
  top3Hit: boolean;
  bestDistance: number;
}

async function evaluateFixture(
  fixture: FixtureRecord,
  embedCache: Map<string, number[] | null>,
): Promise<FixtureResult | null> {
  const candidates = fixture.aliexpress?.candidates ?? [];
  if (candidates.length === 0) return null;

  const queryText = buildQueryText(fixture);
  if (!queryText.trim()) return null;

  let queryEmbedding = embedCache.get(`q:${queryText}`);
  if (queryEmbedding === undefined) {
    queryEmbedding = await embedProductText(queryText);
    embedCache.set(`q:${queryText}`, queryEmbedding);
  }
  if (!queryEmbedding) return null;

  const ranked: { candidate: AliExpressProductCandidate; distance: number }[] = [];
  for (const candidate of candidates) {
    const key = `c:${candidate.title}`;
    let candEmbedding = embedCache.get(key);
    if (candEmbedding === undefined) {
      candEmbedding = await embedProductText(candidate.title);
      embedCache.set(key, candEmbedding);
    }
    if (!candEmbedding) continue;
    ranked.push({ candidate, distance: cosineDistance(queryEmbedding, candEmbedding) });
  }
  if (ranked.length === 0) return null;

  ranked.sort((a, b) => a.distance - b.distance);

  const band = fixture.truth.expectedSupplier.expectedPriceUsdBand;
  const top1Hit = isPlausibleMatch(ranked[0].candidate, band);
  const top3Hit = ranked.slice(0, 3).some((r) => isPlausibleMatch(r.candidate, band));

  return {
    id: fixture.id,
    candidateCount: ranked.length,
    top1Hit,
    top3Hit,
    bestDistance: ranked[0].distance,
  };
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const allFixtures = loadAllFixtures();

  // Only fixtures with a real, untainted ground-truth candidate pool:
  // shouldFindMatch (there's something to find), a captured aliexpress.json
  // (something to rank), and NOT one of the known-compromised fixtures —
  // blockedOnFixtureData means the pool itself is wrong-product/missing
  // (see run-fixtures.ts), and acceptLowConfidence means the true product
  // isn't on AliExpress at all (calmo-bath-bombs), so neither has a
  // meaningful "correct" candidate to test retrieval against.
  let eligible = allFixtures.filter(
    (f) =>
      f.truth.expectedSupplier.shouldFindMatch &&
      f.aliexpress &&
      f.aliexpress.candidates.length > 0 &&
      !f.truth.expectedSupplier.blockedOnFixtureData &&
      !f.truth.expectedSupplier.acceptLowConfidence,
  );
  if (limit) eligible = eligible.slice(0, limit);

  const skippedBlocked = allFixtures.filter(
    (f) =>
      f.truth.expectedSupplier.shouldFindMatch &&
      (f.truth.expectedSupplier.blockedOnFixtureData || f.truth.expectedSupplier.acceptLowConfidence),
  ).length;

  console.log(`Retrieval eval: ${eligible.length} eligible fixture(s)`);
  if (skippedBlocked > 0) {
    console.log(
      `(${skippedBlocked} fixture(s) skipped — blockedOnFixtureData/acceptLowConfidence, no clean ground truth)`,
    );
  }
  if (eligible.length === 0) {
    console.log("Nothing to evaluate — exiting.");
    return;
  }

  const embedCache = new Map<string, number[] | null>();
  const results: FixtureResult[] = [];
  let evaluated = 0;
  let skippedNoEmbed = 0;

  for (const fixture of eligible) {
    process.stdout.write(`  • ${fixture.id} …`);
    const result = await evaluateFixture(fixture, embedCache);
    if (!result) {
      process.stdout.write(" skipped (embed failed)\n");
      skippedNoEmbed += 1;
      continue;
    }
    process.stdout.write(
      ` top1=${result.top1Hit ? "✓" : "✗"} top3=${result.top3Hit ? "✓" : "✗"} (dist=${result.bestDistance.toFixed(3)}, ${result.candidateCount} candidates)\n`,
    );
    results.push(result);
    evaluated += 1;
  }

  const embedCalls = embedCache.size;
  const top1Recall = results.length > 0 ? results.filter((r) => r.top1Hit).length / results.length : 0;
  const top3Recall = results.length > 0 ? results.filter((r) => r.top3Hit).length / results.length : 0;
  const meanBestDistance =
    results.length > 0 ? results.reduce((s, r) => s + r.bestDistance, 0) / results.length : 0;

  console.log("\n=== Summary ===\n");
  console.log(`fixtures evaluated: ${evaluated} (${skippedNoEmbed} skipped on embed failure)`);
  console.log(`embed calls made:   ${embedCalls}`);
  console.log(`top-1 recall:       ${(top1Recall * 100).toFixed(0)}%`);
  console.log(`top-3 recall:       ${(top3Recall * 100).toFixed(0)}%`);
  console.log(`mean best distance: ${meanBestDistance.toFixed(3)} (cosine, 0=identical, 2=opposite)`);

  console.log("\n=== Recommendation ===\n");
  if (evaluated < 10) {
    console.log(
      `⚠ Only ${evaluated} fixture(s) evaluated — too small a sample to recommend enabling.`,
    );
    console.log(
      "  Grow the corpus (npm run eval:capture) or ingest more live scans before deciding.",
    );
  } else if (top3Recall >= RECOMMENDED_RECALL_BAR) {
    console.log(
      `✓ top-3 recall ${(top3Recall * 100).toFixed(0)}% >= ${(RECOMMENDED_RECALL_BAR * 100).toFixed(0)}% bar — safe to enable VECTOR_INDEX_ENABLED.`,
    );
    console.log(
      "  Remember this arm only adds candidates to a pool still gated by MATCH_CONFIDENCE_MIN.",
    );
  } else {
    console.log(
      `✗ top-3 recall ${(top3Recall * 100).toFixed(0)}% < ${(RECOMMENDED_RECALL_BAR * 100).toFixed(0)}% bar — do not enable yet.`,
    );
    console.log("  Check query-text construction and embedding model choice before retrying.");
  }
}

main().catch((err) => {
  console.error("[retrieval-eval] fatal:", err);
  process.exit(1);
});
