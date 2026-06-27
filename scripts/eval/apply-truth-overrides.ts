/**
 * After eval:capture writes auto-stubbed truth.json files, this script
 * overwrites each with the hand-curated version from /tmp/truth-overrides.json.
 *
 * Usage: npx tsx scripts/eval/apply-truth-overrides.ts [overrides-path]
 */
import * as fs from "node:fs";
import * as path from "node:path";

const overridesPath = process.argv[2] ?? "/tmp/truth-overrides.json";
const fixturesRoot = path.resolve(__dirname, "../../tests/fixtures/products");

const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf-8")) as Record<
  string,
  {
    expectedVerdict: "dropship" | "legit" | "insufficient_evidence" | "not_a_product";
    confidenceMin?: number;
    confidenceMax?: number;
    shouldFindMatch: boolean;
    expectedPriceUsdBand?: [number, number];
    notes?: string;
  }
>;

let applied = 0;
let skipped = 0;
for (const [id, override] of Object.entries(overrides)) {
  const truthPath = path.join(fixturesRoot, id, "truth.json");
  if (!fs.existsSync(truthPath)) {
    console.log(`[skip] ${id} — no truth.json found (capture may have failed)`);
    skipped += 1;
    continue;
  }
  const existing = JSON.parse(fs.readFileSync(truthPath, "utf-8"));
  const merged = {
    ...existing,
    expectedVerdict: override.expectedVerdict,
    expectedSupplier: {
      shouldFindMatch: override.shouldFindMatch,
      ...(override.expectedPriceUsdBand
        ? { expectedPriceUsdBand: override.expectedPriceUsdBand }
        : {}),
      ...(override.notes ? { notes: override.notes } : {}),
    },
    ...(override.confidenceMin !== undefined ? { confidenceMin: override.confidenceMin } : {}),
    ...(override.confidenceMax !== undefined ? { confidenceMax: override.confidenceMax } : {}),
    ...(override.notes ? { notes: override.notes } : {}),
  };
  fs.writeFileSync(truthPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`[ok]   ${id} → verdict=${override.expectedVerdict}, supplier=${override.shouldFindMatch}`);
  applied += 1;
}
console.log(`\nApplied ${applied}, skipped ${skipped} (no fixture present).`);
