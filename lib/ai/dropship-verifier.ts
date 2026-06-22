import { getAIClient } from "@/lib/ai/client";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export type DropshipVerdict =
  | "dropship"
  | "legit"
  | "insufficient_evidence"
  | "not_a_product";

export interface DropshipPrediction {
  verdict: DropshipVerdict;
  isLikelyDropship: boolean;
  confidence: number;
  productCategory: string;
  reasoning: string;
  reasoningSignals: string[];
  missingSignals: string[];
  redFlags: string[];
  aliexpressKeywords: string[];
  estimatedStorePriceUsd: number | null;
  estimatedSupplierPriceUsd: number | null;
  estimatedMarkupPercent: number | null;
}

export interface DropshipVerificationResult {
  prediction: DropshipPrediction | null;
  provider: string;
  model: string;
  rawResponse: string;
  error: string | null;
}

const SYSTEM_PROMPT = `You are a dropshipping detection engine for Busted.
Analyze scraped e-commerce product data and return ONLY valid JSON matching this schema:
{
  "verdict": "dropship" | "legit" | "insufficient_evidence" | "not_a_product",
  "confidence": number (0..1),
  "productCategory": string,
  "reasoning": string (2-3 sentences citing the scrape),
  "reasoningSignals": string[] (concrete evidence FROM the scrape — never invent),
  "missingSignals": string[] (what data would have raised confidence),
  "redFlags": string[],
  "aliexpressKeywords": string[] (2-5 short functional search phrases a buyer would use to find this product on AliExpress — describe WHAT IT DOES, not the brand name. E.g. ["bottle cap launcher", "beer cap shooter", "cap catapult opener"]. Empty array for not_a_product.),
  "estimatedStorePriceUsd": number | null,
  "estimatedSupplierPriceUsd": number | null,
  "estimatedMarkupPercent": number | null
}

VERDICT DEFINITIONS — pick exactly one:
- "dropship" — strong evidence this retail page resells a generic supplier product with markup. Requires at least 2 concrete signals in reasoningSignals[].
- "legit" — established brand, real inventory, original product, or supplier marketplace itself.
- "insufficient_evidence" — page IS a product page but the scrape is too sparse (missing title/price/description/images) to judge. Be honest and pick this when you don't have enough.
- "not_a_product" — the scraped content is NOT a product page (blog post, homepage, category listing, search results, 404, about page).

HARD RULES (violating these = wrong output):
1. Base productCategory and reasoning strictly on the scraped title/description — NEVER invent products that aren't in the data.
2. reasoningSignals[] MUST be non-empty for "dropship" or "legit" verdicts. Each item must quote or paraphrase something from the scrape. Empty array → you MUST use "insufficient_evidence".
3. For "insufficient_evidence", confidence MUST be between 0.2 and 0.5 (you are explicitly uncertain).
4. For "not_a_product", confidence can be 0.7+ (you're confident it's NOT a product). Set estimated prices to null.
5. If sourceUrl is AliExpress, Temu, Wish, DHgate, or any wholesale marketplace → verdict="legit", confidence=0.98, reasoning explains "already at supplier".
6. Do NOT flag AliExpress product pages as dropship — they ARE the supplier source.
7. If scrape has fewer than 3 of {title >5 chars, price detected, description >50 chars, mainImageUrl, brand mention} → you MUST use "insufficient_evidence" or "not_a_product".
8. If a store price is provided, estimate supplier cost at 15-35% of store price for typical dropship markups (only when verdict="dropship").
9. confidence reflects YOUR certainty given available data. Do not output high confidence on weak data.

EXAMPLES:

Input: { title: "Why Dropshipping Is Bad", description: "A blog post about markups", price: null, mainImageUrl: null }
Output: {
  "verdict": "not_a_product",
  "confidence": 0.95,
  "productCategory": "Blog article",
  "reasoning": "The scraped page is a blog article about dropshipping, not a purchasable product. No price, no product image, title reads as an article headline.",
  "reasoningSignals": ["Title reads as an article headline, not a product name", "No price detected", "No product image"],
  "missingSignals": [],
  "redFlags": [],
  "aliexpressKeywords": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "The CapBlast", price: 34.99, description: "Pop beer bottle caps right off and send them flying. Mounts on the bottle top. Fun party gadget." }
Output: {
  "verdict": "dropship",
  "confidence": 0.85,
  "productCategory": "Bottle cap launcher",
  "reasoning": "Generic novelty gadget with a brand-name title that reveals nothing about the product. The description reveals it's a bottle-top mounted cap-launching device — widely available on AliExpress for $3-8.",
  "reasoningSignals": ["Brand name title hides product identity", "Party gadget category typical of dropship", "No brand backstory or manufacturer mentioned"],
  "missingSignals": ["No shipping timeframe"],
  "redFlags": ["Brand-name-only title", "Generic party gadget"],
  "aliexpressKeywords": ["bottle cap launcher", "beer cap shooter", "bottle opener catapult", "cap flying opener"],
  "estimatedStorePriceUsd": 34.99,
  "estimatedSupplierPriceUsd": 5,
  "estimatedMarkupPercent": 600
}

Input: { title: "Premium Galaxy LED Projector — 50% OFF Today!", price: 79.99, description: "Hurry, sale ends soon. Free worldwide shipping. 2-4 weeks delivery." }
Output: {
  "verdict": "dropship",
  "confidence": 0.88,
  "productCategory": "LED Galaxy Projector",
  "reasoning": "Generic gadget with urgency timer marketing, vague brand, and 2-4 week shipping from overseas — all classic dropship signals. Price is heavily marked up vs. typical $5-15 supplier cost.",
  "reasoningSignals": ["Urgency timer ('50% OFF Today', 'sale ends soon')", "2-4 week delivery suggests overseas drop-shipping", "Generic product category widely sold on AliExpress", "No brand identity visible in scrape"],
  "missingSignals": ["No brand About page text", "No manufacturer name"],
  "redFlags": ["Urgency timer", "Overseas shipping", "Generic branding"],
  "aliexpressKeywords": ["galaxy led star projector", "night light galaxy projector", "led star ceiling projector"],
  "estimatedStorePriceUsd": 79.99,
  "estimatedSupplierPriceUsd": 12,
  "estimatedMarkupPercent": 567
}

Input: { title: "Men's Tree Runners — Sustainable Sneakers | Allbirds", price: 98, description: "Eucalyptus tree fiber. Machine washable. Certified B-Corp." }
Output: {
  "verdict": "legit",
  "confidence": 0.92,
  "productCategory": "Sustainable sneakers",
  "reasoning": "Recognized DTC brand (Allbirds) with proprietary materials and brand identity. Price consistent with their retail. No dropship markup signals.",
  "reasoningSignals": ["Known DTC brand 'Allbirds' in title", "Proprietary material (eucalyptus tree fiber)", "B-Corp certification mentioned"],
  "missingSignals": [],
  "redFlags": [],
  "aliexpressKeywords": ["sustainable sneakers", "wool running shoes", "eco sneakers men"],
  "estimatedStorePriceUsd": 98,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "Some Product", price: null, description: "", mainImageUrl: null }
Output: {
  "verdict": "insufficient_evidence",
  "confidence": 0.3,
  "productCategory": "Unknown",
  "reasoning": "Scrape returned almost no data — title is generic, no price, no description, no image. Cannot judge dropship likelihood from this.",
  "reasoningSignals": ["Title is generic ('Some Product')"],
  "missingSignals": ["No price", "No description", "No product image"],
  "redFlags": [],
  "aliexpressKeywords": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}`;

