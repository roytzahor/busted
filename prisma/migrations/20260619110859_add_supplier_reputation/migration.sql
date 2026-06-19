-- CreateTable
CREATE TABLE "SupplierReputation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shipToCountry" TEXT NOT NULL,
    "linkFailures" INTEGER NOT NULL DEFAULT 0,
    "linkSuccesses" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReputation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierReputation_productId_idx" ON "SupplierReputation"("productId");

-- CreateIndex
CREATE INDEX "SupplierReputation_shipToCountry_lastCheckedAt_idx" ON "SupplierReputation"("shipToCountry", "lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReputation_productId_shipToCountry_key" ON "SupplierReputation"("productId", "shipToCountry");
