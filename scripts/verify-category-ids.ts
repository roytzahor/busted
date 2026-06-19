/**
 * AliExpress category-ID verification job.
 *
 * For each entry in CATEGORY_MAP that has a `verificationProductId`, fetches
 * the product via `aliexpress.affiliate.productdetail.get` and asserts that
 * the returned `first_level_category_id` or `second_level_category_id`
 * appears in the entry's `categoryIds` array.
 *
 * A mismatch means AliExpress re-treed the subcategory. Update `categoryIds`
 * in `lib/aliexpress/category-map.ts` and re-run to confirm.
 *
 * Usage:
 *   npm run verify:categories            # standard run
 *   npm run verify:categories -- --verbose  # print full API response on fail
 *
 * Exits 0 when all probed entries pass (or all are skipped due to missing IDs).
 * Exits 1 when any entry fails — GitHub Actions will surface this as a failed job.
 *
 * Required env vars (loaded from .env by `tsx --env-file=.env`):
 *   ALIEXPRESS_APP_KEY
 *   ALIEXPRESS_APP_SECRET
 *   ALIEXPRESS_API_URL        (optional, defaults to api-sg.aliexpress.com)
 *   ALIEXPRESS_TRACKING_ID    (optional)
 *   ALIEXPRESS_SHIP_TO_COUNTRY (optional, defaults to US)
 */

import { createHash, createHmac } from "node:crypto";
import { CATEGORY_MAP } from "@/lib/aliexpress/category-map";

/* ─── Config ─────────────────────────────────────────────────────────────── */

const DEFAULT_API_URL = "https://api-sg.aliexpress.com/sync";

function getConfig() {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error(
      "ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET must be set.\n" +
      "Run: ALIEXPRESS_APP_KEY=xxx ALIEXPRESS_APP_SECRET=yyy npm run verify:categories",
    );
    process.exit(1);
  }
  return {
    appKey,
    appSecret,
    apiUrl: process.env.ALIEXPRESS_API_URL ?? DEFAULT_API_URL,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? "busted",
    shipToCountry: process.env.ALIEXPRESS_SHIP_TO_COUNTRY ?? "US",
  };
}

/* ─── Signing (mirrors lib/aliexpress/sign-request.ts) ───────────────────── */

function getShanghaiTimestamp(): string {
  return new Date()
    .toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}

function signRequest(
  params: Record<string, string>,
  secret: string,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const data = `${secret}${sorted}${secret}`;
  return createHmac("md5", secret).update(data).digest("hex").toUpperCase();
}

/* ─── API call ────────────────────────────────────────────────────────────── */

interface ProductDetailResponse {
  first_level_category_id?: number | string;
  second_level_category_id?: number | string;
  product_id?: number | string;
  product_title?: string;
}

async function fetchProductCategories(
  productId: string,
): Promise<ProductDetailResponse | null> {
  const config = getConfig();

  const params: Record<string, string> = {
    method: "aliexpress.affiliate.productdetail.get",
    app_key: config.appKey,
    sign_method: "md5",
    timestamp: getShanghaiTimestamp(),
    format: "json",
    v: "2.0",
    product_ids: productId,
    target_currency: "USD",
    target_language: "EN",
    tracking_id: config.trackingId,
    country: config.shipToCountry,
    fields: "product_id,product_title,first_level_category_id,second_level_category_id",
  };
  params.sign = signRequest(params, config.appSecret);

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const wrapper = json.aliexpress_affiliate_productdetail_get_response as
    | Record<string, unknown>
    | undefined;
  const respResult = wrapper?.resp_result as Record<string, unknown> | undefined;

  if (Number(respResult?.resp_code ?? 0) !== 200) {
    throw new Error(`AE error ${respResult?.resp_code}: ${respResult?.resp_msg}`);
  }

  const result = respResult?.result as Record<string, unknown> | undefined;
  const productsWrapper = result?.products as Record<string, unknown> | undefined;
  const rawProduct = productsWrapper?.product;
  const productList: unknown[] = Array.isArray(rawProduct)
    ? rawProduct
    : rawProduct != null
    ? [rawProduct]
    : [];

  const product = productList[0] as ProductDetailResponse | undefined;
  return product ?? null;
}

/* ─── Result types ────────────────────────────────────────────────────────── */

type VerifyStatus = "PASS" | "FAIL" | "SKIPPED" | "ERROR";

interface VerifyResult {
  vertical: string;
  probeId: string | null;
  status: VerifyStatus;
  returnedCategoryIds: string[];
  expectedCategoryIds: string[];
  error?: string;
}

/* ─── Core check ─────────────────────────────────────────────────────────── */

