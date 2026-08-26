/**
 * Model benchmark — accuracy + measured cost per run.
 *
 * Answers three questions the existing eval cannot:
 *   1. Which model ACTUALLY served the request (a `-latest` alias hides this).
 *   2. What a scan really costs, from billed token counts — not the per-call
 *      guesses in lib/monitoring/cost-model.ts.
 *   3. Whether a model swap moved verdict accuracy on the REAL fixtures.
 *
 * This always calls the live API. `--skip-ai` does not exist here on purpose:
 * replaying cached ai-response.json measures the clamps, not the model.
 *
 *   npx tsx --env-file=.env scripts/eval/model-benchmark.ts
 *   npx tsx --env-file=.env scripts/eval/model-benchmark.ts --model gemini-3.5-flash
 *   npx tsx --env-file=.env scripts/eval/model-benchmark.ts --repeat 3   # variance
 */
import { loadAllFixtures } from "../../lib/eval/fixture-store";
import { verifyDropshipLikelihood } from "../../lib/ai/dropship-verifier";

/**
 * USD per 1M tokens. Thinking tokens bill at the OUTPUT rate.
 * Verify against ai.google.dev/gemini-api/docs/pricing before trusting a
 * dollar figure — these rot, and a stale table produces confident wrong costs.
 */
const PRICING: Record<
  string,
  { in: number; out: number; after2027?: { in: number; out: number } }
> = {
  // Verified against ai.google.dev/gemini-api/docs/pricing on 2026-08-26.
  // Gemini 3.x flash prices are PROMOTIONAL through 2026-12-31 and DOUBLE on
  // 2027-01-01 — the `after2027` column is the post-promo rate. Re-verify
  // before trusting any dollar figure; the previous table understated real
  // spend by 1.5-2.5x, which is exactly the failure this comment warns about.
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-3-flash-preview": { in: 0.5, out: 3.0 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-3.1-pro-preview": { in: 2.0, out: 12.0 },
  "gemini-3.5-flash": { in: 1.5, out: 9.0 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75, after2027: { in: 1.5, out: 7.5 } },
  "gemini-3.7-flash": { in: 0.75, out: 3.75, after2027: { in: 1.5, out: 7.5 } },
};

interface Row {
  id: string;
  expected: string;
  got: string;
  ok: boolean;
  confidence: number;
  inTok: number;
  outTok: number;
  thoughtTok: number;
  usd: number;
  ms: number;
  resolved: string;
  error: string | null;
}

/**
 * The `after2027` column existed but was never read, so on 2027-01-01 this
 * would have reported half the real cost — the exact failure the PRICING
 * comment warns about, in the tool used to gate model changes.
 */
