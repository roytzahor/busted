/**
 * JSON-LD structured data extractor for product pages.
 *
 * Shopify, WooCommerce, and most modern e-commerce platforms embed a
 * `<script type="application/ld+json">` block containing a Schema.org
 * `Product` object with machine-readable name, description, image, price,
 * and offer variants. This is far more reliable than regex extraction from
 * markdown because:
 *   - The data is structured by the store's own template engine — no
 *     whitespace or formatting variation.
 *   - Price, currency, and offer names are encoded verbatim.
 *   - Variant dimensions (color/size) appear as offer names like "Red / S".
 *
 * Falls back gracefully: returns null when no ld+json block is found,
 * when the JSON is malformed, or when the Product node is missing.
 * Caller should treat null as "use markdown extraction".
 */

/* ─── Output types ───────────────────────────────────────────────────────── */

export interface ProductJsonLdOffer {
  /** Raw offer name — often "Color / Size" e.g. "Purple / Large". */
  name?: string;
  price?: number;
  currency?: string;
  sku?: string;
  /** Availability string from schema.org (InStock, OutOfStock, etc.) */
  availability?: string;
  /** Structured color from offer or its itemOffered child. */
  color?: string;
  /** Structured size from offer or its itemOffered child. */
  size?: string;
}

export interface ProductJsonLd {
  name?: string;
  description?: string;
  /** First image URL found on the Product node. */
  image?: string;
  /** Lowest price across all offers (in the dominant currency). */
  lowestPrice?: number;
  currency?: string;
  /** All parsed offers — used for variant signal extraction. */
  offers: ProductJsonLdOffer[];
  /** Raw brand name, when present. */
  brand?: string;
  /** Global Trade Item Number (barcode) — useful for exact product matching. */
  gtin?: string;
  sku?: string;
}

/* ─── Internal helpers ───────────────────────────────────────────────────── */

function extractScriptBlocks(html: string): string[] {
  const blocks: string[] = [];
  // Match <script type="application/ld+json"> ... </script> (case-insensitive type attr)
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const content = match[1]?.trim();
    if (content) blocks.push(content);
  }
  return blocks;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolveFirst(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractImageUrl(imageField: unknown): string | undefined {
  if (typeof imageField === "string" && imageField.startsWith("http")) return imageField;
  const first = resolveFirst(imageField);
  if (typeof first === "string" && first.startsWith("http")) return first;
  if (typeof first === "object" && first !== null) {
    const img = first as Record<string, unknown>;
    if (typeof img.url === "string" && img.url.startsWith("http")) return img.url;
    if (typeof img.contentUrl === "string" && img.contentUrl.startsWith("http")) return img.contentUrl;
  }
  return undefined;
}

function toPrice(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toCurrency(value: unknown): string | undefined {
  return typeof value === "string" && value.length >= 3 ? value.toUpperCase() : undefined;
}

function extractOffers(offersField: unknown): ProductJsonLdOffer[] {
  const list: unknown[] = Array.isArray(offersField)
    ? offersField
    : offersField != null
    ? [offersField]
    : [];

  const result: ProductJsonLdOffer[] = [];

  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;

    // Drill into itemOffered for variant-specific attributes.
    const offered = typeof o.itemOffered === "object" && o.itemOffered !== null
      ? (o.itemOffered as Record<string, unknown>)
      : null;

    const offer: ProductJsonLdOffer = {
      name: typeof o.name === "string" ? o.name.trim() : undefined,
      price: toPrice(o.price) ?? toPrice(o.lowPrice),
      currency: toCurrency(o.priceCurrency),
      sku: typeof o.sku === "string" ? o.sku.trim() : undefined,
      availability: typeof o.availability === "string"
        ? o.availability.replace(/^https?:\/\/schema\.org\//, "")
        : undefined,
      color:
        typeof o.color === "string" ? o.color.trim() :
        typeof offered?.color === "string" ? offered.color.trim() :
        undefined,
      size:
        typeof o.size === "string" ? o.size.trim() :
        typeof offered?.size === "string" ? offered.size.trim() :
        undefined,
    };

    // If offer has no name but has structured color+size, synthesise a name.
    if (!offer.name && (offer.color || offer.size)) {
      offer.name = [offer.color, offer.size].filter(Boolean).join(" / ");
    }

    result.push(offer);
  }

  return result;
}

/** Find the first object with @type matching "Product" in an ld+json value. */
function findProductNode(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;

  // Handle @graph array (common in Yoast SEO output)
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    for (const node of obj["@graph"]) {
      const found = findProductNode(node);
      if (found) return found;
    }
  }

  // Handle top-level array
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }

  // Check @type field
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && t.toLowerCase().includes("product"))) {
    return obj;
  }

  return null;
}