async function verifyEntry(
  vertical: string,
  verbose: boolean,
): Promise<VerifyResult> {
  const entry = CATEGORY_MAP[vertical];
  if (!entry) {
    return {
      vertical,
      probeId: null,
      status: "ERROR",
      returnedCategoryIds: [],
      expectedCategoryIds: [],
      error: "Entry not found in CATEGORY_MAP",
    };
  }

  if (!entry.verificationProductId) {
    return {
      vertical,
      probeId: null,
      status: "SKIPPED",
      returnedCategoryIds: [],
      expectedCategoryIds: entry.categoryIds,
    };
  }

  let product: ProductDetailResponse | null;
  try {
    product = await fetchProductCategories(entry.verificationProductId);
  } catch (err) {
    return {
      vertical,
      probeId: entry.verificationProductId,
      status: "ERROR",
      returnedCategoryIds: [],
      expectedCategoryIds: entry.categoryIds,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!product) {
    return {
      vertical,
      probeId: entry.verificationProductId,
      status: "ERROR",
      returnedCategoryIds: [],
      expectedCategoryIds: entry.categoryIds,
      error: `Product ${entry.verificationProductId} not found or delisted`,
    };
  }

  const returned = [
    product.first_level_category_id?.toString(),
    product.second_level_category_id?.toString(),
  ].filter((id): id is string => id != null && id !== "0");

  const anyMatch = returned.some((id) => entry.categoryIds.includes(id));

  if (verbose && !anyMatch) {
    console.log(`  [verbose] ${vertical}: returned=${returned.join(",")} expected=${entry.categoryIds.join(",")}`);
  }

  return {
    vertical,
    probeId: entry.verificationProductId,
    status: anyMatch ? "PASS" : "FAIL",
    returnedCategoryIds: returned,
    expectedCategoryIds: entry.categoryIds,
  };
}

/* ─── Formatting ──────────────────────────────────────────────────────────── */

const ICONS: Record<VerifyStatus, string> = {
  PASS: "✓",
  FAIL: "✗",
  SKIPPED: "–",
  ERROR: "!",
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printResults(results: VerifyResult[]): void {
  const colV = Math.max(8, ...results.map((r) => r.vertical.length)) + 2;

  console.log(
    "\n" +
    pad("Vertical", colV) +
    pad("Status", 10) +
    pad("Probe ID", 22) +
    "Returned category IDs",
  );
  console.log("-".repeat(colV + 10 + 22 + 30));

  for (const r of results) {
    const icon = ICONS[r.status];
    const returned = r.returnedCategoryIds.length > 0
      ? r.returnedCategoryIds.join(", ")
      : r.error ?? "(none)";
    console.log(
      pad(r.vertical, colV) +
      pad(`${icon} ${r.status}`, 10) +
      pad(r.probeId ?? "(none)", 22) +
      returned,
    );
  }
  console.log();
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");
  const verticals = Object.keys(CATEGORY_MAP);

  console.log(`\nBusted — AliExpress category-ID verification`);
  console.log(`Checking ${verticals.length} verticals against live AE API…\n`);

  const results: VerifyResult[] = [];
  for (const vertical of verticals) {
    process.stdout.write(`  Probing: ${vertical}… `);
    const result = await verifyEntry(vertical, verbose);
    process.stdout.write(`${ICONS[result.status]} ${result.status}\n`);
    results.push(result);
    // Avoid rate-limit on the affiliate API
    await new Promise((r) => setTimeout(r, 300));
  }

  printResults(results);

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;

  console.log(`Summary: ${passed} passed · ${failed} failed · ${errored} errored · ${skipped} skipped`);

  if (skipped > 0) {
    console.log(
      `\nNote: ${skipped} vertical(s) have no verificationProductId set.` +
      " Add a stable factory listing product ID to each CATEGORY_MAP entry" +
      " so they're covered in future runs.",
    );
  }

  if (failed > 0) {
    console.log(
      "\n⚠ FAIL: AliExpress returned category IDs that are not in our CATEGORY_MAP." +
      " This usually means AE re-treed the subcategory." +
      "\nAction: update categoryIds in lib/aliexpress/category-map.ts to include" +
      " the returned IDs, re-verify, then commit.",
    );
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(
        `  ${r.vertical}: returned [${r.returnedCategoryIds.join(", ")}]` +
        ` but categoryIds is [${r.expectedCategoryIds.join(", ")}]`,
      );
    }
  }

  if (errored > 0) {
    console.log(`\n⚠ ERROR: ${errored} vertical(s) could not be checked (API or network failure).`);
    for (const r of results.filter((r) => r.status === "ERROR")) {
      console.log(`  ${r.vertical}: ${r.error}`);
    }
  }

  process.exit(failed > 0 || errored > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("verify-category-ids: unexpected error:", err);
  process.exit(1);
});
