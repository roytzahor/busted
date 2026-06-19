-- AlterTable
ALTER TABLE "PreprocessedImage" ADD COLUMN     "materialTokens" JSONB,
ADD COLUMN     "ocrTraces" JSONB,
ADD COLUMN     "technicalSpecs" JSONB;

-- CreateTable
CREATE TABLE "FetchedPage" (
    "cacheKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "html" BYTEA,
    "markdown" BYTEA,
    "source" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FetchedPage_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "FetchedPage_url_key" ON "FetchedPage"("url");

-- CreateIndex
CREATE INDEX "FetchedPage_url_idx" ON "FetchedPage"("url");

-- CreateIndex
CREATE INDEX "FetchedPage_createdAt_idx" ON "FetchedPage"("createdAt");
