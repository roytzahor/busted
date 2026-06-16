const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "our",
  "new",
  "best",
  "free",
  "sale",
  "shop",
  "buy",
  "get",
  "off",
  "premium",
  "quality",
  "original",
  "official",
]);

export function extractSearchKeywords(title: string): string {
  const tokens = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  if (tokens.length === 0) {
    return title.trim().slice(0, 80);
  }

  return tokens.slice(0, 8).join(" ");
}

/**
 * A "thin title" is a brand name or short slug that produces poor AliExpress
 * search results — e.g. "The CapBlast", "Nutr", "RYZE Coffee".
 * Threshold: fewer than 3 meaningful tokens after stop-word filtering.
 */
export function isThinTitle(title: string): boolean {
  const tokens = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return tokens.length < 3;
}

/**
 * Build a category-based keyword string to use when the title alone is too
 * thin. Combines the AI-extracted productCategory with a few meaningful tokens
 * from the title (if any), so we don't lose all product-specific signal.
 */
export function buildCategoryKeywords(
  title: string,
  productCategory: string,
): string {
  const titleTokens = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, 2);

  const categoryTokens = productCategory
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, 6);

  // Dedupe: drop title tokens already covered by category
  const uniqueTitleTokens = titleTokens.filter((t) => !categoryTokens.includes(t));

  return [...categoryTokens, ...uniqueTitleTokens].join(" ");
}
