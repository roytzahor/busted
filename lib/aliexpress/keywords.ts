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
