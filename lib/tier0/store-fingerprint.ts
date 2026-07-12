/**
 * Tier-0 store fingerprinting — deterministic, zero-token dropship detection.
 *
 * First stage of the tiered inference cascade (see ROADMAP.md): catches
 * template dropship stores from static footprints in <50ms and short-circuits
 * the Tier-1 AI verdict call inside the dropship-verdict service.
 *
 * Precision-first firing rules (a false fire here is a production false
 * positive — the most damaging failure mode):
 *   - App footprints match ONLY in URL/attribute position inside raw HTML,
 *     never in prose — a blog post *about* DSers must not fire.
 *   - The page must look like a product page (same ≥3-attribute shape the
 *     AI humility clamps enforce) before any signal counts.
 *   - Firing requires multiple independent signals; a single match never fires.
 *
 * Kill switch: TIER0_FINGERPRINT_ENABLED=false (code path stays intact).
 */

import { countAttributeSignals, type DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export interface StoreFingerprintInput {
  attributes: ScrapedProductAttributes;
  markdown: string;
  /**
   * Raw page HTML when the scraper captured it (Firecrawl format "html").
   * App-footprint signals only fire against HTML — markdown strips the
   * script/meta tags they live in. Absent → text signals only.
   */
  html?: string;
  storePriceUsd: number | null;
}

export interface StoreFingerprintResult {
  fired: boolean;
  prediction: DropshipPrediction | null;
  /** Human-readable matched evidence — becomes reasoningSignals when fired. */
  signals: string[];
  elapsedMs: number;
}

export function isTier0Enabled(): boolean {
  return process.env.TIER0_FINGERPRINT_ENABLED !== "false";
}

/** Scans are regex-linear, but cap input so a pathological page can't stall the pipeline. */
const MAX_SCAN_CHARS = 500_000;

/**
 * Dropship fulfillment apps — SaaS whose sole purpose is forwarding retail
 * orders to AliExpress/CJ suppliers. Their asset/script URLs on a product
 * page are a near-certain fingerprint; legit inventory brands don't run them.
 */
const FULFILLMENT_APPS = [
  "dsers",
  "zendrop",
  "oberlo",
  "cjdropshipping",
  "spocket",
  "autods",
  "dropified",
  "eprolo",
  "importify",
] as const;

/** Matches app names only inside quoted attribute values (src=, href=, content=). */
const APP_FOOTPRINT_RE = new RegExp(
  `(?:src|href|content|data-src)\\s*=\\s*["'][^"']*\\b(${FULFILLMENT_APPS.join("|")})\\b`,
  "gi",
);

interface TextSignal {
  label: string;
  test: (text: string) => boolean;
}

/** Returns true when an "X–Y days/weeks" window implies overseas fulfilment. */
function hasLongDeliveryWindow(text: string): boolean {
  const re =
    /(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s+(?:business\s+|working\s+)?(days?|weeks?)\b/gi;
  for (const m of text.matchAll(re)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    const unit = m[3].toLowerCase();
    if (unit.startsWith("week")) return true;
    // 7+ day lower bound (or a 15+ day upper bound) is overseas-warehouse
    // territory; "2-4 days" is a normal domestic promise and must not count.
    if (lo >= 7 || hi >= 15) return true;
  }
  return false;
}

/** Shipping-policy patterns — visible page text, so matched on markdown + description. */
const SHIPPING_SIGNALS: TextSignal[] = [
  {
    label: "Long shipping window (7+ days / weeks-scale delivery promise)",
    test: hasLongDeliveryWindow,
  },
  {
    label: "Ships from overseas/international warehouse",
    test: (t) =>
      /(?:overseas|international)\s+warehouse|warehouse\s+in\s+(?:china|asia)|ships?\s+from\s+(?:our\s+)?(?:overseas|international|china)/i.test(
        t,
      ),
  },
  {
    label: "Tracking-number delay disclaimer",
    test: (t) =>
      /tracking\s+(?:number|info(?:rmation)?|details?)\s+(?:may|can|will|might)\s+take/i.test(t),
  },
  {
    label: '"Due to high demand" shipping excuse',
    test: (t) => /due\s+to\s+(?:high|popular|overwhelming)\s+demand[^.]{0,60}(?:shipping|delivery|delays?)/i.test(t),
  },
];

/** Template urgency copy — common on dropship themes but also used by some legit stores. Weak. */
const TEMPLATE_SIGNALS: TextSignal[] = [
  {
    label: '"Free worldwide shipping" template copy',
    test: (t) => /free\s+worldwide\s+shipping/i.test(t),
  },
  {
    label: '"Not sold in stores" template copy',
    test: (t) => /not\s+(?:sold|available)\s+in\s+stores/i.test(t),
  },
  {
    label: "Urgency countdown copy (today only / selling fast / almost sold out)",
    test: (t) =>
      /(?:\d{1,2}%\s+off\s+)?today\s+only|selling\s+fast|almost\s+sold\s+out|hurry[,!\s]+(?:only\s+)?\d+\s+left/i.test(
        t,
      ),
  },
];

/**
 * The AI humility clamp's product-page-shape gate (dropship-verifier rule 7):
 * fewer than 3 of {title, price, description, image} → not judgeable as a
 * product page, so Tier-0 must stay silent and let the AI return
 * insufficient_evidence. Delegates to the verifier's own counter so the two
 * thresholds can never drift.
 */
function looksLikeProductPage(
  attributes: ScrapedProductAttributes,
  storePriceUsd: number | null,
): boolean {
  return countAttributeSignals(attributes, storePriceUsd) >= 3;
}

function buildPrediction(
  input: StoreFingerprintInput,
  signals: string[],
  confidence: number,
): DropshipPrediction {
  const { attributes, storePriceUsd } = input;
  // Rule-8 midpoint: supplier cost estimated at 25% of store price.
  const estimatedSupplierPriceUsd =
    storePriceUsd !== null ? Math.round(storePriceUsd * 0.25 * 100) / 100 : null;
  return {
    verdict: "dropship",
    isLikelyDropship: true,
    confidence,
    productCategory: attributes.title.slice(0, 120) || "Product page",
    reasoning:
      "Deterministic store fingerprint: the page carries multiple static dropship footprints " +
      `(${signals.join("; ")}). Verdict issued by the Tier-0 gate without an AI call.`,
    reasoningSignals: signals,
    missingSignals: [],
    redFlags: signals,
    // Keywords/category enrichment is owned by the identifier + supplier
    // fallback path — Tier-0 never invents search terms.
    aliexpressKeywords: [],
    styleTokens: [],
    materialPriors: [],
    estimatedStorePriceUsd: storePriceUsd,
    estimatedSupplierPriceUsd,
    estimatedMarkupPercent:
      storePriceUsd !== null && estimatedSupplierPriceUsd !== null ? 300 : null,
  };
}

/**
 * Runs the fingerprint scan. Pure and synchronous — never throws, never
 * calls the network. Firing rules (any one):
 *   A. ≥1 fulfillment-app footprint AND ≥1 other signal            → conf 0.8
 *   B. ≥1 shipping-policy signal AND ≥3 independent text signals   → conf 0.72
 */
export function runStoreFingerprint(
  input: StoreFingerprintInput,
): StoreFingerprintResult {
  const start = performance.now();
  const done = (fired: boolean, signals: string[], confidence = 0): StoreFingerprintResult => ({
    fired,
    prediction: fired ? buildPrediction(input, signals, confidence) : null,
    signals,
    elapsedMs: performance.now() - start,
  });

  if (!looksLikeProductPage(input.attributes, input.storePriceUsd)) {
    return done(false, []);
  }

  const html = (input.html ?? "").slice(0, MAX_SCAN_CHARS);
  const text = `${input.markdown.slice(0, MAX_SCAN_CHARS)}\n${input.attributes.description}`;

  const appHits = new Set<string>();
  for (const m of html.matchAll(APP_FOOTPRINT_RE)) {
    appHits.add(m[1].toLowerCase());
  }
  const appSignals = [...appHits].map(
    (app) => `Dropship fulfillment app footprint: "${app}" asset reference in page HTML`,
  );

  const shippingSignals = SHIPPING_SIGNALS.filter((s) => s.test(text)).map((s) => s.label);
  const templateSignals = TEMPLATE_SIGNALS.filter((s) => s.test(text)).map((s) => s.label);
  const signals = [...appSignals, ...shippingSignals, ...templateSignals];

  if (appSignals.length >= 1 && shippingSignals.length + templateSignals.length >= 1) {
    return done(true, signals, 0.8);
  }
  // Text-only rule: at least one shipping-policy signal anchoring ≥3
  // independent text signals total. Template copy alone never fires.
  if (
    shippingSignals.length >= 1 &&
    shippingSignals.length + templateSignals.length >= 3
  ) {
    return done(true, signals, 0.72);
  }
  return done(false, signals);
}
