/**
 * Bulk URL extractor.
 *
 * Pulls product URLs out of a free-text paste (WhatsApp messages, Telegram
 * forwards, email bodies, etc.). Strict about what counts as a URL — we'd
 * rather drop a malformed link than try a half-baked scan.
 *
 * Trimmed to <= MAX_BULK_URLS (currently 10) to bound concurrent scans.
 */

import { validateProductUrl } from "@/lib/analyze/client";

/** Hard cap to protect both the AE Affiliate API and our own concurrency. */
export const MAX_BULK_URLS = 10;

// Matches http(s)://… up to the first whitespace or list-terminating punctuation.
// We deliberately exclude `>` and `<` so URLs wrapped in <…> aren't truncated
// with leftover angle brackets.
const URL_REGEX = /https?:\/\/[^\s<>"')]+/gi;

/** Strip trailing punctuation that often clings to the end of a pasted URL. */
function trimTrailingPunctuation(raw: string): string {
  return raw.replace(/[.,!?;:)\]\}>]+$/g, "");
}

/**
 * Extract and dedupe candidate product URLs from a free-text block.
 *
 * Returns up to MAX_BULK_URLS validated URLs, in the order they first
 * appeared. Duplicates (case-insensitive on host+path) are dropped.
 */
export function extractProductUrls(text: string): string[] {
  if (!text) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  const matches = text.match(URL_REGEX) ?? [];
  for (const raw of matches) {
    if (out.length >= MAX_BULK_URLS) break;

    const trimmed = trimTrailingPunctuation(raw);
    if (validateProductUrl(trimmed)) continue; // returns error string when invalid

    let normalized: string;
    try {
      const u = new URL(trimmed);
      // Dedupe key: lowercase host + path. Different query strings count as
      // distinct (variant pickers etc.), but capitalization noise is folded.
      normalized = `${u.host.toLowerCase()}${u.pathname}`;
    } catch {
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(trimmed);
  }

  return out;
}