/* ─── Public entry point ─────────────────────────────────────────────────── */

/**
 * Parse all ld+json blocks in the page HTML and return the first Product
 * node's structured data.
 *
 * @param html  Raw HTML string from Firecrawl's `"html"` format.
 * @returns     Structured product data, or null when not found / malformed.
 */
export function extractJsonLd(html: string): ProductJsonLd | null {
  const blocks = extractScriptBlocks(html);
  if (blocks.length === 0) return null;

  for (const block of blocks) {
    const parsed = parseJsonSafe(block);
    const product = findProductNode(parsed);
    if (!product) continue;

    const offers = extractOffers(product.offers);

    // Lowest offer price (dominant currency).
    const validPrices = offers.map((o) => o.price).filter((p): p is number => p != null);
    const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : undefined;

    // Currency: prefer first offer's currency over product-level.
    const currency =
      offers.find((o) => o.currency)?.currency ??
      toCurrency(product.priceCurrency) ??
      toCurrency((product.offers as Record<string, unknown>)?.priceCurrency);

    // Brand
    const brandField = product.brand;
    const brand =
      typeof brandField === "string" ? brandField.trim() :
      typeof (brandField as Record<string, unknown> | undefined)?.name === "string"
        ? ((brandField as Record<string, unknown>).name as string).trim()
        : undefined;

    return {
      name: typeof product.name === "string" ? product.name.trim() : undefined,
      description:
        typeof product.description === "string" ? product.description.trim() : undefined,
      image: extractImageUrl(product.image),
      lowestPrice,
      currency,
      offers,
      brand: brand || undefined,
      gtin:
        typeof product.gtin === "string" ? product.gtin.trim() :
        typeof product.gtin13 === "string" ? product.gtin13.trim() :
        typeof product.gtin12 === "string" ? product.gtin12.trim() :
        undefined,
      sku: typeof product.sku === "string" ? product.sku.trim() : undefined,
    };
  }

  return null;
}

/**
 * Try to extract a variant signal from the offer list.
 *
 * Looks for an offer whose name or structured attributes match the
 * selected variant (from URL params or page state). Falls back to
 * picking the first offer with color/size data.
 *
 * Returns a partial variant record — caller merges with extractVariantSignals().
 */
export function extractVariantFromOffers(
  offers: ProductJsonLdOffer[],
  selectedSku?: string,
): { color?: string; size?: string } | null {
  if (offers.length === 0) return null;

  // If we have a selected SKU, find the matching offer.
  if (selectedSku) {
    const bySkuMatch = offers.find((o) => o.sku === selectedSku);
    if (bySkuMatch?.color || bySkuMatch?.size) {
      return { color: bySkuMatch.color, size: bySkuMatch.size };
    }
  }

  // Fall back to first offer with structured dimensions.
  const withDims = offers.find((o) => o.color || o.size);
  if (withDims) return { color: withDims.color, size: withDims.size };

  // Last resort: try to parse the first offer's name string "Color / Size".
  const first = offers[0];
  if (first?.name) {
    const parts = first.name.split(/\s*\/\s*/);
    if (parts.length === 2) {
      return { color: parts[0].trim() || undefined, size: parts[1].trim() || undefined };
    }
  }

  return null;
}
