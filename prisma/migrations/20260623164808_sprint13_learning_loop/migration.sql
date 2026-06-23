-- CreateTable
CREATE TABLE "MatchOutcome" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "domain" TEXT NOT NULL,
    "category" TEXT,
    "vertical" TEXT,
    "scrapeProvider" TEXT,
    "verdict" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchQuality" TEXT,
    "bestEffortOnly" BOOLEAN NOT NULL DEFAULT false,
    "winningKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageMatchScore" DOUBLE PRECISION,
    "sameFunction" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchFeedback" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "verdict" TEXT NOT NULL,
    "note" VARCHAR(280),
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainScrapeRecipe" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "preferredProvider" TEXT,
    "skipProvider" TEXT,
    "providerWinRates" JSONB,
    "totalScans" INTEGER NOT NULL DEFAULT 0,
    "successfulScans" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainScrapeRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerticalKeywordPrior" (
    "id" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "topKeywords" JSONB,
    "bannedKeywords" JSONB,
    "imageMatchThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "textConfidenceMin" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "totalSamples" INTEGER NOT NULL DEFAULT 0,
    "positiveSamples" INTEGER NOT NULL DEFAULT 0,
    "bestEffortClickRate" DOUBLE PRECISION,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerticalKeywordPrior_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchOutcome_domain_createdAt_idx" ON "MatchOutcome"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "MatchOutcome_vertical_createdAt_idx" ON "MatchOutcome"("vertical", "createdAt");

-- CreateIndex
CREATE INDEX "MatchOutcome_scrapeProvider_createdAt_idx" ON "MatchOutcome"("scrapeProvider", "createdAt");

-- CreateIndex
CREATE INDEX "MatchOutcome_createdAt_idx" ON "MatchOutcome"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFeedback_scanId_key" ON "MatchFeedback"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFeedback_outcomeId_key" ON "MatchFeedback"("outcomeId");

-- CreateIndex
CREATE INDEX "MatchFeedback_verdict_createdAt_idx" ON "MatchFeedback"("verdict", "createdAt");

-- CreateIndex
CREATE INDEX "MatchFeedback_createdAt_idx" ON "MatchFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainScrapeRecipe_domain_key" ON "DomainScrapeRecipe"("domain");

-- CreateIndex
CREATE INDEX "DomainScrapeRecipe_domain_idx" ON "DomainScrapeRecipe"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "VerticalKeywordPrior_vertical_key" ON "VerticalKeywordPrior"("vertical");

-- CreateIndex
CREATE INDEX "VerticalKeywordPrior_vertical_idx" ON "VerticalKeywordPrior"("vertical");

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "MatchOutcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;
