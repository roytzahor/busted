/**
 * Refresh a captured fixture's AI verdict and/or AliExpress search results
 * WITHOUT re-scraping. Useful after a prompt change or a keyword-extraction
 * fix — re-runs only the cheap downstream stages against the cached scrape.
 *
 * Usage:
 *   npx tsx scripts/eval/refresh-fixture.ts <fixture-id> [--ai] [--aliexpress]
 *   npx tsx scripts/eval/refresh-fixture.ts --all-real [--ai] [--aliexpress]
 *
 * Defaults to refreshing BOTH ai and aliexpress when no flag is given.
 *
 * Writes back to:
 *   tests/fixtures/products/<id>/ai-response.json
 *   tests/fixtures/products/<id>/aliexpress.json
 *
 * Never touches truth.json or scrape.json.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { verifyDropshipLikelihood } from "@/lib/ai/dropship-verifier";
import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
} from "@/lib/aliexpress/api-client";
import { searchAliExpressViaScrape } from "@/lib/aliexpress/search-scrape-fallback";
import { extractSearchKeywords } from "@/lib/aliexpress/keywords";
import { isNonLatinTitle, translateTitle } from "@/lib/ai/translate-title";
import { loadFixture } from "@/lib/eval/fixture-store";
import type {
  FixtureAiResponse,
  FixtureAliExpress,
} from "@/tests/eval/fixture-types";

const FIXTURES_ROOT = path.resolve(__dirname, "../../tests/fixtures/products");

function parseArgs(): { ids: string[]; doAi: boolean; doAli: boolean } {
  const args = process.argv.slice(2);
  let doAi = args.includes("--ai");
  let doAli = args.includes("--aliexpress");
  if (!doAi && !doAli) {
    // default: both
    doAi = true;
    doAli = true;
  }
  let ids: string[];
  if (args.includes("--all-real")) {
    ids = fs
      .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("real-"))
      .map((e) => e.name)
      .sort();
  } else {
    ids = args.filter((a) => !a.startsWith("--"));
  }
  if (ids.length === 0) {
    console.error(
      "Usage: npx tsx scripts/eval/refresh-fixture.ts <fixture-id...> [--ai] [--aliexpress]",
    );
    console.error("   or: npx tsx scripts/eval/refresh-fixture.ts --all-real [--ai] [--aliexpress]");
    process.exit(1);
  }
  return { ids, doAi, doAli };
}

function writeJson(filepath: string, data: unknown): void {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

async function refreshAi(id: string): Promise<{ ok: boolean; note: string }> {
  const fixture = loadFixture(id);
  if (!fixture) return { ok: false, note: "fixture not found" };
  try {
    const result = await verifyDropshipLikelihood({
      attributes: fixture.scrape.attributes,
      markdownExcerpt: fixture.scrape.raw.markdown,
      storePriceUsd: fixture.scrape.detectedStorePriceUsd,
    });
    const ai: FixtureAiResponse = {
      prediction: result.prediction,
      rawResponse: result.rawResponse,
      model: result.model,
      provider: result.provider,
      error: result.error,
    };
    writeJson(path.join(FIXTURES_ROOT, id, "ai-response.json"), ai);
    const v = result.prediction?.verdict ?? "?";
    const c = result.prediction?.confidence ?? 0;
    return { ok: true, note: `verdict=${v} conf=${(c * 100).toFixed(0)}%` };
  } catch (err) {
    return { ok: false, note: `AI threw: ${(err as Error).message}` };
  }
}

async function refreshAli(id: string): Promise<{ ok: boolean; note: string }> {
  const fixture = loadFixture(id);
  if (!fixture) return { ok: false, note: "fixture not found" };
  try {
    const rawTitle = fixture.scrape.attributes.title;
    let effectiveTitle = fixture.scrape.attributes.translatedTitle ?? rawTitle;
    // If cached translatedTitle is missing AND the raw title is non-Latin,
    // compute translation on-the-fly AND backfill it into scrape.json so that
    // computeMatchConfidence (which also uses translatedTitle for Jaccard) sees it.
    if (!fixture.scrape.attributes.translatedTitle && isNonLatinTitle(rawTitle)) {
      const fresh = await translateTitle(rawTitle);
      if (fresh) {
        effectiveTitle = fresh;
        const scrapePath = path.join(FIXTURES_ROOT, id, "scrape.json");
        const scrape = JSON.parse(fs.readFileSync(scrapePath, "utf-8")) as {
          attributes: { translatedTitle?: string | null };
        };
        scrape.attributes.translatedTitle = fresh;
        writeJson(scrapePath, scrape);
      }
    }
    const keywords = extractSearchKeywords(effectiveTitle);
    const provider: "aliexpress_api" | "firecrawl_scrape" = isAliExpressApiConfigured()
      ? "aliexpress_api"
      : "firecrawl_scrape";
    const candidates =
      provider === "aliexpress_api"
        ? await searchAliExpressProducts(keywords)
        : await searchAliExpressViaScrape(keywords);
    const ali: FixtureAliExpress = { keywords, provider, candidates };
    writeJson(path.join(FIXTURES_ROOT, id, "aliexpress.json"), ali);
    return { ok: true, note: `${candidates.length} candidates via ${provider} kw="${keywords}"` };
  } catch (err) {
    return { ok: false, note: `AliExpress threw: ${(err as Error).message}` };
  }
}

async function main(): Promise<void> {
  const { ids, doAi, doAli } = parseArgs();
  console.log(`[refresh] ${ids.length} fixture(s)  ai=${doAi}  aliexpress=${doAli}\n`);

  for (const id of ids) {
    process.stdout.write(`  • ${id}\n`);
    if (doAi) {
      const r = await refreshAi(id);
      console.log(`      AI         ${r.ok ? "✓" : "✗"}  ${r.note}`);
    }
    if (doAli) {
      const r = await refreshAli(id);
      console.log(`      AliExpress ${r.ok ? "✓" : "✗"}  ${r.note}`);
    }
  }
}

main().catch((err) => {
  console.error("[refresh] fatal:", err);
  process.exit(99);
});
