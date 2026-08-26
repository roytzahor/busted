/**
 * Match-arm headroom report — offline, $0, no network.
 *
 *   npm run eval:match-headroom
 *
 * `npm run eval` answers "did we find the right supplier?" as a pass/fail.
 * It does not show HOW MUCH ROOM was left, so a fixture passing at 0.406 and
 * one passing at 0.900 look identical — and a metric change that quietly moves
 * everything toward the bar shows up only once fixtures start failing.
 *
 * This report scores every candidate with the real computeMatchConfidence()
 * (same store-price source and matchTerms as find-supplier) and prints where
 * the winner landed relative to MATCH_CONFIDENCE_MIN, plus how much of that
 * score came from title overlap rather than price/trust.
 *
 * Read it split by REAL vs SYNTHETIC. Synthetic fixtures are authored with
 * candidate titles that echo the scraped title, so they score far higher than
 * production traffic — the real rows are the ones that reflect reality.
 *
 * Exits 0 always: this is a diagnostic, not a gate.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MATCH_CONFIDENCE_MIN,
  computeMatchConfidence,
} from "@/lib/aliexpress/match-confidence";

const FIXTURE_ROOT = "tests/fixtures/products";

/** Title's weight in the text-only score — see computeMatchConfidence(). */
const TITLE_WEIGHT = 0.55;

/** A pass this close to the bar is one scrape change away from failing. */
const THIN_MARGIN = 0.1;

/** Below this, the text arm contributed almost nothing to the decision. */
const BLIND_TITLE_OVERLAP = 0.2;

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Verdicts that stop a scan before the supplier matcher in production
 * (lib/services/supplier-match:69, app/api/analyze/route.ts:417 —
 * collection_page goes to browse mode instead). Scores for these fixtures are
 * reported but never counted as false positives: production never asks the
 * matcher about them. `legit` is deliberately absent — it DOES reach the
 * matcher.
 */
const VERDICTS_BLOCKING_SUPPLIER = new Set([
  "not_a_product",
  "insufficient_evidence",
  "collection_page",
]);

interface Row {
  id: string;
  isReal: boolean;
  shouldMatch: boolean;
  score: number;
  titleOverlap: number;
  priceVerdict: string;
  margin: number;
  titleShare: number;
  passes: boolean;
  /** Cached AI verdict, or null when there is no prediction. */
  verdict: string | null;
  /** True when that verdict stops the scan before the matcher runs. */
  blockedByVerdict: boolean;
}

