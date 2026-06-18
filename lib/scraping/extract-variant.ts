import type { ScrapedProductVariant } from "@/lib/scraping/types";

// Capacity tokens (volume, storage, weight) — checked before plain "size"
// so "256GB" doesn't fall through as a size value.
const CAPACITY_REGEX =
  /\b(\d+(?:\.\d+)?\s?(?:gb|tb|mb|ml|l|oz|fl\s?oz|g|kg|lb|lbs|in|cm|mm|ft|m|w|wh|mah))\b/i;

// Color words we commonly see in product variants. Used as a fallback when
// no explicit "Color: X" label is present in the markdown.
const COMMON_COLOR_WORDS = [
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple",
  "pink", "brown", "gray", "grey", "silver", "gold", "rose gold", "navy",
  "beige", "cream", "ivory", "tan", "khaki", "olive", "teal", "turquoise",
  "burgundy", "maroon", "matte black", "matte white", "space gray", "midnight",
];

const MATERIAL_WORDS = [
  "leather", "vegan leather", "pu leather", "cotton", "polyester", "silk",
  "wool", "linen", "denim", "suede", "satin", "velvet", "nylon", "canvas",
  "wood", "bamboo", "steel", "stainless steel", "aluminum", "ceramic",
  "glass", "plastic", "silicone", "rubber", "carbon fiber",
];

const SIZE_WORDS = ["xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl"];

function extractByLabel(markdown: string, labels: string[]): string | undefined {
  for (const label of labels) {
    // Match "Label: value" or "Label - value" until newline/double space
    const pattern = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n,;|()]+)`, "i");
    const match = markdown.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim().replace(/\s+/g, " ");
      // Reject obvious junk: empty, super long, or starts with a separator
      if (value.length > 0 && value.length < 80) {
        return value;
      }
    }
  }
  return undefined;
}

function detectColorFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  // Prefer multi-word matches first (e.g. "rose gold" before "gold")
  const sorted = [...COMMON_COLOR_WORDS].sort((a, b) => b.length - a.length);
  for (const color of sorted) {
    const pattern = new RegExp(`\\b${color}\\b`, "i");
    if (pattern.test(lower)) {
      // Preserve original casing from the source text
      const match = text.match(pattern);
      return match?.[0];
    }
  }
  return undefined;
}

function detectMaterialFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const sorted = [...MATERIAL_WORDS].sort((a, b) => b.length - a.length);
  for (const material of sorted) {
    if (new RegExp(`\\b${material}\\b`, "i").test(lower)) {
      return material;
    }
  }
  return undefined;
}

function detectSizeFromText(text: string): string | undefined {
  // Letter sizes need word boundaries to avoid matching random "m" in "from"
  for (const size of SIZE_WORDS) {
    if (new RegExp(`\\b${size}\\b`, "i").test(text)) {
      return size.toUpperCase();
    }
  }
  // Numeric sizes (only when explicitly labelled, handled in extractByLabel)
  return undefined;
}

/**
 * Pull variant signals from URL query params. Shopify and many platforms
 * encode the selected variant in the URL: `?variant=12345`, `?color=black`,
 * `?size=M`. These are the most reliable source because the user explicitly
 * picked them before pasting the link.
 */
function extractFromUrl(sourceUrl: string): Partial<ScrapedProductVariant> {
  const out: Partial<ScrapedProductVariant> = {};
  try {
    const url = new URL(sourceUrl);
    const params = url.searchParams;

    const variantId = params.get("variant") ?? params.get("sku") ?? params.get("variantId");
    if (variantId) out.selectedSku = variantId;

    const color = params.get("color") ?? params.get("colour");
    if (color) out.color = decodeURIComponent(color).replace(/[+_-]/g, " ").trim();

    const size = params.get("size");
    if (size) out.size = decodeURIComponent(size).replace(/[+_-]/g, " ").trim();
  } catch {
    // ignore malformed URLs
  }
  return out;
}

/**
 * Best-effort variant extraction from a product page's markdown + URL.
 * Returns undefined when nothing was found — never throws.
 */
export function extractVariantSignals(
  markdown: string,
  sourceUrl: string,
  title: string,
): ScrapedProductVariant | undefined {
  const urlSignals = extractFromUrl(sourceUrl);

  const color =
    urlSignals.color ??
    extractByLabel(markdown, ["color", "colour", "shade", "finish"]);

  const size =
    urlSignals.size ??
    extractByLabel(markdown, ["size", "fit", "dimension"]);

  // Capacity searches markdown directly because labels vary ("Storage",
  // "Capacity", "Volume", "Weight", or just appears in the title).
  const capacityFromLabel = extractByLabel(markdown, [
    "capacity", "storage", "volume", "weight", "memory",
  ]);
  const capacityFromTitle = title.match(CAPACITY_REGEX)?.[0];
  const capacity = capacityFromLabel ?? capacityFromTitle;

  const material =
    extractByLabel(markdown, ["material", "fabric"]) ??
    // Title-based detection is risky — only use it if no label was found anywhere
    (!color && !size ? undefined : detectMaterialFromText(title));

  // Last-resort color guess from title if nothing else worked
  const colorFromTitle =
    !color && !urlSignals.color ? detectColorFromText(title) : undefined;

  // Last-resort size guess from title (only letter sizes like "XL")
  const sizeFromTitle =
    !size && !urlSignals.size ? detectSizeFromText(title) : undefined;

  const variant: ScrapedProductVariant = {
    ...(color ?? colorFromTitle ? { color: color ?? colorFromTitle } : {}),
    ...(size ?? sizeFromTitle ? { size: size ?? sizeFromTitle } : {}),
    ...(capacity ? { capacity } : {}),
    ...(material ? { material } : {}),
    ...(urlSignals.selectedSku ? { selectedSku: urlSignals.selectedSku } : {}),
  };

  // Return undefined when we found absolutely nothing — keeps downstream
  // logic simple ("variant present" means at least one signal).
  return Object.keys(variant).length > 0 ? variant : undefined;
}
