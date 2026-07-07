/**
 * Product embedding index — ROADMAP Phase 2 item 1 (groundwork).
 *
 * Wraps Gemini text embeddings + the pgvector ProductEmbedding table.
 * Decisions locked here: model gemini-embedding-001 truncated to 768 dims
 * via outputDimensionality (MRL; multilingual — covers the Hebrew/EU
 * markets), cosine distance, HNSW index. Called over REST because the
 * repo's @google/generative-ai version doesn't type outputDimensionality.
 *
 * Rules (same as every enhancement stage in this pipeline):
 *   - Never throws into a caller — embed failures return null.
 *   - Kill switch: VECTOR_INDEX_ENABLED === "true" enables lookup use;
 *     default OFF until the index is populated and evaluated.
 *   - Rows are only comparable within one `model` — the query filters on it.
 */

import { prisma } from "@/lib/prisma";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

const EMBED_TIMEOUT_MS = 10_000;

export function isVectorIndexEnabled(): boolean {
  return process.env.VECTOR_INDEX_ENABLED === "true";
}

function apiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GEMINI_API_KEY ??
    null
  );
}

/**
 * Embeds product text (title + category/keywords). Returns null on any
 * failure — callers fall back to the keyword path.
 */
export async function embedProductText(text: string): Promise<number[] | null> {
  const key = apiKey();
  const trimmed = text.trim();
  if (!key || trimmed.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          content: { parts: [{ text: trimmed.slice(0, 2_000) }] },
          outputDimensionality: EMBEDDING_DIMS,
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error(`[embeddings] embedContent HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { embedding?: { values?: number[] } };
    const values = json.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) return null;
    return values;
  } catch (err) {
    console.error("[embeddings] embedContent failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface UpsertEmbeddingInput {
  scanId?: string | null;
  network: "retail" | "aliexpress" | "ebay";
  productId?: string | null;
  title: string;
  sourceUrl: string;
  priceUsd?: number | null;
  imageUrl?: string | null;
  embedding: number[];
}

/** Upserts one listing row (keyed by sourceUrl). Vector goes in via raw SQL. */
export async function upsertProductEmbedding(input: UpsertEmbeddingInput): Promise<void> {
  const vectorLiteral = `[${input.embedding.join(",")}]`;
  await prisma.$executeRaw`
    INSERT INTO "ProductEmbedding"
      ("id", "scanId", "network", "productId", "title", "sourceUrl", "priceUsd", "imageUrl", "embedding", "model")
    VALUES
      (gen_random_uuid()::text, ${input.scanId ?? null}, ${input.network}, ${input.productId ?? null},
       ${input.title}, ${input.sourceUrl}, ${input.priceUsd ?? null}, ${input.imageUrl ?? null},
       ${vectorLiteral}::vector, ${EMBEDDING_MODEL})
    ON CONFLICT ("sourceUrl") DO UPDATE SET
      "title" = EXCLUDED."title",
      "priceUsd" = EXCLUDED."priceUsd",
      "imageUrl" = EXCLUDED."imageUrl",
      "embedding" = EXCLUDED."embedding",
      "model" = EXCLUDED."model"
  `;
}

export interface NearestProduct {
  id: string;
  scanId: string | null;
  network: string;
  productId: string | null;
  title: string;
  sourceUrl: string;
  priceUsd: number | null;
  imageUrl: string | null;
  /** Cosine distance — 0 identical, 2 opposite. */
  distance: number;
}

/**
 * ANN lookup: nearest listings by cosine distance, optionally filtered to
 * one network ("aliexpress" candidates for a retail query, etc.).
 */
export async function findNearestProducts(
  embedding: number[],
  opts: { limit?: number; network?: string } = {},
): Promise<NearestProduct[]> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 25);
  const vectorLiteral = `[${embedding.join(",")}]`;
  if (opts.network) {
    return prisma.$queryRaw<NearestProduct[]>`
      SELECT "id", "scanId", "network", "productId", "title", "sourceUrl",
             "priceUsd", "imageUrl",
             ("embedding" <=> ${vectorLiteral}::vector)::float AS "distance"
      FROM "ProductEmbedding"
      WHERE "embedding" IS NOT NULL AND "model" = ${EMBEDDING_MODEL}
        AND "network" = ${opts.network}
      ORDER BY "embedding" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
  }
  return prisma.$queryRaw<NearestProduct[]>`
    SELECT "id", "scanId", "network", "productId", "title", "sourceUrl",
           "priceUsd", "imageUrl",
           ("embedding" <=> ${vectorLiteral}::vector)::float AS "distance"
    FROM "ProductEmbedding"
    WHERE "embedding" IS NOT NULL AND "model" = ${EMBEDDING_MODEL}
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}