function collect(): Row[] {
  const rows: Row[] = [];

  for (const id of readdirSync(FIXTURE_ROOT).sort()) {
    const dir = join(FIXTURE_ROOT, id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ali = readJson(join(dir, "aliexpress.json")) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrape = readJson(join(dir, "scrape.json")) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const truth = readJson(join(dir, "truth.json")) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ai = readJson(join(dir, "ai-response.json")) as any;
    if (!ali?.candidates?.length || !scrape || !truth) continue;

    const attributes = scrape.attributes ?? scrape;
    const storePriceUsd = scrape.detectedStorePriceUsd ?? null;
    const prediction = ai?.prediction ?? null;

    // Mirror find-supplier: fold the AI's productCategory + keywords into the
    // token set so brand-slug titles ("Bleesse") can overlap at all.
    const matchTerms = prediction
      ? [prediction.productCategory, ...(prediction.aliexpressKeywords ?? [])]
          .filter(
            (s: unknown): s is string =>
              typeof s === "string" && s.trim().length > 0,
          )
          .join(" ")
      : undefined;

    let best: ReturnType<typeof computeMatchConfidence> | null = null;
    for (const candidate of ali.candidates) {
      const mc = computeMatchConfidence(
        attributes,
        storePriceUsd,
        candidate,
        matchTerms,
      );
      if (!best || mc.score > best.score) best = mc;
    }
    if (!best) continue;

    const verdict: string | null = prediction?.verdict ?? null;

    rows.push({
      id,
      isReal: id.startsWith("real-"),
      shouldMatch: truth.expectedSupplier?.shouldFindMatch === true,
      score: best.score,
      titleOverlap: best.titleOverlap,
      priceVerdict: best.priceVerdict,
      margin: best.score - MATCH_CONFIDENCE_MIN,
      titleShare:
        best.score > 0 ? (best.titleOverlap * TITLE_WEIGHT) / best.score : 0,
      passes: best.score >= MATCH_CONFIDENCE_MIN,
      verdict,
      blockedByVerdict: verdict !== null && VERDICTS_BLOCKING_SUPPLIER.has(verdict),
    });
  }

  return rows;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function printGroup(label: string, rows: Row[]): void {
  if (rows.length === 0) return;
  console.log(`\n--- ${label} (${rows.length}) ---`);
  console.log("score  margin  titleOv  title%  price             fixture");
  for (const r of [...rows].sort((a, b) => a.score - b.score)) {
    const margin = `${r.margin >= 0 ? "+" : ""}${r.margin.toFixed(3)}`;
    console.log(
      `${r.score.toFixed(3)}  ${margin.padStart(6)}  ${r.titleOverlap.toFixed(3)}` +
        `    ${(r.titleShare * 100).toFixed(0).padStart(3)}%  ` +
        `${r.priceVerdict.padEnd(16)}  ${r.passes ? "✓" : "✗"} ${r.id}`,
    );
  }
}

function main(): void {
  const rows = collect();
  if (rows.length === 0) {
    console.log("No fixtures with candidates found — nothing to report.");
    return;
  }

  const shouldMatch = rows.filter((r) => r.shouldMatch);
  const shouldNot = rows.filter((r) => !r.shouldMatch);

  console.log(`\n=== Match-arm headroom (MATCH_CONFIDENCE_MIN = ${MATCH_CONFIDENCE_MIN}) ===`);
  console.log(
    `${rows.length} fixtures with candidates · ${shouldMatch.length} expect a match · ${shouldNot.length} expect none`,
  );

  console.log("\n### Expect a match — how much room above the bar?");
  printGroup("REAL pages", shouldMatch.filter((r) => r.isReal));
  printGroup("SYNTHETIC pages", shouldMatch.filter((r) => !r.isReal));

  if (shouldNot.length > 0) {
    console.log("\n### Expect NO match — how much room BELOW the bar?");
    printGroup("all", shouldNot);
  }

  const real = shouldMatch.filter((r) => r.isReal);
  const synth = shouldMatch.filter((r) => !r.isReal);

  console.log("\n=== Summary ===");
  console.log(
    `expect-a-match clearing the bar: ${shouldMatch.filter((r) => r.passes).length}/${shouldMatch.length}` +
      `   (real ${real.filter((r) => r.passes).length}/${real.length}, synthetic ${synth.filter((r) => r.passes).length}/${synth.length})`,
  );
  console.log(
    `mean titleOverlap:               real ${mean(real.map((r) => r.titleOverlap)).toFixed(3)}` +
      `   synthetic ${mean(synth.map((r) => r.titleOverlap)).toFixed(3)}`,
  );
  console.log(
    `passing by a thin margin <${THIN_MARGIN}:   ${shouldMatch.filter((r) => r.passes && r.margin < THIN_MARGIN).length}`,
  );
  console.log(
    `winner titleOverlap < ${BLIND_TITLE_OVERLAP}:      ${shouldMatch.filter((r) => r.titleOverlap < BLIND_TITLE_OVERLAP).length}  (text arm nearly blind)`,
  );
  console.log(
    `no store price detected:         ${shouldMatch.filter((r) => r.priceVerdict === "unknown").length}  (price arm inert)`,
  );

  // Only fixtures the matcher actually sees in production can be false
  // positives. A collection_page/not_a_product/insufficient_evidence fixture
  // may score high here and still be perfectly safe, because the verdict gate
  // stops it upstream.
  const reachable = shouldNot.filter((r) => !r.blockedByVerdict);
  const falsePositives = reachable.filter((r) => r.passes);
  if (falsePositives.length > 0) {
    console.log(
      `\n⚠ ${falsePositives.length} expect-NO-match fixture(s) reach the matcher AND clear the bar:`,
    );
    for (const r of falsePositives) {
      console.log(`    ${r.id}  score=${r.score.toFixed(3)}  verdict=${r.verdict ?? "none"}`);
    }
  } else {
    console.log(`\nNo supplier false positives among the ${reachable.length} expect-NO-match fixture(s) that reach the matcher.`);
  }

  const shielded = shouldNot.filter((r) => r.blockedByVerdict && r.passes);
  if (shielded.length > 0) {
    console.log(
      `\nLatent (scores above the bar but the verdict gate blocks it upstream —\n` +
        `would become a false positive if that verdict ever changed):`,
    );
    for (const r of shielded) {
      console.log(`    ${r.id}  score=${r.score.toFixed(3)}  verdict=${r.verdict ?? "none"}`);
    }
  }

  if (real.length > 0 && synth.length > 0) {
    const gap =
      mean(synth.map((r) => r.titleOverlap)) - mean(real.map((r) => r.titleOverlap));
    if (gap > 0.2) {
      console.log(
        `\nNote: synthetic titleOverlap runs ${gap.toFixed(3)} higher than real. Synthetic\n` +
          `fixtures echo the scraped title by construction, so aggregate supplier\n` +
          `accuracy is optimistic — weight the REAL rows when tuning thresholds.`,
      );
    }
  }
}

main();
