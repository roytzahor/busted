const DEFAULT_MAX_CHARS = 8_000;

/**
 * Strip non-essential markdown bloat to minimize downstream LLM token costs.
 * Removes images, link targets, HTML remnants, and collapses whitespace.
 */
export function stripScrapedContent(
  raw: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  let content = raw
    // Remove HTML tags that may leak through
    .replace(/<[^>]+>/g, " ")
    // Remove markdown images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    // Flatten markdown links to anchor text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bare URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove navigation-style bullet noise (common in scraped nav menus)
    .replace(/^[\s*\-•]+$/gm, "")
    // Collapse excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (content.length > maxChars) {
    content = `${content.slice(0, maxChars)}\n\n[truncated]`;
  }

  return content;
}
