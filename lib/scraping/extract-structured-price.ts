/**
 * Structured store price — spec 0003 (agent-os/specs/0003-store-price-evidence).
 *
 * The page's own machine-readable price, read before any regex over rendered
 * text: `og:price:*` / `product:price:*` meta tags first (Shopify themes emit
 * the selected variant's current price there), then a JSON-LD Product offer
 * (`lowestPrice` across offers — can understate a variant product, hence
 * second).
 *
 * Why it exists: the markdown regex read agas-tamar's refund-policy
 * cancellation fee ("$30") as the price of a ₪3,122 ring, while the page's
 * JSON-LD said 3121.92 ILS. Structured sources were never wrong where present
 * in the hand-labelled corpus (`npm run eval:price`).
 *
 * Enhancement contract: returns null on anything it cannot read with
 * certainty — unknown currency, zero, absurd amount, malformed markup — and
 * never throws (constitution article V).
 */
import { convertToUsd, isCurrencyCode, type CurrencyCode } from "@/lib/currency";
import { extractJsonLd } from "@/lib/scraping/extract-jsonld";
import type { DetectedPrice } from "@/lib/scraping/extract-price";

export interface StructuredPrice extends DetectedPrice {
  source: "meta" | "jsonld";
}

/** Above this we assume a parse error, not a product (same spirit as the
 *  matcher's absurd-price guard). */
const MAX_PLAUSIBLE_AMOUNT = 1_000_000;

/**
 * Parse a machine-formatted amount. Meta content is normally "165.00", but
 * themes also emit "1,299.00", "1.299,00" and "165,00".
 */
export function parseStructuredAmount(raw: string | number | undefined | null): number | null {
  if (typeof raw === "number") return plausible(raw);
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[\s ‎‏]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal mark.
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    // "1,299" (thousands) vs "165,00" (decimal comma).
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // "1.299.000" — dots as thousands separators.
    s = s.replace(/\./g, "");
  }
  return plausible(Number(s));
}

function plausible(n: number): number | null {
  return Number.isFinite(n) && n > 0 && n < MAX_PLAUSIBLE_AMOUNT ? n : null;
}

function toCurrency(raw: string | undefined): CurrencyCode | null {
  const upper = raw?.trim().toUpperCase();
  if (upper === "NIS") return "ILS";
  return isCurrencyCode(upper) ? upper : null;
}

function readAttr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : undefined;
}

/** All `<meta>` tags keyed by property/name, first occurrence wins. */
function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (readAttr(tag, "property") ?? readAttr(tag, "name"))?.trim().toLowerCase();
    const content = readAttr(tag, "content");
    if (key && content !== undefined && !out.has(key)) out.set(key, content);
  }
  return out;
}

function build(amount: number, currency: CurrencyCode, source: StructuredPrice["source"]): StructuredPrice | null {
  const amountUsd = convertToUsd(amount, currency);
  return amountUsd > 0 ? { amount, currency, amountUsd, source } : null;
}

function fromMeta(html: string): StructuredPrice | null {
  const meta = metaTags(html);
  for (const prefix of ["og:price", "product:price"]) {
    const amount = parseStructuredAmount(meta.get(`${prefix}:amount`));
    const currency = toCurrency(meta.get(`${prefix}:currency`));
    if (amount !== null && currency !== null) return build(amount, currency, "meta");
  }
  return null;
}

function fromJsonLd(html: string): StructuredPrice | null {
  const ld = extractJsonLd(html);
  if (!ld) return null;
  const amount = parseStructuredAmount(ld.lowestPrice);
  const currency = toCurrency(ld.currency);
  return amount !== null && currency !== null ? build(amount, currency, "jsonld") : null;
}

export function extractStructuredPrice(html: string | null | undefined): StructuredPrice | null {
  if (!html) return null;
  try {
    return fromMeta(html) ?? fromJsonLd(html);
  } catch {
    // Enhancement stages never break a scan — fall through to the regex.
    return null;
  }
}
