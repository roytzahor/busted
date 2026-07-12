-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "network" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "embedding" vector(768),
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductEmbedding_sourceUrl_key" ON "ProductEmbedding"("sourceUrl");

-- CreateIndex
CREATE INDEX "ProductEmbedding_network_idx" ON "ProductEmbedding"("network");

-- CreateIndex
CREATE INDEX "ProductEmbedding_scanId_idx" ON "ProductEmbedding"("scanId");

-- CreateIndex
-- Prisma's schema language can't express vector index methods, so this was
-- applied by hand alongside the generated SQL above. Backfilled here to
-- match what's actually live (verified via pg_indexes on the dev DB).
CREATE INDEX "ProductEmbedding_embedding_hnsw" ON "ProductEmbedding" USING hnsw (embedding vector_cosine_ops);
