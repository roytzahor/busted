/**
 * Frontend performance gate.
 *
 * The eval workflow already guards AI *cost* (`--enforce-cost`). Nothing
 * guarded the shipped bundle, so page weight could drift upward one PR at a
 * time with no signal. DESIGN.md §9 sets LCP < 2.0s / CLS < 0.05 / INP < 200ms;
 * those need a real browser, but bundle bytes are the input we can measure
 * deterministically in CI, and they are what most regressions actually move.
 *
 * Measured from `.next` after a production build, NOT from build stdout —
 * Next's summary table is presentation and its format changes between minors.
 *
 * On a regression this prints the offending metric and how far over it is.
 * To land a deliberate increase, raise the budget in the same PR: the diff on
 * `scripts/ci/perf-budget.json` is the review surface, which is the point.
 *
 * Usage: tsx scripts/ci/check-bundle-budget.ts [--update]
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = ".next";
const BUDGET_PATH = "scripts/ci/perf-budget.json";

interface Budget {
  /** Total bytes of every emitted stylesheet. */
  cssBytes: number;
  /** Bytes of the JS every route loads before its own code (`rootMainFiles`). */
  sharedJsBytes: number;
  /** Bytes of the single heaviest route entry, first-load JS included. */
  heaviestRouteBytes: number;
  /** Fractional headroom before a metric fails, e.g. 0.05 = 5%. */
  tolerance: number;
}

function fileSize(relative: string): number {
  try {
    return statSync(join(NEXT_DIR, relative)).size;
  } catch {
    return 0;
  }
}

function measure() {
  const cssDir = join(NEXT_DIR, "static/css");
  let cssBytes = 0;
  try {
    for (const f of readdirSync(cssDir)) {
      if (f.endsWith(".css")) cssBytes += statSync(join(cssDir, f)).size;
    }
  } catch {
    throw new Error(`No ${cssDir}. Run \`npm run build\` first.`);
  }

  const buildManifest = JSON.parse(
    readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8"),
  ) as { rootMainFiles?: string[] };
  const shared = buildManifest.rootMainFiles ?? [];
  const sharedJsBytes = shared.reduce((n, f) => n + fileSize(f), 0);

  // Route weight is shared + that route's own chunks, de-duplicated: a chunk
  // listed for both is downloaded once, so counting it twice would inflate
  // every route and hide a real regression behind fake headroom.
  const appManifest = JSON.parse(
    readFileSync(join(NEXT_DIR, "app-build-manifest.json"), "utf8"),
  ) as { pages?: Record<string, string[]> };
  let heaviestRouteBytes = 0;
  let heaviestRoute = "(none)";
  for (const [route, files] of Object.entries(appManifest.pages ?? {})) {
    const unique = new Set([...shared, ...files]);
    let total = 0;
    for (const f of unique) total += fileSize(f);
    if (total > heaviestRouteBytes) {
      heaviestRouteBytes = total;
      heaviestRoute = route;
    }
  }

  return { cssBytes, sharedJsBytes, heaviestRouteBytes, heaviestRoute };
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`;
}

const actual = measure();

if (process.argv.includes("--update")) {
  const budget: Budget = {
    cssBytes: actual.cssBytes,
    sharedJsBytes: actual.sharedJsBytes,
    heaviestRouteBytes: actual.heaviestRouteBytes,
    tolerance: 0.05,
  };
  writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2) + "\n");
  console.log(`Budget written to ${BUDGET_PATH}:`);
  console.log(`  css            ${kb(budget.cssBytes)}`);
  console.log(`  shared js      ${kb(budget.sharedJsBytes)}`);
  console.log(`  heaviest route ${kb(budget.heaviestRouteBytes)} (${actual.heaviestRoute})`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as Budget;
const checks: Array<[keyof Omit<Budget, "tolerance">, number, number]> = [
  ["cssBytes", actual.cssBytes, budget.cssBytes],
  ["sharedJsBytes", actual.sharedJsBytes, budget.sharedJsBytes],
  ["heaviestRouteBytes", actual.heaviestRouteBytes, budget.heaviestRouteBytes],
];

const failures: string[] = [];
console.log("=== Bundle budget ===\n");
for (const [name, got, limit] of checks) {
  const ceiling = Math.round(limit * (1 + budget.tolerance));
  const delta = got - limit;
  const pct = limit === 0 ? 0 : (delta / limit) * 100;
  const over = got > ceiling;
  const sign = delta >= 0 ? "+" : "";
  console.log(
    `${over ? "FAIL" : "ok  "}  ${name.padEnd(20)} ${kb(got).padStart(10)}  ` +
      `budget ${kb(limit)} (+${(budget.tolerance * 100).toFixed(0)}% = ${kb(ceiling)})  ` +
      `${sign}${kb(delta)} / ${sign}${pct.toFixed(1)}%`,
  );
  if (over) failures.push(`${name}: ${kb(got)} exceeds ${kb(ceiling)}`);
}
console.log(`\nheaviest route: ${actual.heaviestRoute}`);

if (failures.length > 0) {
  console.error("\n=== Bundle budget exceeded ===");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nIf the increase is intended, re-baseline in this PR:\n" +
      "  npm run build && npm run perf:budget -- --update\n" +
      "The diff on perf-budget.json is the review surface.",
  );
  process.exit(1);
}
console.log("\nWithin budget.");
