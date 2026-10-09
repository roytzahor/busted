/**
 * npm run eval:price — score every store-price source against hand-labelled
 * truth (spec 0003). Offline: reads fixtures only, no API spend, no .env.
 *
 * Sources are RE-DERIVED from the captured page (raw.markdown / raw.html), not
 * read from the stored detectedStorePriceUsd — the replay eval cannot see an
 * extractor change by construction (lessons 2026-07-25).
 *
 *   structured  extractStructuredPrice(raw.html)        — og:price / JSON-LD
 *   regex       detectPriceInMarkdown(raw.markdown)
 *   ai          cached ai-response estimatedStorePriceUsd
 *   old         ai ?? regex            — pre-0003 rule (= kill switch off)
 *   new         structured ?? ai       — what ships (resolveStorePriceUsd)
 *
 * Exits 1 when `new` has fewer correct prices than `old`, or turns any
 * fixture `old` priced correctly into a wrong or false price.
 */
import { loadAllFixtures } from "@/lib/eval/fixture-store";
import { emptyTally, scorePrice, type PriceOutcome, type PriceTally } from "@/lib/eval/price-score";
import { resolveStorePriceUsd } from "@/lib/analyze/store-price";
import { detectPriceInMarkdown } from "@/lib/scraping/extract-price";
import { extractStructuredPrice } from "@/lib/scraping/extract-structured-price";

const SOURCES = ["structured", "regex", "ai", "old", "new"] as const;
type Source = (typeof SOURCES)[number];

const tallies = Object.fromEntries(SOURCES.map((s) => [s, emptyTally()])) as Record<Source, PriceTally>;
const regressions: string[] = [];
const unlabelled: string[] = [];
const rows: string[] = [];

const fmt = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const mark: Record<PriceOutcome, string> = { correct: "✓", wrong: "✗", false_price: "⚠", missed: "·" };

for (const f of loadAllFixtures()) {
  const truth = f.truth.expectedStorePrice;
  if (truth === undefined) {
    if (f.truth.expectedStorePriceUnlabelled) unlabelled.push(`${f.id}: ${f.truth.expectedStorePriceUnlabelled}`);
    continue;
  }
  const html = f.scrape.raw?.html;
  const markdown = f.scrape.raw?.markdown ?? "";
  const structured = extractStructuredPrice(html)?.amountUsd ?? null;
  const regex = detectPriceInMarkdown(markdown)?.amountUsd ?? null;
  const ai = f.aiResponse?.prediction?.estimatedStorePriceUsd ?? null;
  // `old` is the kill-switch-off path, which is exactly the pre-0003 rule.
  const old = resolveStorePriceUsd({ aiEstimateUsd: ai, regexUsd: regex }, false);
  const next = resolveStorePriceUsd({ structuredUsd: structured, aiEstimateUsd: ai, regexUsd: regex }, true);
  const values: Record<Source, number | null> = { structured, regex, ai, old, new: next };
  const outcomes = Object.fromEntries(
    SOURCES.map((s) => [s, scorePrice(truth, values[s])]),
  ) as Record<Source, PriceOutcome>;
  for (const s of SOURCES) tallies[s][outcomes[s]]++;
  if (outcomes.old === "correct" && outcomes.new !== "correct") {
    regressions.push(`${f.id}: old ${fmt(old)} was correct, new ${fmt(next)} is ${outcomes.new}`);
  }
  const truthText = truth === null ? "no single price" : `${truth.amount} ${truth.currency}`;
  rows.push(
    `${f.id.padEnd(36)} ${truthText.padEnd(16)} ` +
      SOURCES.map((s) => `${mark[outcomes[s]]} ${fmt(values[s]).padEnd(9)}`).join(" "),
  );
}

console.log(`=== Store price vs hand-labelled truth (spec 0003) ===\n`);
console.log(`${"fixture".padEnd(36)} ${"truth".padEnd(16)} ${SOURCES.map((s) => `  ${s.padEnd(9)}`).join(" ")}`);
for (const r of rows) console.log(r);
console.log(`\n✓ correct  ✗ wrong product price  ⚠ price on a no-price page  · missed\n`);
console.log(`${"source".padEnd(12)} correct  wrong  false_price  missed`);
for (const s of SOURCES) {
  const t = tallies[s];
  console.log(
    `${s.padEnd(12)} ${String(t.correct).padStart(7)}  ${String(t.wrong).padStart(5)}  ${String(t.false_price).padStart(11)}  ${String(t.missed).padStart(6)}`,
  );
}
if (unlabelled.length) {
  console.log(`\nunlabelled (excluded):`);
  for (const u of unlabelled) console.log(`  - ${u}`);
}

const failed = tallies.new.correct < tallies.old.correct || regressions.length > 0;
if (regressions.length) {
  console.log(`\nregressions:`);
  for (const r of regressions) console.log(`  ✗ ${r}`);
}
console.log(
  `\n${failed ? "✗ FAIL" : "✓ PASS"} — new ${tallies.new.correct}/${rows.length} correct vs old ${tallies.old.correct}/${rows.length}`,
);
process.exit(failed ? 1 : 0);
