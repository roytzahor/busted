"use client";

/**
 * Cache performance panel — Sprint 9 Stage 16.
 *
 * Pulls /api/monitoring/cache (row count, total size, hit count, oldest row,
 * TTL) for every cache table and renders a compact card-per-table list.
 * Refreshes every 60 s — heavier than the 30 s probe cadence on purpose, since
 * pg_total_relation_size is non-trivial and these stats change slowly.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CacheTableStats {
  table: string;
  label: string;
  rows: number;
  hits: number;
  totalSizeBytes: number;
  oldestCreatedAt: string | null;
  ttlDays: number;
}

interface CacheStatsResponse {
  tables: CacheTableStats[];
  generatedAt: string;
}

function monitoringHeaders(): HeadersInit {
  const secret = process.env.NEXT_PUBLIC_MONITORING_SECRET;
  return {
    "Content-Type": "application/json",
    ...(secret ? { "x-monitoring-secret": secret } : {}),
  };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hitsPerRow(table: CacheTableStats): number {
  if (table.rows === 0) return 0;
  return table.hits / table.rows;
}

export function CacheStats() {
  const [data, setData] = useState<CacheStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/monitoring/cache", {
        method: "GET",
        headers: monitoringHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as CacheStatsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const tables = data?.tables ?? [];
  const maxHits = Math.max(1, ...tables.map((t) => t.hits));

  return (
    <section aria-labelledby="cache-stats-heading" className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-2">
            <Database className="size-4 text-primary" aria-hidden="true" />
          </div>
          <h2
            id="cache-stats-heading"
            className="text-lg font-black tracking-tight sm:text-xl"
          >
            Cache Performance
          </h2>
          {data ? (
            <Badge
              variant="outline"
              className="border-white/15 font-mono text-[10px] text-muted-foreground"
            >
              {new Date(data.generatedAt).toLocaleTimeString()}
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-white/10 hover:border-white/20"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh cache stats"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden="true" />
          )}
          <span className="ml-1.5 hidden sm:inline">Refresh</span>
        </Button>
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {tables.length === 0 && !loading && !error ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground">
            No cache stats yet.
          </div>
        ) : null}

        {tables.map((t) => {
          const hitWidth = `${Math.min(100, (t.hits / maxHits) * 100)}%`;
          return (
            <div
              key={t.table}
              className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:border-white/12"
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">{t.table}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span>{t.rows.toLocaleString()} rows</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{formatBytes(t.totalSizeBytes)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>oldest {formatAge(t.oldestCreatedAt)}</span>
                  {t.ttlDays > 0 ? (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>TTL {t.ttlDays}d</span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Hit bar — only meaningful when hits are tracked */}
              {t.hits > 0 ? (
                <div className="space-y-1">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-success/60 to-success",
                      )}
                      style={{ width: hitWidth }}
                    />
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      {t.hits.toLocaleString()} cache hits
                    </span>
                    <span className="font-mono text-muted-foreground/70">
                      avg {hitsPerRow(t).toFixed(1)} hits/row
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/50">
                  Hit counts not tracked on this table.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
