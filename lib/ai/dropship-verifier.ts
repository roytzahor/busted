import { getAIClient } from "@/lib/ai/client";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";

export interface DropshipPrediction {
  isLikelyDropship: boolean;
  confidence: number;
  productCategory: string;
  reasoning: string;
  redFlags: string[];
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
  "isLikelyDropship": boolean,
  "confidence": number (0-1),
  "productCategory": string,
  "reasoning": string (2-3 sentences),
  "redFlags": string[],
  "estimatedStorePriceUsd": number | null,
  "estimatedSupplierPriceUsd": number | null,
  "estimatedMarkupPercent": number | null
}

Rules:
- Base productCategory and reasoning strictly on the scraped title/description — never invent unrelated products.
- ONLY analyze RETAIL / BRANDED STORES (Shopify, WooCommerce, independent shops). 
- If sourceUrl is AliExpress, Temu, Wish, DHgate, or any wholesale marketplace: set isLikelyDropship=false, confidence=0.98, redFlags=[], and explain the URL is already at supplier level.
- Do NOT flag AliExpress product pages as dropship — they ARE the supplier source.
- Red flags apply to retail stores: inflated sale prices, generic Shopify dropship copy, vague branding, urgency timers, bundle upsells.
- If a store price is provided, estimate supplier cost at 15-35% of store price for typical dropship markups on retail sites only.
- confidence reflects certainty given available data.`;

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

function parsePrediction(raw: string): DropshipPrediction | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (
      typeof parsed.isLikelyDropship !== "boolean" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.productCategory !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      return null;
    }

    return {
      isLikelyDropship: parsed.isLikelyDropship,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      productCategory: parsed.productCategory,
      reasoning: parsed.reasoning,
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.filter((f): f is string => typeof f === "string")
        : [],
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
      maxTokens: 2048,
      temperature: 0,
      jsonMode: true,
    });

    const prediction = parsePrediction(completion.content);

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
