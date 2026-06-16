/**
 * Image-based product match scoring.
 *
 * Given a scraped product image and a small set of AliExpress candidate images,
 * asks Gemini Vision: "which candidate is the SAME product with the SAME function?"
 *
 * This is the layer that catches "bottle cap pop opener" vs "bottle cap launcher" —
 * cases where titles are similar but the product itself does something different.
 *
 * Runs in a single multimodal call (1 source + up to 3 candidates = 4 images).
 * Gracefully degrades to `null` if anything fails — never breaks the pipeline.
 */

import { GoogleGenerativeAI, type Part } from "@google/generative-ai";

export interface ImageMatchCandidate {
  id: string;
  title: string;
  imageUrl: string | null | undefined;
}

export interface ImageMatchInput {
  sourceTitle: string;
  sourceImageUrl: string | null | undefined;
  candidates: ImageMatchCandidate[];
  modelName?: string;
}

export interface ImageMatchScore {
  candidateId: string;
  score: number;
  sameProduct: boolean;
  sameFunction: boolean;
  reasoning: string;
}

export interface ImageMatchResult {
  bestCandidateId: string | null;
  bestScore: number;
  rejectionReason: string | null;
  scores: ImageMatchScore[];
  model: string;
  rawResponse: string;
  error: string | null;
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MODEL = "gemini-3.5-flash";

const SYSTEM_PROMPT = `You are a product-matching vision expert for Busted, a dropship-detection tool.
You are given ONE source product image (from a retail store) and several CANDIDATE images (from AliExpress).
Your job is to determine which candidate, if any, is the SAME PRODUCT WITH THE SAME FUNCTION as the source.

Two products that look similar but operate differently are NOT a match.
Examples of NON-matches that share keywords but are functionally different:
- Manual hand-operated bottle cap opener vs. spring-loaded cap launcher (different mechanism)
- USB-powered desk fan vs. handheld battery fan (different form factor and use)
- Leather watch strap vs. metal watch strap (different material — if user clearly bought leather)
- LED candle vs. real beeswax candle (one is electric, one is wax)

Return ONLY valid JSON matching this schema:
{
  "scores": [
    {
      "candidateIndex": number,        // 0-based index into the candidates array
      "score": number,                  // 0..1 — how confident this is the same product with the same function
      "sameProduct": boolean,           // is it visually the same product category?
      "sameFunction": boolean,          // does it operate the same way / serve the same use?
      "reasoning": string               // 1 sentence citing what you see
    }
  ],
  "bestCandidateIndex": number | null,  // index of the best match, or null if NONE match well
  "rejectionReason": string | null      // if bestCandidateIndex is null, why none qualified
}

Hard rules:
- score >= 0.7 requires BOTH sameProduct AND sameFunction to be true.
- If no candidate has both sameProduct AND sameFunction true, set bestCandidateIndex=null and explain in rejectionReason.
- Never invent details you cannot see — if an image is too blurry or ambiguous, say so in reasoning and use a low score.
- Be skeptical: when in doubt, reject. A wrong supplier shown to a customer is worse than no supplier.`;

interface FetchedImage {
  candidate: ImageMatchCandidate;
  index: number;
  data: string;
  mimeType: string;
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Busted/1.0 image-match)" },
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

function parseResult(
  raw: string,
  candidates: ImageMatchCandidate[],
  candidateIndexById: Map<string, number>,
): Pick<ImageMatchResult, "bestCandidateId" | "bestScore" | "rejectionReason" | "scores"> | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
  const scores: ImageMatchScore[] = [];