function costUsd(model: string, inTok: number, outTok: number, thoughtTok: number) {
  const entry = PRICING[model];
  if (!entry) return null;
  const promoOver = Date.now() >= Date.UTC(2027, 0, 1);
  const p = promoOver && entry.after2027 ? entry.after2027 : entry;
  return (inTok * p.in + (outTok + thoughtTok) * p.out) / 1_000_000;
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const override = arg("--model");
  if (override) process.env.GOOGLE_AI_MODEL = override;
  // Unvalidated, `--repeat` with a missing or non-numeric value yields NaN and
  // the run reports `NaN%` accuracy, `undefinedms` latency and `$NaN` cost
  // rather than failing — silently useless output from the model-change gate.
  const repeatRaw = arg("--repeat") ?? "1";
  const repeat = Number(repeatRaw);
  if (!Number.isInteger(repeat) || repeat < 1) {
    console.error(`--repeat must be a positive integer, got: ${repeatRaw}`);
    process.exit(1);
  }
  const requested = process.env.GOOGLE_AI_MODEL ?? "(module default)";

  const all = await loadAllFixtures();
  // Real captured pages only. Synthetic fixtures author both the AI response
  // and the truth, so their accuracy is tautological and would inflate this.
  const fixtures = all.filter((f) => f.id.startsWith("real-"));

  console.log(`\nMODEL BENCHMARK`);
  console.log(`requested : ${requested}`);
  console.log(`fixtures  : ${fixtures.length} real  ×${repeat} pass(es)\n`);

  const rows: Row[] = [];
  for (let pass = 0; pass < repeat; pass++) {
    for (const f of fixtures) {
      const t0 = Date.now();
      let r: Row = {
        id: f.id, expected: f.truth.expectedVerdict, got: "-", ok: false,
        confidence: 0, inTok: 0, outTok: 0, thoughtTok: 0, usd: 0,
        ms: 0, resolved: "?", error: null,
      };
      try {
        const res = await verifyDropshipLikelihood({
          attributes: f.scrape.attributes,
          markdownExcerpt: f.scrape.raw.markdown,
          storePriceUsd: f.scrape.detectedStorePriceUsd,
        });
        const u = res.usage;
        r.resolved = res.resolvedModel ?? res.model;
        r.inTok = u?.inputTokens ?? 0;
        r.outTok = u?.outputTokens ?? 0;
        r.thoughtTok = u?.thoughtTokens ?? 0;
        r.usd = costUsd(r.resolved, r.inTok, r.outTok, r.thoughtTok) ?? 0;
        r.got = res.prediction?.verdict ?? "ERROR";
        r.confidence = res.prediction?.confidence ?? 0;
        r.error = res.error;
      } catch (e) {
        r.error = (e as Error).message;
        r.got = "THREW";
      }
      r.ms = Date.now() - t0;
      r.ok = r.got === r.expected;
      rows.push(r);
      console.log(
        `  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(36)} ${r.expected.padEnd(22)}-> ${r.got.padEnd(22)}` +
        ` ${String(r.inTok).padStart(6)}in ${String(r.outTok).padStart(5)}out ${String(r.thoughtTok).padStart(5)}think` +
        ` $${r.usd.toFixed(6)} ${String(r.ms).padStart(6)}ms`,
      );
      if (r.error) console.log(`        error: ${r.error}`);
    }
  }

  const n = rows.length;
  const pass = rows.filter((r) => r.ok).length;
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const resolvedSet = [...new Set(rows.map((r) => r.resolved))];
  const priced = resolvedSet.every((m) => PRICING[m]);
  const avgUsd = sum("usd") / n;
  const lat = rows.map((r) => r.ms).sort((a, b) => a - b);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`RESOLVED MODEL   ${resolvedSet.join(", ")}${priced ? "" : "  <-- NO PRICING ENTRY, costs below are wrong"}`);
  console.log(`VERDICT ACCURACY ${pass}/${n} = ${((pass / n) * 100).toFixed(1)}%`);
  console.log(`LATENCY          p50 ${lat[Math.floor(n * 0.5)]}ms  p95 ${lat[Math.floor(n * 0.95)]}ms`);
  console.log(`TOKENS / verdict in ${(sum("inTok") / n).toFixed(0)}  out ${(sum("outTok") / n).toFixed(0)}  think ${(sum("thoughtTok") / n).toFixed(0)}`);
  console.log(`COST / verdict   $${avgUsd.toFixed(6)}`);
  console.log(`COST / 1k scans  $${(avgUsd * 1000).toFixed(3)}   (verdict call only — excludes identify/image/scrape)`);

  const byVerdict = new Map<string, { n: number; ok: number }>();
  for (const r of rows) {
    const e = byVerdict.get(r.expected) ?? { n: 0, ok: 0 };
    e.n++; if (r.ok) e.ok++;
    byVerdict.set(r.expected, e);
  }
  console.log(`\nPER EXPECTED VERDICT`);
  for (const [v, e] of byVerdict) console.log(`  ${v.padEnd(24)} ${e.ok}/${e.n}`);

  const fails = rows.filter((r) => !r.ok);
  if (fails.length) {
    console.log(`\nREGRESSIONS`);
    for (const f of fails) console.log(`  ${f.id.padEnd(36)} want ${f.expected} got ${f.got} (conf ${f.confidence.toFixed(2)})`);
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
