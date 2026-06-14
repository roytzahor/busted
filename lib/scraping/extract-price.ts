/** Extract the first plausible product price from scraped markdown (USD/EUR/GBP). */
export function extractPriceFromMarkdown(markdown: string): number | null {
  const patterns = [
    /(?:sale\s+)?price\s*[:\s]*(?:€|EUR|\$|USD|£|GBP)\s*([\d,.]+)/i,
    /(?:€|EUR|\$|USD|£|GBP)\s*([\d,.]+)/i,
    /([\d,.]+)\s*(?:€|EUR|\$|USD|£|GBP)/i,
  ];

  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match?.[1]) {
      const parsed = parseLocalizedPrice(match[1]);
      if (parsed !== null && parsed > 0 && parsed < 100_000) {
        return parsed;
      }
    }
  }

  return null;
}

function parseLocalizedPrice(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "");

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
