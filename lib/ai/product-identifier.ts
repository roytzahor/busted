/**
 * ProductIdentifier — uses Gemini Vision on the scraped product image
 * plus title/description text to identify what the product canonically IS
 * and DOES.
 *
 * This is the keystone of the accuracy redesign. Today, search keywords
 * come from the AI verdict step which only sees text — so "The CapBlast"
 * becomes "capblast" and returns pistol-shaped launchers instead of the
 * bottle-top mounted lever the user actually photographed.
 *
 * Identifier output (`ProductIdentity`) is downstream of the scrape but
 * upstream of everything else. CandidateSearch will use its keywords;
 * DropshipVerdict will use its category; MatchVerifier will use its
 * canonical name + visual features.
 *
 * Gracefully degrades to text-only mode if the image can't be fetched.
 */

import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { ProductIdentity } from "@/lib/services/types";

import { flashModel } from "./models";

export const IDENTIFIER_PROMPT_VERSION = "v1";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a product cataloger for Busted, a tool that finds the AliExpress source of dropshipped products.

Given a store listing (image + title + description), identify the underlying GENERIC product. The goal is to produce search terms that an AliExpress seller would actually use — NOT the dropshipper's brand name.

Ignore:
- Brand names (e.g. "The CapBlast" → focus on what it does, not the brand)
- Marketing copy ("revolutionary", "premium", "limited time")
- Color/material variants if not relevant to identity

Focus on:
- What IS this object (concrete product category)
- What does it DO (mechanism, function, use case)
- What visual features distinguish it
- What generic English terms an AliExpress catalog would use

Return ONLY valid JSON matching this exact schema:
{
  "canonicalName": string,           // e.g. "spring-loaded bottle cap launcher" — never the brand
  "category": string,                // e.g. "Toys & Hobbies > Novelty Gadgets"
  "productType": string,             // e.g. "handheld launcher"
  "functionDescription": string,     // 1 sentence: what it does, how it works
  "visualFeatures": string[],        // 2-5 concrete features visible in the image (or null if no image)
  "materialGuess": string | null,    // primary material if observable, else null
  "searchKeywords": {
    "primary": string[],             // 2-3 best AliExpress search terms (most specific)
    "fallback": string[],            // 2-3 broader category terms (used if pool small)
    "visualTerms": string[]          // 2-3 visual-grounded terms (e.g. "spring loaded launcher")
  },
  "confidence": number,              // 0..1, your certainty about this identity
  "notes": string                    // 1 sentence citing what in the input drove this
}

HARD RULES:
1. canonicalName MUST NOT be the brand name. If the title is "The CapBlast", canonicalName is something like "bottle cap launcher", not "CapBlast".
2. searchKeywords.primary terms MUST be terms a Chinese AliExpress seller would actually list — generic, functional, English.
3. Confidence drops if image is missing or unclear. Without an image, max confidence is 0.6.
4. visualFeatures must come from what you SEE in the image. If no image, return empty array.
5. If you genuinely cannot identify the product (image too generic, title gibberish, no usable signals), set confidence < 0.3 and explain why in notes.`;

interface IdentifierInput {
  title: string;
  description: string;
  imageUrl: string | null | undefined;
  markdownExcerpt: string;
  /** When true, skips image fetch and runs text-only mode. */
  textOnly?: boolean;
  modelName?: string;
}

export interface IdentifierResult {
  identity: ProductIdentity | null;
  rawResponse: string;
  model: string;
  error: string | null;
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Busted/1.0 product-identifier)" },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    return { data: buffer.toString("base64"), mimeType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

function parseStringArray(value: unknown, max: number = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, max);
}

function parseIdentity(
  raw: string,
  source: "vision+text" | "text_only_fallback",
): ProductIdentity | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof parsed.canonicalName !== "string" || parsed.canonicalName.trim().length === 0) return null;
  if (typeof parsed.confidence !== "number") return null;

  const kwRaw = (parsed.searchKeywords ?? {}) as Record<string, unknown>;
  const primary = parseStringArray(kwRaw.primary, 5);
  const fallback = parseStringArray(kwRaw.fallback, 5);
  const visualTerms = parseStringArray(kwRaw.visualTerms, 5);

  // No primary keywords → unusable identity
  if (primary.length === 0) return null;

  // Text-only mode caps confidence at 0.6 even if model claims higher
  let confidence = Math.max(0, Math.min(1, parsed.confidence));
  if (source === "text_only_fallback") confidence = Math.min(confidence, 0.6);

  return {
    canonicalName: parsed.canonicalName.trim(),
    category: typeof parsed.category === "string" ? parsed.category : "Unknown",
    productType: typeof parsed.productType === "string" ? parsed.productType : parsed.canonicalName,
    functionDescription:
      typeof parsed.functionDescription === "string" ? parsed.functionDescription : "",
    visualFeatures: parseStringArray(parsed.visualFeatures, 8),
    materialGuess:
      typeof parsed.materialGuess === "string" && parsed.materialGuess.trim().length > 0
        ? parsed.materialGuess
        : null,
    searchKeywords: { primary, fallback, visualTerms },
    confidence,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    source,
  };
}

export async function identifyProduct(input: IdentifierInput): Promise<IdentifierResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  const modelName = input.modelName ?? flashModel();

  if (!apiKey) {
    return { identity: null, rawResponse: "", model: modelName, error: "Missing GOOGLE_AI_API_KEY" };
  }

  // Decide whether to attempt vision or go text-only
  const wantVision = !input.textOnly && Boolean(input.imageUrl);
  const fetchedImage = wantVision && input.imageUrl ? await fetchImageAsBase64(input.imageUrl) : null;
  const isVisionMode = fetchedImage !== null;
  const source: "vision+text" | "text_only_fallback" = isVisionMode ? "vision+text" : "text_only_fallback";

  const userContext = JSON.stringify(
    {
      title: input.title,
      description: input.description.slice(0, 800),
      markdownExcerpt: input.markdownExcerpt.slice(0, 1500),
    },
    null,
    2,
  );

  const parts: Part[] = [
    {
      text: isVisionMode
        ? "Product listing image:"
        : "No product image available — judge from text alone.",
    },
  ];
  if (fetchedImage) {
    parts.push({ inlineData: { mimeType: fetchedImage.mimeType, data: fetchedImage.data } });
  }
  parts.push({ text: `Text context:\n${userContext}` });
  parts.push({ text: "\nReturn the JSON. Cite what you see in `notes`." });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({ contents: [{ role: "user", parts }] });
    const text = result.response.text();

    const identity = parseIdentity(text, source);

    // If vision attempt failed to parse, try text-only retry once
    if (!identity && isVisionMode && !input.textOnly) {
      return identifyProduct({ ...input, textOnly: true });
    }

    return {
      identity,
      rawResponse: text,
      model: modelName,
      error: identity ? null : "Identifier returned unparseable JSON",
    };
  } catch (e) {
    return {
      identity: null,
      rawResponse: "",
      model: modelName,
      error: e instanceof Error ? e.message : "Identifier call failed",
    };
  }
}

export function isIdentifierEnabled(): boolean {
  return process.env.IDENTIFIER_ENABLED !== "false";
}
