-- The @unique constraint on originalUrl already creates a unique index that
-- serves all lookups; the extra plain index doubled write-side maintenance.
DROP INDEX "VerifiedProductMap_originalUrl_idx";
