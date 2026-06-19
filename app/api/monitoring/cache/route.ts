/**
 * GET /api/monitoring/cache
 *
 * Returns row count, total relation size, hit-count sum, oldest row age,
 * and configured TTL for every cache table. Protected by the same
 * monitoring secret as the rest of /api/monitoring.
 *
 * Sprint 9 Stage 16.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CacheTableStats {
  table: string;
  label: string;
  rows: number;
  hits: number;
  totalSizeBytes: number;
  oldestCreatedAt: string | null;
  ttlDays: number;
}

interface PgSizeRow {
  size: bigint;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.MONITORING_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-monitoring-secret") === secret;
}

async function tableSize(physicalName: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<PgSizeRow[]>(
      `SELECT pg_total_relation_size($1)::bigint AS size`,
      physicalName,
    );
    return rows[0] ? Number(rows[0].size) : 0;
  } catch {
    return 0;
  }
}

async function getStats(): Promise<CacheTableStats[]> {
  // Each row models a single cache table. `physicalName` matches the
  // unquoted Postgres relation name Prisma generates (PascalCase →
  // double-quoted public."ScannedProduct").
  const [
    scannedProductCount,
    fetchedPageStats,
    preprocessedStats,
    stageCacheCount,
    supplierRepCount,
    scannedProductSize,
    fetchedPageSize,
    preprocessedSize,
    stageCacheSize,
    supplierRepSize,
    scannedProductOldest,
    fetchedPageOldest,
    preprocessedOldest,
    stageCacheOldest,
    supplierRepOldest,
    fetchedPageHits,
    preprocessedHits,
  ] = await Promise.all([
    prisma.scannedProduct.count(),
    prisma.fetchedPage.aggregate({ _count: { _all: true }, _sum: { hits: true } }),
    prisma.preprocessedImage.aggregate({ _count: { _all: true }, _sum: { hits: true } }),
    prisma.stageCache.count(),
    prisma.supplierReputation.count(),
    tableSize('"ScannedProduct"'),
    tableSize('"FetchedPage"'),
    tableSize('"PreprocessedImage"'),
    tableSize('"StageCache"'),
    tableSize('"SupplierReputation"'),
    prisma.scannedProduct.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.fetchedPage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.preprocessedImage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.stageCache.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.supplierReputation.findFirst({ orderBy: { lastCheckedAt: "asc" }, select: { lastCheckedAt: true } }),
    prisma.fetchedPage.aggregate({ _sum: { hits: true } }),
    prisma.preprocessedImage.aggregate({ _sum: { hits: true } }),
  ]);

  return [
    {
      table: "ScannedProduct",
      label: "Product analyses",
      rows: scannedProductCount,
      hits: 0, // not tracked per-row on ScannedProduct
      totalSizeBytes: scannedProductSize,
      oldestCreatedAt: scannedProductOldest?.createdAt.toISOString() ?? null,
      ttlDays: 14,
    },
    {
      table: "FetchedPage",
      label: "Raw HTML cache",
      rows: fetchedPageStats._count._all,
      hits: fetchedPageHits._sum.hits ?? 0,
      totalSizeBytes: fetchedPageSize,
      oldestCreatedAt: fetchedPageOldest?.createdAt.toISOString() ?? null,
      ttlDays: 14,
    },
    {
      table: "PreprocessedImage",
      label: "Vision-cleaned images",
      rows: preprocessedStats._count._all,
      hits: preprocessedHits._sum.hits ?? 0,
      totalSizeBytes: preprocessedSize,
      oldestCreatedAt: preprocessedOldest?.createdAt.toISOString() ?? null,
      ttlDays: 30,
    },
    {
      table: "StageCache",
      label: "Per-service stage cache",
      rows: stageCacheCount,
      hits: 0, // not tracked per-row
      totalSizeBytes: stageCacheSize,
      oldestCreatedAt: stageCacheOldest?.createdAt.toISOString() ?? null,
      ttlDays: 14,
    },
    {
      table: "SupplierReputation",
      label: "Affiliate-link reputation",
      rows: supplierRepCount,
      hits: 0,
      totalSizeBytes: supplierRepSize,
      oldestCreatedAt: supplierRepOldest?.lastCheckedAt.toISOString() ?? null,
      ttlDays: 0, // reputation is not TTL'd
    },
  ];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Set X-Monitoring-Secret header." },
      { status: 401 },
    );
  }

  try {
    const tables = await getStats();
    return NextResponse.json({ tables, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[monitoring/cache] query failed", err);
    return NextResponse.json(
      { error: "Failed to gather cache stats." },
      { status: 500 },
    );
  }
}
