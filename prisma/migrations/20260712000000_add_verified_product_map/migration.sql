-- CreateTable
CREATE TABLE "VerifiedProductMap" (
    "id" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "scanId" TEXT,
    "aliexpressProductId" TEXT,
    "aliexpressUrl" TEXT NOT NULL,
    "aliexpressData" JSONB NOT NULL,
    "matchConfidence" DOUBLE PRECISION,
    "matchQuality" TEXT,
    "source" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifiedProductMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedProductMap_originalUrl_key" ON "VerifiedProductMap"("originalUrl");

-- CreateIndex
CREATE INDEX "VerifiedProductMap_originalUrl_idx" ON "VerifiedProductMap"("originalUrl");

-- CreateIndex
CREATE INDEX "VerifiedProductMap_verifiedAt_idx" ON "VerifiedProductMap"("verifiedAt");
