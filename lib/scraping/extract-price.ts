import { convertToUsd, type CurrencyCode } from "@/lib/currency";

/**
 * A price as it was actually printed on the merchant's page, plus its USD
 * equivalent.
 *
 * Both halves matter. `amount`/`currency` are what the shopper sees and are
 * what the UI should echo back — reformatting a USD round-trip would show an
 * Israeli shopper "₪238.13" for a page that clearly said "238 ₪". `amountUsd`
 * is what every comparison downstream needs, because the data model is
 * USD-locked end to end (see the header of lib/currency.ts).
 */
export interface DetectedPrice {
  /** Amount exactly as printed, in `currency`. */
  amount: number;
  currency: CurrencyCode;
  /** `amount` converted via the lib/currency FX snapshot. Identity for USD. */
  amountUsd: number;
}

/**
 * Currency tokens we can recognise, longest-first so "ILS" is never matched as
 * a bare "I" and "USD" never partially matches inside a longer token.
 */
const CURRENCY_TOKENS: ReadonlyArray<readonly [string, CurrencyCode]> = [
  ["₪", "ILS"],
  ["NIS", "ILS"],
  ["ILS", "ILS"],
  ["USD", "USD"],
  ["EUR", "EUR"],
  ["GBP", "GBP"],
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
];

const CURRENCY_ALT = "₪|NIS|ILS|USD|EUR|GBP|\\$|€|£";

/**
 * Characters allowed between a number and its currency symbol.
 *
 * Beyond normal whitespace this must include the Unicode bidi controls, which
 * Hebrew storefronts emit around prices so the symbol renders on the correct
 * side: LRM/RLM (200e/200f), ALM (061c) and the isolate marks (2066-2069).
 * Firecrawl preserves them, so "88.90 ₪" arrives as "88.90‏ ‏₪" and a
 * plain \s* between the two will not match.
 */
const SEP = "[\\s\\u00a0\\u200e\\u200f\\u061c\\u2066-\\u2069]*";

/** A number that starts with a digit — never a lone separator. */
const NUM = "(\\d[\\d,.]*)";

/**
 * Label prefixes that mark the real product price, followed by up to 12
 * characters of filler that contains no digit and no currency symbol — enough
 * to cross "מחיר רגיל"/"מחיר מבצע" (regular/sale price) or "Price:" without
 * being able to skip over an intervening price.
 */
const LABEL = "(?:מחיר|price)[^\\d₪$€£]{0,12}";

/**
 * Labels marking the price the shopper actually pays, which must outrank the
 * generic one. Israeli Shopify themes print the compare-at price first —
 * totwoo shows "מחיר מקורי ₪674.00 מחיר מבצע ₪539.00" (original then sale), and
 * Remora shows "מחיר רגיל 199 ₪ מחיר רגיל 269 ₪ במבצע 199 ₪". Taking the first
 * labelled number picks up the pre-discount figure and overstates the markup
 * the dropship verdict is computed from.
 */
const SALE_LABEL =
  "(?:מחיר\\s*מבצע|מחיר\\s*מוזל|במבצע|sale\\s+price)[^\\d₪$€£]{0,12}";

/**
 * Match tiers, tried in order. A labelled price beats a bare one, because bare
 * currency amounts on a storefront are as likely to be a cart total or a
 * shipping threshold as the product price.
 */
const PATTERN_TIERS: ReadonlyArray<RegExp> = [
  // Sale-labelled, number first ("במבצע 199 ₪")
  new RegExp(`${SALE_LABEL}${NUM}${SEP}(${CURRENCY_ALT})`, "gi"),
  // Sale-labelled, symbol first ("מחיר מבצע ₪539.00")
  new RegExp(`${SALE_LABEL}(${CURRENCY_ALT})${SEP}${NUM}`, "gi"),
  // Labelled, number first ("מחיר רגיל 238 ₪")
  new RegExp(`${LABEL}${NUM}${SEP}(${CURRENCY_ALT})`, "gi"),
  // Labelled, symbol first ("Price: $30", "מחיר ₪122.00")
  new RegExp(`${LABEL}(${CURRENCY_ALT})${SEP}${NUM}`, "gi"),
  // Bare, symbol first ("₪159.90", "$30")
  new RegExp(`(${CURRENCY_ALT})${SEP}${NUM}`, "gi"),
  // Bare, number first ("238 ₪")
  new RegExp(`${NUM}${SEP}(${CURRENCY_ALT})`, "gi"),
];

/** How far back to look for context that disqualifies a match. */
const CONTEXT_LOOKBACK = 60;

/**
 * Phrases that mean the following amount is a THRESHOLD, not a product price.
 *
 * Motivated by a real capture: By Yardi's header reads "משלוח חינם מעל ₪399"
 * (free shipping over ₪399) while its actual products cost ₪159.90. Taking the
 * first bare symbol match on that page yields a price 2.5× too high, which
 * would then be compared against a supplier price to compute markup.
 */
