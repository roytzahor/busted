import {
  enrichCandidatesWithDetailScrape,
  extractCandidatesFromMarkdown,
} from "@/lib/aliexpress/parse-search-markdown";
import { rankAliExpressCandidates } from "@/lib/aliexpress/rank-products";
import type { AliExpressProductCandidate } from "@/lib/aliexpress/types";
import { AliExpressSearchError } from "@/lib/aliexpress/types";
import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";

function slugifyKeywords(keywords: string): string {
  return encodeURIComponent(keywords.trim().replace(/\s+/g, "-"));
}

export async function searchAliExpressViaScrape(
  keywords: string,
): Promise<AliExpressProductCandidate[]> {
  const searchUrl = `https://www.aliexpress.com/w/wholesale-${slugifyKeywords(keywords)}.html`;

  const scrape = await scrapeWithFirecrawl(searchUrl);
  let candidates = extractCandidatesFromMarkdown(scrape.markdown, keywords);

  if (candidates.length === 0) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_RESULTS",
      `No AliExpress products found for "${keywords}".`,
      422,
    );
  }

  if (candidates.some((candidate) => candidate.priceUsd <= 0)) {
    candidates = await enrichCandidatesWithDetailScrape(candidates, 3);
  }

  const priced = candidates.filter((candidate) => candidate.priceUsd > 0);
  if (priced.length === 0) {
    throw new AliExpressSearchError(
      "ALIEXPRESS_NO_RESULTS",
      `AliExpress listings were found but live prices could not be extracted for "${keywords}". Configure ALIEXPRESS_APP_KEY for reliable supplier search.`,
      422,
    );
  }

  return rankAliExpressCandidates(priced);
}
