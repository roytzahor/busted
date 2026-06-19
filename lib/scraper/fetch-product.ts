/**
 * Dual-arm product page fetcher optimised for Shopify targets on Vercel Serverless.
 *
 * Primary arm  — Crawlbase (JS-rendered HTML, deterministic variant extraction)
 * Fallback arm — Firecrawl (markdown + HTML, existing pipeline)
 *
 * Callers get a normalised `FetchProductResult` regardless of which arm succeeded,
 * and a rich `ProductVariant[]` when the primary arm's HTML is available.
 */

import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";
import { extractJsonLd } from "@/lib/scraping/extract-jsonld";
import { getCachedPage, savePageAsync } from "@/lib/scraper/page-cache";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CRAWLBASE_API_URL = "https://api.crawlbase.com/";
const DEFAULT_TIMEOUT_MS = 30_000;

/* ─── Public types ───────────────────────────────────────────────────────── */

/**
 * A single product variant as extracted from Shopify's structured data.
 *
 * `options` is always present (may be empty). All other fields are optional
 * because availability depends on which extraction pattern succeeded.
 */
export interface ProductVariant {
  id?: number;
  /** Human-readable variant label e.g. "Blue / Large". */
  title?: string;
  /** Price as a float in the store's native currency (not cents). */
  price?: number;
  sku?: string;
  available?: boolean;
  /** Raw option values in declaration order e.g. ["Blue", "Large"]. */
  options: string[];
  option1?: string;
  option2?: string;
  option3?: string;
  /** Resolved colour dimension (from option or structured attribute). */
  color?: string;
  /** Resolved size dimension (from option or structured attribute). */
  size?: string;
  currency?: string;
}

export interface FetchProductResult {
  /** Raw rendered HTML — present when Crawlbase succeeded. */
  html?: string;
  /** Markdown body — present when Firecrawl succeeded or returned alongside HTML. */
  markdown?: string;
  source: "crawlbase" | "firecrawl";
}