  for (const entry of rawScores) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const idx = typeof e.candidateIndex === "number" ? e.candidateIndex : -1;
    const candidate = candidates[idx];
    if (!candidate) continue;
    scores.push({
      candidateId: candidate.id,
      score: typeof e.score === "number" ? Math.min(1, Math.max(0, e.score)) : 0,
      sameProduct: e.sameProduct === true,
      sameFunction: e.sameFunction === true,
      reasoning: typeof e.reasoning === "string" ? e.reasoning : "",
    });
  }

  const bestIdx =
    typeof parsed.bestCandidateIndex === "number" ? parsed.bestCandidateIndex : null;
  const bestCandidate = bestIdx !== null ? candidates[bestIdx] : null;
  const bestScoreEntry = bestCandidate
    ? scores.find((s) => s.candidateId === bestCandidate.id)
    : null;

  return {
    bestCandidateId: bestCandidate?.id ?? null,
    bestScore: bestScoreEntry?.score ?? 0,
    rejectionReason:
      typeof parsed.rejectionReason === "string" ? parsed.rejectionReason : null,
    scores,
  };
}

export async function compareProductImagesWithAI(
  input: ImageMatchInput,
): Promise<ImageMatchResult | null> {
  if (!input.sourceImageUrl) return null;
  if (input.candidates.length === 0) return null;

  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelName =
    input.modelName ?? process.env.GOOGLE_AI_MODEL ?? DEFAULT_MODEL;

  // Fetch all images in parallel; drop failures
  const sourceFetch = fetchImageAsBase64(input.sourceImageUrl);
  const candidateFetches = await Promise.all(
    input.candidates.map(async (c, index) => {
      if (!c.imageUrl) return null;
      const img = await fetchImageAsBase64(c.imageUrl);
      return img ? ({ candidate: c, index, ...img } satisfies FetchedImage) : null;
    }),
  );

  const sourceImg = await sourceFetch;
  if (!sourceImg) {
    return {
      bestCandidateId: null,
      bestScore: 0,
      rejectionReason: "Could not fetch source product image.",
      scores: [],
      model: modelName,
      rawResponse: "",
      error: "source_image_fetch_failed",
    };
  }

  const usableCandidates = candidateFetches.filter(
    (c): c is FetchedImage => c !== null,
  );
  if (usableCandidates.length === 0) {
    return {
      bestCandidateId: null,
      bestScore: 0,
      rejectionReason: "Could not fetch any candidate product images.",
      scores: [],
      model: modelName,
      rawResponse: "",
      error: "all_candidate_images_failed",
    };
  }

  // Rebuild compact candidate list passed to the model in the order we fetched
  const orderedCandidates: ImageMatchCandidate[] = usableCandidates.map(
    (c) => c.candidate,
  );
  const candidateIndexById = new Map(
    orderedCandidates.map((c, i) => [c.id, i] as const),
  );

  const parts: Part[] = [
    {
      text: `Source product (from retail store):\nTitle: ${input.sourceTitle.slice(0, 200)}`,
    },
    { inlineData: { mimeType: sourceImg.mimeType, data: sourceImg.data } },
  ];

  usableCandidates.forEach((c, i) => {
    parts.push({
      text: `\nCandidate ${i} (from AliExpress):\nTitle: ${c.candidate.title.slice(0, 200)}`,
    });
    parts.push({ inlineData: { mimeType: c.mimeType, data: c.data } });
  });

  parts.push({
    text: "\nReturn the JSON matching the schema above. Be strict about same-function.",
  });

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

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const text = result.response.text();

    const parsed = parseResult(text, orderedCandidates, candidateIndexById);
    if (!parsed) {
      return {
        bestCandidateId: null,
        bestScore: 0,
        rejectionReason: "Image-match AI returned unparseable JSON.",
        scores: [],
        model: modelName,
        rawResponse: text,
        error: "parse_failed",
      };
    }

    return {
      ...parsed,
      model: modelName,
      rawResponse: text,
      error: null,
    };
  } catch (err) {
    return {
      bestCandidateId: null,
      bestScore: 0,
      rejectionReason: null,
      scores: [],
      model: modelName,
      rawResponse: "",
      error: err instanceof Error ? err.message : "Image-match AI call failed.",
    };
  }
}

export function isImageMatchEnabled(): boolean {
  return process.env.IMAGE_MATCH_ENABLED !== "false";
}