function buildUserPrompt(
  attributes: ScrapedProductAttributes,
  markdownExcerpt: string,
  storePriceUsd: number | null,
): string {
  return JSON.stringify(
    {
      sourceUrl: attributes.sourceUrl,
      scrapeProvider: attributes.provider,
      title: attributes.title,
      description: attributes.description.slice(0, 600),
      mainImageUrl: attributes.mainImageUrl,
      detectedStorePriceUsd: storePriceUsd,
      markdownExcerpt: markdownExcerpt.slice(0, 2000),
    },
    null,
    2,
  );
}

function countAttributeSignals(
  attributes: ScrapedProductAttributes,
  storePriceUsd: number | null,
): number {
  let count = 0;
  if (attributes.title.length > 5) count += 1;
  if (storePriceUsd !== null && storePriceUsd > 0) count += 1;
  if (attributes.description.length > 50) count += 1;
  if (attributes.mainImageUrl !== null) count += 1;
  return count;
}

function isValidVerdict(value: unknown): value is DropshipVerdict {
  return (
    value === "dropship" ||
    value === "legit" ||
    value === "insufficient_evidence" ||
    value === "not_a_product"
  );
}

function applyClamps(
  prediction: DropshipPrediction,
  attributeCount: number,
): DropshipPrediction {
  let { verdict, confidence } = prediction;

  // Empty reasoningSignals → demote to insufficient_evidence (rule 2)
  if (
    prediction.reasoningSignals.length === 0 &&
    (verdict === "dropship" || verdict === "legit")
  ) {
    verdict = "insufficient_evidence";
    confidence = Math.min(confidence, 0.4);
  }

  // Sparse scrape → cannot output high-confidence dropship/legit (rule 7)
  if (attributeCount < 3 && (verdict === "dropship" || verdict === "legit")) {
    confidence = Math.min(confidence, 0.5);
  }

  // insufficient_evidence must be in 0.2..0.5 (rule 3)
  if (verdict === "insufficient_evidence") {
    confidence = Math.min(0.5, Math.max(0.2, confidence));
  }

  // not_a_product clears price estimates and keywords
  if (verdict === "not_a_product") {
    return {
      ...prediction,
      verdict,
      confidence,
      isLikelyDropship: false,
      aliexpressKeywords: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    };
  }

  return {
    ...prediction,
    verdict,
    confidence,
    isLikelyDropship: verdict === "dropship",
  };
}

