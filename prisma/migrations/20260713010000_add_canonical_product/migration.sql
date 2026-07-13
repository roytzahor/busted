-- CreateTable
CREATE TABLE "CanonicalProduct" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "networks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductEmbedding" ADD COLUMN "canonicalId" TEXT,
ADD COLUMN "canonicalDistance" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "CanonicalProduct_memberCount_idx" ON "CanonicalProduct"("memberCount");

-- CreateIndex
CREATE INDEX "ProductEmbedding_canonicalId_idx" ON "ProductEmbedding"("canonicalId");

-- AddForeignKey
ALTER TABLE "ProductEmbedding" ADD CONSTRAINT "ProductEmbedding_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
