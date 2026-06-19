-- CreateTable
CREATE TABLE "ScannedProduct" (
    "id" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "scrapeData" JSONB,
    "aiPrediction" JSONB,
    "aliexpressUrl" TEXT,
    "aliexpressData" JSONB,
    "events" JSONB,
    "lastScrapedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageCache" (
    "key" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttl" INTEGER NOT NULL DEFAULT 1209600,

    CONSTRAINT "StageCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "totalSavingsUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreprocessedImage" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "processedImage" BYTEA NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'jpg',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "payloadBytes" INTEGER NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreprocessedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scannedProductId" TEXT NOT NULL,
    "savingsUsd" DECIMAL(10,2),
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScannedProduct_originalUrl_key" ON "ScannedProduct"("originalUrl");

-- CreateIndex
CREATE INDEX "ScannedProduct_originalUrl_idx" ON "ScannedProduct"("originalUrl");

-- CreateIndex
CREATE INDEX "ScannedProduct_lastScrapedAt_idx" ON "ScannedProduct"("lastScrapedAt");

-- CreateIndex
CREATE INDEX "StageCache_stage_createdAt_idx" ON "StageCache"("stage", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PreprocessedImage_cacheKey_key" ON "PreprocessedImage"("cacheKey");

-- CreateIndex
CREATE INDEX "PreprocessedImage_cacheKey_idx" ON "PreprocessedImage"("cacheKey");

-- CreateIndex
CREATE INDEX "PreprocessedImage_createdAt_idx" ON "PreprocessedImage"("createdAt");

-- CreateIndex
CREATE INDEX "PreprocessedImage_productCategory_idx" ON "PreprocessedImage"("productCategory");

-- CreateIndex
CREATE INDEX "SearchHistory_userId_searchedAt_idx" ON "SearchHistory"("userId", "searchedAt");

-- CreateIndex
CREATE INDEX "SearchHistory_scannedProductId_idx" ON "SearchHistory"("scannedProductId");

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_scannedProductId_fkey" FOREIGN KEY ("scannedProductId") REFERENCES "ScannedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