const THRESHOLD_MARKERS: ReadonlyArray<string> = [
  "מעל", // "over/above"
  "משלוח", // "shipping"
  "free shipping",
  "shipping over",
  "orders over",
  "order over",
  "spend",
];

/**
 * Phrases that mean the amount belongs to the cart widget. An unauthenticated
 * scrape sees an empty cart, so these are usually zero and rejected by the
 * plausibility check anyway — but a pre-filled cart would otherwise win, since
 * cart markup precedes the product on every Shopify theme.
 *
 * Deliberately narrow. The generic Hebrew "סך הכל"/"סה\"כ" ("total") was tried
 * and reverted: Remora prints "49 סך הכל ביקורות" — 49 TOTAL REVIEWS — right
 * before its real price, so the generic form discarded the correct value and
 * let the compare-at price win instead.
 */
const CART_MARKERS: ReadonlyArray<string> = [
  "סכום ביניים", // "subtotal"
  "subtotal",
  "cart total",
];

/** Above this a "price" is almost certainly an id, phone number or SKU. */
const MAX_PLAUSIBLE_AMOUNT = 100_000;

function resolveCurrency(token: string): CurrencyCode | null {
  const upper = token.toUpperCase();
  for (const [needle, code] of CURRENCY_TOKENS) {
    if (upper === needle.toUpperCase()) return code;
  }
  return null;
}

/**
 * Characters that end the context a marker can bind to: sentence/segment
 * punctuation, and any currency symbol (i.e. a preceding price).
 */
const CONTEXT_BOUNDARY = /[.|;\n₪$€£]/g;

/**
 * Text preceding a match, trimmed to the segment the match actually belongs to.
 *
 * A raw fixed-width lookback is wrong: "משלוח חינם מעל ₪399 … קייס ₪159.90"
 * puts the banner's threshold words within 60 characters of the REAL product
 * price, so a flat window rejects both. A marker like "over"/"מעל" binds to the
 * amount immediately following it, so the window stops at the previous price or
 * punctuation — everything before that belongs to a different clause.
 */
function contextBefore(markdown: string, matchStart: number): string {
  const raw = markdown.slice(Math.max(0, matchStart - CONTEXT_LOOKBACK), matchStart);

  let boundary = -1;
  CONTEXT_BOUNDARY.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = CONTEXT_BOUNDARY.exec(raw)) !== null) {
    boundary = hit.index;
  }

  return (boundary >= 0 ? raw.slice(boundary + 1) : raw).toLowerCase();
}

function isDisqualifiedByContext(markdown: string, matchStart: number): boolean {
  const before = contextBefore(markdown, matchStart);
  return (
    THRESHOLD_MARKERS.some((m) => before.includes(m)) ||
    CART_MARKERS.some((m) => before.includes(m))
  );
}

/**
 * Find the first plausible product price in scraped markdown, keeping the
 * currency it was printed in.
 *
 * Every tier iterates ALL of its matches rather than testing only the first.
 * That is load-bearing: Shopify renders the cart before the product, so the
 * first "₪" on an Israeli page is a "0 ₪" empty-cart total. Testing only the
 * first match meant one zero disqualified the entire pattern and the real
 * price two lines later was never seen.
 */
export function detectPriceInMarkdown(markdown: string): DetectedPrice | null {
  for (const pattern of PATTERN_TIERS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(markdown)) !== null) {
      // Group order flips between tiers; the numeric group is the one that
      // parses as a number.
      const [, first, second] = match;
      const rawNumber = /^\d/.test(first) ? first : second;
      const rawCurrency = rawNumber === first ? second : first;

      const currency = resolveCurrency(rawCurrency);
      const amount = parseLocalizedPrice(rawNumber);

      if (
        currency !== null &&
        amount !== null &&
        amount > 0 &&
        amount < MAX_PLAUSIBLE_AMOUNT &&
        !isDisqualifiedByContext(markdown, match.index)
      ) {
        return {
          amount,
          currency,
          amountUsd: convertToUsd(amount, currency),
        };
      }
    }
  }

  return null;
}

/**
 * USD-only view of {@link detectPriceInMarkdown}, for callers that only ever
 * deal in dollars — notably the AliExpress candidate parser, whose listings are
 * already priced in USD by the API/scrape layer.
 */
export function extractPriceFromMarkdown(markdown: string): number | null {
  return detectPriceInMarkdown(markdown)?.amountUsd ?? null;
}

function parseLocalizedPrice(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(/[.,]$/, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    const value = normalized.replace(/,/g, "");
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (normalized.includes(",")) {
    const parts = normalized.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      const parsed = Number.parseFloat(`${parts[0]}.${parts[1]}`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number.parseFloat(normalized.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractStoreNameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const label = hostname.split(".")[0] ?? hostname;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Unknown Store";
  }
}