/* ─── Internal: Crawlbase arm ────────────────────────────────────────────── */

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function fetchWithCrawlbase(targetUrl: string): Promise<string> {
  const token = process.env.CRAWLBASE_TOKEN;
  if (!token) {
    throw new Error("CRAWLBASE_TOKEN is not configured.");
  }

  const endpoint = new URL(CRAWLBASE_API_URL);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("javascript_render", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(endpoint.toString(), { signal: controller.signal });

    if (!response.ok) {
      throw new Error(
        `Crawlbase returned HTTP ${response.status} for ${targetUrl}`,
      );
    }

    const html = await response.text();
    if (!html || html.trim().length < 200) {
      throw new Error("Crawlbase returned an empty or near-empty HTML body.");
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

/* ─── Internal: Shopify variant extraction helpers ───────────────────────── */

/**
 * Extract the text content of every <script> tag in the HTML.
 * Skips type="application/ld+json" blocks (handled by Pattern A).
 */
function extractScriptContents(html: string): string[] {
  const results: string[] = [];
  const re =
    /<script(?![^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1]?.trim();
    if (body) results.push(body);
  }
  return results;
}

/**
 * Walk a JS source string to find the JSON object that follows `marker`.
 *
 * Uses a character-level balanced-brace walk so it handles any depth of
 * nesting without the fragility of "match everything until the next semi".
 */
function extractJsonObjectAfter(
  source: string,
  marker: string,
): Record<string, unknown> | null {
  const idx = source.indexOf(marker);
  if (idx === -1) return null;

  const start = source.indexOf("{", idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < source.length; i++) {
    const c = source[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/* ─── Internal: Raw Shopify variant shape ────────────────────────────────── */

interface RawShopifyVariant {
  id?: number;
  title?: string;
  publicTitle?: string;
  price?: string | number;
  sku?: string;
  available?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

function normaliseShopifyVariant(
  raw: RawShopifyVariant,
  currency?: string,
): ProductVariant {
  const option1 = raw.option1 ?? undefined;
  const option2 = raw.option2 ?? undefined;
  const option3 = raw.option3 ?? undefined;

  const options = [option1, option2, option3].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  // Shopify stores price as a string in cents (e.g. "1999" = $19.99).
  const rawPrice =
    typeof raw.price === "string"
      ? Number(raw.price)
      : typeof raw.price === "number"
        ? raw.price
        : undefined;
  const price =
    rawPrice != null && Number.isFinite(rawPrice) && rawPrice > 0
      ? rawPrice > 100
        ? rawPrice / 100   // cents → dollars/shekels/etc.
        : rawPrice         // already a float (rare but seen on some themes)
      : undefined;

  return {
    id: typeof raw.id === "number" ? raw.id : undefined,
    title: raw.publicTitle ?? raw.title ?? undefined,
    price,
    sku: typeof raw.sku === "string" && raw.sku.length > 0 ? raw.sku : undefined,
    available: raw.available,
    options,
    option1,
    option2,
    option3,
    // Heuristic: first option is almost always colour on Shopify stores,
    // second is size. Caller can override when axis mappings say otherwise.
    color: option1,
    size: option2,
    currency,
  };
}

/* ─── Pattern A: JSON-LD ─────────────────────────────────────────────────── */

function variantsFromJsonLd(html: string): ProductVariant[] {
  const jsonLd = extractJsonLd(html);
  if (!jsonLd?.offers.length) return [];

  return jsonLd.offers
    .filter((o) => o.color || o.size || o.sku)
    .map((o) => {
      const options: string[] = [];
      if (o.color) options.push(o.color);
      if (o.size) options.push(o.size);

      // Synthesise from name if structured attrs are absent.
      if (options.length === 0 && o.name) {
        const parts = o.name.split(/\s*\/\s*/).map((p) => p.trim());
        options.push(...parts.filter(Boolean));
      }

      return {
        title: o.name,
        price: o.price,
        sku: o.sku,
        available: o.availability === "InStock" ? true
          : o.availability === "OutOfStock" ? false
          : undefined,
        options,
        option1: options[0],
        option2: options[1],
        option3: options[2],
        color: o.color ?? options[0],
        size: o.size ?? options[1],
        currency: o.currency ?? jsonLd.currency,
      } satisfies ProductVariant;
    });
}

/* ─── Pattern B: ShopifyAnalytics.meta ───────────────────────────────────── */

/**
 * Markers we look for in inline <script> blocks.
 * Listed in descending reliability order.
 */
const SHOPIFY_META_MARKERS = [
  "ShopifyAnalytics.meta =",
  "ShopifyAnalytics.meta=",
  "window.ShopifyAnalytics.meta =",
  'meta: {"product":',
  "var meta =",
];

function variantsFromShopifyMeta(html: string): ProductVariant[] {
  const scripts = extractScriptContents(html);

  for (const script of scripts) {
    for (const marker of SHOPIFY_META_MARKERS) {
      if (!script.includes(marker.split(" ")[0])) continue;

      const meta = extractJsonObjectAfter(script, marker);
      if (!meta) continue;

      const product = meta.product as Record<string, unknown> | undefined;
      if (!product) continue;

      const rawVariants = product.variants;
      if (!Array.isArray(rawVariants) || rawVariants.length === 0) continue;

      const currency =
        typeof meta.currency === "string" ? meta.currency : undefined;

      return (rawVariants as RawShopifyVariant[]).map((v) =>
        normaliseShopifyVariant(v, currency),
      );
    }
  }

  return [];
}

/* ─── Public: extractShopifyVariants ────────────────────────────────────── */

/**
 * Extract structured Shopify variant data from rendered HTML.
 *
 * Tries Pattern A (JSON-LD) first — present on virtually all modern Shopify
 * themes. Falls through to Pattern B (ShopifyAnalytics meta object) which is
 * injected server-side by Shopify's own analytics layer and therefore present
 * even when the theme omits structured data markup.
 *
 * Returns an empty array (never throws) when neither pattern matches.
 */
export function extractShopifyVariants(html: string): ProductVariant[] {
  const fromJsonLd = variantsFromJsonLd(html);
  if (fromJsonLd.length > 0) {
    console.debug(
      `[fetch-product] Pattern A: ${fromJsonLd.length} variant(s) from JSON-LD`,
    );
    return fromJsonLd;
  }

  const fromMeta = variantsFromShopifyMeta(html);
  if (fromMeta.length > 0) {
    console.debug(
      `[fetch-product] Pattern B: ${fromMeta.length} variant(s) from ShopifyAnalytics`,
    );
    return fromMeta;
  }

  console.debug("[fetch-product] No Shopify variant data found in HTML.");
  return [];
}

/* ─── Public: fetchProductPage ───────────────────────────────────────────── */

/**
 * Fetch a product page with a 14-day Neon Postgres cache, Crawlbase primary
 * arm, and Firecrawl fallback.
 *
 * Order of operations:
 *   1. Cache hit  → return immediately (no upstream call, source preserved)
 *   2. Crawlbase  → JS-rendered HTML; cache on success
 *   3. Firecrawl  → markdown + optional HTML fallback; cache on success
 *   4. Both fail  → throws (ScraperError from Firecrawl bubbles up)
 */
export async function fetchProductPage(
  url: string,
): Promise<FetchProductResult> {
  // ── 1. Cache lookup ─────────────────────────────────────────────────────
  const cached = await getCachedPage(url);
  if (cached) {
    console.info(`[fetch-product] cache hit (${cached.source}) for ${url}`);
    return cached;
  }

  // ── 2. Primary arm: Crawlbase ────────────────────────────────────────────
  try {
    const html = await fetchWithCrawlbase(url);
    console.info(`[fetch-product] Crawlbase succeeded for ${url}`);
    const result: FetchProductResult = { html, source: "crawlbase" };
    savePageAsync(url, result);
    return result;
  } catch (crawlbaseError) {
    console.warn(
      `[fetch-product] Crawlbase arm failed, falling back to Firecrawl:`,
      crawlbaseError instanceof Error
        ? crawlbaseError.message
        : crawlbaseError,
    );
  }

  // ── 3. Fallback arm: Firecrawl ───────────────────────────────────────────
  const raw = await scrapeWithFirecrawl(url); // throws ScraperError on failure
  console.info(`[fetch-product] Firecrawl fallback succeeded for ${url}`);
  const result: FetchProductResult = {
    html: raw.html,
    markdown: raw.markdown,
    source: "firecrawl",
  };
  savePageAsync(url, result);
  return result;
}
