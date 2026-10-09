import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toScrapeJson } from "@/lib/cache/persist-product";
import { loadFixture } from "@/lib/eval/fixture-store";
import { runStoreFingerprint } from "@/lib/tier0/store-fingerprint";
import { parseCachedScrapeData, type CachedScrapeData } from "@/lib/types/cache";

const repoRoot = resolve(__dirname, "..");

describe("structured price survives the cache", () => {
  // @spec 0003/AC-8
  it("round-trips through persist → parse, so a revisit shows the first scan's price", () => {
    const scrape: CachedScrapeData = {
      provider: "crawlbase",
      attributes: {
        title: "In Between Ring",
        description: "d",
        mainImageUrl: null,
        sourceUrl: "https://agasandtamar.com/he/product/in-between-ring-copy/",
        provider: "crawlbase",
      },
      detectedStorePriceUsd: 30,
      structuredStorePriceUsd: 843.76,
      structuredStorePriceNative: 3121.92,
      structuredStorePriceCurrency: "ILS",
      structuredStorePriceSource: "jsonld",
      storeName: "agasandtamar",
      markdownLength: 1,
      markdownPreview: "",
    };
    // Through JSON, as the database stores it.
    const back = parseCachedScrapeData(JSON.parse(JSON.stringify(toScrapeJson(scrape))))!;
    expect(back).toMatchObject({
      detectedStorePriceUsd: 30,
      structuredStorePriceUsd: 843.76,
      structuredStorePriceNative: 3121.92,
      structuredStorePriceCurrency: "ILS",
      structuredStorePriceSource: "jsonld",
    });
  });
});

describe("one owner for the shown store price", () => {
  const SOURCE = /\.(ts|tsx)$/;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : SOURCE.test(name) ? [p] : [];
    });

  // @spec 0003/AC-8
  it("has no ad-hoc `estimate ?? scraped` price fallback outside lib/analyze/store-price.ts", () => {
    const offenders = ["app", "lib", "components"]
      .flatMap((d) => walk(join(repoRoot, d)))
      .filter((p) => !p.endsWith(join("lib", "analyze", "store-price.ts")))
      .filter((p) => /(estimatedStorePriceUsd|detectedStorePriceUsd)\s*\?\?/.test(readFileSync(p, "utf8")))
      .map((p) => relative(repoRoot, p));
    expect(offenders).toEqual([]);
  });
});

describe("Tier-0 never invents prices", () => {
  // @spec 0003/AC-8
  it("fires without putting the regex price, a 25% supplier guess or a 300% markup into the prediction", () => {
    const f = loadFixture("synthetic-tier0-app-footprint-01")!;
    const r = runStoreFingerprint({
      attributes: f.scrape.attributes,
      markdown: f.scrape.raw.markdown,
      html: f.scrape.raw.html,
      storePriceUsd: f.scrape.detectedStorePriceUsd,
    });
    expect(r.fired).toBe(true);
    expect(f.scrape.detectedStorePriceUsd).not.toBeNull(); // the gate still had a price to count
    expect(r.prediction).toMatchObject({
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    });
  });
});
