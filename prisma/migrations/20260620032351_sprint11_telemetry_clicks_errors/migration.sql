-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "sessionId" TEXT NOT NULL,
    "scanId" TEXT,
    "surface" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "surface" TEXT NOT NULL DEFAULT 'web',
    "sessionId" TEXT,
    "targetHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientError" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "errorHash" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT NOT NULL,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryEvent_name_createdAt_idx" ON "TelemetryEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_sessionId_createdAt_idx" ON "TelemetryEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_scanId_idx" ON "TelemetryEvent"("scanId");

-- CreateIndex
CREATE INDEX "AffiliateClick_scanId_idx" ON "AffiliateClick"("scanId");

-- CreateIndex
CREATE INDEX "AffiliateClick_createdAt_idx" ON "AffiliateClick"("createdAt");

-- CreateIndex
CREATE INDEX "ClientError_errorHash_createdAt_idx" ON "ClientError"("errorHash", "createdAt");

-- CreateIndex
CREATE INDEX "ClientError_createdAt_idx" ON "ClientError"("createdAt");
