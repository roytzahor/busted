/**
 * Batch image rerank — Stage 2 of the match verification funnel.
 *
 * Sends the source product image + N candidate thumbnails to Gemini in
 * ONE multimodal call, asking the model to rate each candidate on
 * "same product type + same function" from 0-10.
 *
 * Cheaper than running compareProductImagesWithAI per-candidate, and
 * lets us cull a pool of 10-15 candidates down to the top 3-4 BEFORE
 * the deep verification step. Without this, the deep verifier would
 * either be wasteful (run on 10) or miss good candidates (run on 3).
 *
 * Returns null on any failure (image fetch, API error, parse failure)
 * so the pipeline can fall back to text-based ranking only.
 */

import { GoogleGenerativeAI, type Part } from "@google/generative-ai";

import { flashModel } from "./models";

export interface RerankCandidate {
  id: string;
  title: string;
  imageUrl: string | null | undefined;
}

export interface RerankInput {
  sourceTitle: string;
  sourceImageUrl: string;
  candidates: RerankCandidate[];
  modelName?: string;
}

export interface CandidateRerank {
  candidateId: string;
  /** 0..10 rating, higher = more likely same product + same function */
  rating: number;
  /** Brief reason cited from the image */
  reason: string;
}

export interface RerankResult {
  ratings: CandidateRerank[];
  model: string;
  rawResponse: string;
  error: string | null;
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_CANDIDATES = 12;

const SYSTEM_PROMPT = `You are a product matching expert. Given a source product image and several candidate images from AliExpress, rate each candidate on how likely it is the SAME PRODUCT with the SAME FUNCTION as the source.

Rating scale 0-10:
- 10: same product, same function, same form factor (high confidence)
- 7-9: very likely same product (minor visual differences possible)
- 4-6: same product category but different specific item or function
- 1-3: related category but clearly different product
- 0: not the same product at all

Be strict about "same function". A manual bottle cap opener and a spring-loaded cap launcher both open bottle caps but operate differently — that's a 3, not a 7.

Return ONLY valid JSON:
{
  "ratings": [
    { "candidateIndex": 0, "rating": 8, "reason": "Same bottle-top mounted lever design" },
    { "candidateIndex": 1, "rating": 2, "reason": "Pistol-style launcher, different mechanism" }
  ]
}

Hard rules:
- One entry per candidate, in order.
- Ratings >= 7 require BOTH same product AND same function.
- If a candidate image was missing or unviewable, give it rating 0 with reason "no image".`;

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Busted/1.0 image-rerank)" },
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

interface FetchedCandidate {
  candidate: RerankCandidate;
  index: number;
  image: { data: string; mimeType: string };
}

function parseRatings(
  raw: string,
  candidates: RerankCandidate[],
): CandidateRerank[] | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!Array.isArray(parsed.ratings)) return null;

  const ratings: CandidateRerank[] = [];
  for (const entry of parsed.ratings) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const idx = typeof e.candidateIndex === "number" ? e.candidateIndex : -1;
    const candidate = candidates[idx];
    if (!candidate) continue;
    ratings.push({
      candidateId: candidate.id,
      rating: typeof e.rating === "number" ? Math.max(0, Math.min(10, e.rating)) : 0,
      reason: typeof e.reason === "string" ? e.reason : "",
    });
  }
  return ratings;
}

export async function rerankCandidatesByImage(
  input: RerankInput,
): Promise<RerankResult | null> {
  if (input.candidates.length === 0) return null;

  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelName = input.modelName ?? flashModel();

  // Cap at MAX_CANDIDATES so the multimodal call stays within token budget
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);

  // Fetch source + all candidate images in parallel
  const sourceFetch = fetchImageAsBase64(input.sourceImageUrl);
  const candidateFetches = await Promise.all(
    candidates.map(async (c, index): Promise<FetchedCandidate | null> => {
      if (!c.imageUrl) return null;
      const img = await fetchImageAsBase64(c.imageUrl);
      return img ? { candidate: c, index, image: img } : null;
    }),
  );

  const sourceImg = await sourceFetch;
  if (!sourceImg) {
    return {
      ratings: [],
      model: modelName,
      rawResponse: "",
      error: "Source image fetch failed",
    };
  }

  const usable = candidateFetches.filter((c): c is FetchedCandidate => c !== null);
  if (usable.length === 0) {
    return {
      ratings: [],
      model: modelName,
      rawResponse: "",
      error: "All candidate image fetches failed",
    };
  }

  // Re-index for the model — the indices in the prompt match `usable.length`,
  // not the original candidate array. We map back to candidateId in parse.
  const orderedForModel = usable.map((u) => u.candidate);

  const parts: Part[] = [
    {
      text: `SOURCE product (from a retail store):\nTitle: ${input.sourceTitle.slice(0, 200)}`,
    },
    { inlineData: { mimeType: sourceImg.mimeType, data: sourceImg.data } },
  ];

  usable.forEach((u, i) => {
    parts.push({
      text: `\nCandidate ${i} (AliExpress):\nTitle: ${u.candidate.title.slice(0, 200)}`,
    });
    parts.push({ inlineData: { mimeType: u.image.mimeType, data: u.image.data } });
  });

  parts.push({
    text: `\nRate all ${usable.length} candidates 0-10 on same-product + same-function. Return the JSON.`,
  });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const text = result.response.text();

    const ratings = parseRatings(text, orderedForModel);
    if (!ratings) {
      return { ratings: [], model: modelName, rawResponse: text, error: "Unparseable JSON" };
    }

    return { ratings, model: modelName, rawResponse: text, error: null };
  } catch (e) {
    return {
      ratings: [],
      model: modelName,
      rawResponse: "",
      error: e instanceof Error ? e.message : "Rerank call failed",
    };
  }
}

export const RERANK_KEEP_THRESHOLD = 6;