function parsePrediction(
  raw: string,
  attributeCount: number,
): DropshipPrediction | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (
      typeof parsed.confidence !== "number" ||
      typeof parsed.productCategory !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      return null;
    }

    // Back-compat: older prompts returned isLikelyDropship boolean only.
    // Derive verdict if missing.
    let verdict: DropshipVerdict;
    if (isValidVerdict(parsed.verdict)) {
      verdict = parsed.verdict;
    } else if (typeof parsed.isLikelyDropship === "boolean") {
      verdict = parsed.isLikelyDropship ? "dropship" : "legit";
    } else {
      return null;
    }

    const reasoningSignals = Array.isArray(parsed.reasoningSignals)
      ? parsed.reasoningSignals.filter((s): s is string => typeof s === "string")
      : [];

    const missingSignals = Array.isArray(parsed.missingSignals)
      ? parsed.missingSignals.filter((s): s is string => typeof s === "string")
      : [];

    const aliexpressKeywords = Array.isArray(parsed.aliexpressKeywords)
      ? parsed.aliexpressKeywords.filter((s): s is string => typeof s === "string")
      : [];

    const prediction: DropshipPrediction = {
      verdict,
      isLikelyDropship: verdict === "dropship",
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      productCategory: parsed.productCategory,
      reasoning: parsed.reasoning,
      reasoningSignals,
      missingSignals,
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.filter((f): f is string => typeof f === "string")
        : [],
      aliexpressKeywords,
      estimatedStorePriceUsd:
        typeof parsed.estimatedStorePriceUsd === "number"
          ? parsed.estimatedStorePriceUsd
          : null,
      estimatedSupplierPriceUsd:
        typeof parsed.estimatedSupplierPriceUsd === "number"
          ? parsed.estimatedSupplierPriceUsd
          : null,
      estimatedMarkupPercent:
        typeof parsed.estimatedMarkupPercent === "number"
          ? parsed.estimatedMarkupPercent
          : null,
    };

    return applyClamps(prediction, attributeCount);
  } catch {
    return null;
  }
}

export async function verifyDropshipLikelihood(params: {
  attributes: ScrapedProductAttributes;
  markdownExcerpt: string;
  storePriceUsd: number | null;
}): Promise<DropshipVerificationResult> {
  let clientModel = process.env.GOOGLE_AI_MODEL ?? "gemini-3.5-flash";
  const attributeCount = countAttributeSignals(params.attributes, params.storePriceUsd);

  try {
    const client = getAIClient();
    clientModel = client.activeModel;

    const completion = await client.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(
            params.attributes,
            params.markdownExcerpt,
            params.storePriceUsd,
          ),
        },
      ],
      maxTokens: 8192,
      temperature: 0.1,
      jsonMode: true,
    });

    const prediction = parsePrediction(completion.content, attributeCount);

    return {
      prediction,
      provider: completion.provider,
      model: completion.model,
      rawResponse: completion.content,
      error: prediction ? null : "AI response could not be parsed as structured JSON.",
    };
  } catch (err) {
    return {
      prediction: null,
      provider: "google",
      model: clientModel,
      rawResponse: "",
      error: err instanceof Error ? err.message : "AI verification failed.",
    };
  }
}
