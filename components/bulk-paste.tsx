"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/currency-provider";
import { useT } from "@/components/locale-provider";
import { ProductImage } from "@/components/product-image";
import {
  analyzeProductUrl,
  type AnalyzeClientResult,
} from "@/lib/analyze/client";
import { extractProductUrls, MAX_BULK_URLS } from "@/lib/analyze/extract-urls";
import { appendScan } from "@/lib/scan-history";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Sparkles,
  TrendingDown,
} from "lucide-react";

/**
 * Bulk-paste scan mode. Paste any block of text containing one or more
 * product URLs (WhatsApp forwards, Telegram messages, an email body);
 * we extract up to MAX_BULK_URLS and scan them with bounded concurrency.
 *
 * Result grid reuses the TrendingCard aesthetic for visual consistency
 * with the home page's social-proof rail — same dimensions, same hover
 * treatment, just per-result state (pending / scanning / done / error).
 */

const CONCURRENCY = 3;

type RowStatus = "pending" | "scanning" | "done" | "error";

interface BulkRow {
  id: string;
  url: string;
  status: RowStatus;
  /** Populated when status === "done" and the scan returned comparable savings. */
  result?: {
    scanId?: string;
    title: string;
    imageUrl: string | null;
    storeName: string;
    storePriceUsd?: number;
    supplierPriceUsd?: number;
    savingsPercent?: number;
    mode: AnalyzeClientResult["mode"];
  };
  error?: string;
}

function summariseResult(
  url: string,
  result: AnalyzeClientResult,
): NonNullable<BulkRow["result"]> {
  const comp = result.comparison;
  const drop = result.dropshipAnalysis;
  const browse = result.browse;
  const partial = result.partial;

  const title =
    comp?.storeProduct.title ??
    drop?.storeProduct.title ??
    browse?.storeProduct.title ??
    partial?.storeProduct.title ??
    url;
  const imageUrl =
    comp?.storeProduct.imageUrl ??
    drop?.storeProduct.imageUrl ??
    browse?.storeProduct.imageUrl ??
    partial?.storeProduct.imageUrl ??
    null;
  const storeName =
    comp?.storeProduct.storeName ??
    drop?.storeProduct.storeName ??
    browse?.storeProduct.storeName ??
    partial?.storeProduct.storeName ??
    "";

  return {
    scanId: comp?.scanId ?? drop?.scanId ?? browse?.scanId,
    title,
    imageUrl,
    storeName,
    storePriceUsd: comp?.storeProduct.priceUsd,
    supplierPriceUsd: comp?.supplierProduct.priceUsd,
    savingsPercent: comp?.savingsPercent,
    mode: result.mode,
  };
}

/**
 * Concurrency-limited mapper. We avoid `Promise.all(urls.map(scan))` so a
 * 10-URL paste doesn't hammer the AE API or our own pipeline all at once;
 * `CONCURRENCY=3` keeps it polite while still feeling instantaneous.
 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function BulkPaste({ className }: { className?: string }) {
  const t = useT();
  const formatMoney = useMoney();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [running, setRunning] = useState(false);

  const detected = useMemo(() => extractProductUrls(text), [text]);
  const canRun = detected.length > 0 && !running;

  const doneCount = rows.filter((r) => r.status === "done" || r.status === "error").length;

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    const initialRows: BulkRow[] = detected.map((url, i) => ({
      id: `${i}-${url}`,
      url,
      status: "pending",
    }));
    setRows(initialRows);
    track("bulk_scan_start", { props: { count: detected.length } });

    await mapWithLimit(detected, CONCURRENCY, async (url, idx) => {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, status: "scanning" } : r)),
      );
      try {
        const result = await analyzeProductUrl(url, { debug: false });
        const summary = summariseResult(url, result);
        setRows((prev) =>
          prev.map((r, i) =>
            i === idx ? { ...r, status: "done", result: summary } : r,
          ),
        );
        // Mirror successful scans into the local history drawer.
        try {
          appendScan({
            url,
            scanId: summary.scanId,
            title: summary.title,
            imageUrl: summary.imageUrl,
            savingsPercent: summary.savingsPercent ?? null,
          });
        } catch {
          /* non-critical */
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Scan failed";
        setRows((prev) =>
          prev.map((r, i) =>
            i === idx ? { ...r, status: "error", error: msg } : r,
          ),
        );
      }
    });

    setRunning(false);
    track("bulk_scan_done", { props: { count: detected.length } });
  }, [canRun, detected]);

  return (
    <section
      aria-labelledby="bulk-heading"
      className={cn("animate-in fade-in space-y-4 duration-500", className)}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl sm:p-6"
      >
        <div
          aria-hidden="true"
          className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px"
        />

        <label
          htmlFor="bulk-input"
          id="bulk-heading"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          {t("bulk.tab.bulk")}
        </label>
        <textarea
          id="bulk-input"
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("bulk.placeholder")}
          rows={5}
          disabled={running}
          className="mb-3 min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-describedby="bulk-detected"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            id="bulk-detected"
            className={cn(
              "text-xs text-muted-foreground",
              detected.length > 0 && "text-foreground",
            )}
          >
            {detected.length === 0
              ? t("bulk.empty")
              : running
                ? t("bulk.scanning", { done: doneCount, total: rows.length })
                : t("bulk.detected", { count: detected.length })}
            {detected.length >= MAX_BULK_URLS ? (
              <span className="ms-2 text-muted-foreground/70">
                (max {MAX_BULK_URLS})
              </span>
            ) : null}
          </p>
          <Button
            type="button"
            onClick={() => void handleRun()}
            disabled={!canRun}
            size="lg"
            className="h-11 bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-40"
          >
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("hero.cta.scanning")}
              </>
            ) : (
              t("bulk.cta")
            )}
          </Button>
        </div>
      </div>

      {/* Result grid */}
      {rows.length > 0 ? (
        <ul
          role="list"
          aria-label="Bulk scan results"
          className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
        >
          {rows.map((row) => (
            <li key={row.id}>
              <BulkResultCard row={row} formatMoney={formatMoney} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface BulkResultCardProps {
  row: BulkRow;
  formatMoney: (usd: number, opts?: { whole?: boolean; compact?: boolean }) => string;
}

function BulkResultCard({ row, formatMoney }: BulkResultCardProps) {
  const result = row.result;
  const href = result?.scanId ? `/scan/${result.scanId}` : row.url;
  const Wrapper = result?.scanId
    ? ({ children }: { children: React.ReactNode }) => (
        <Link
          href={href}
          className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-success/30 hover:shadow-xl hover:shadow-success/10"
        >
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          {children}
        </div>
      );

  return (
    <Wrapper>
      {/* Image / placeholder */}
      <div className="relative aspect-square w-full overflow-hidden border-b border-white/8 bg-black/20">
        {result?.imageUrl ? (
          <ProductImage
            src={result.imageUrl}
            alt={result.title}
            className="transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <StatusGlyph status={row.status} />
          </div>
        )}

        {/* Status badge — corner overlay */}
        {row.status === "scanning" ? (
          <Badge className="absolute end-2 top-2 border-primary/30 bg-primary/90 text-primary-foreground shadow-md">
            <Loader2 className="me-0.5 size-3 animate-spin" aria-hidden="true" />
            …
          </Badge>
        ) : null}
        {row.status === "done" && result?.savingsPercent !== undefined ? (
          <Badge className="absolute end-2 top-2 border-success/40 bg-success/90 text-success-foreground shadow-md">
            <TrendingDown className="me-0.5 size-3" aria-hidden="true" />
            {result.savingsPercent}%
          </Badge>
        ) : null}
        {row.status === "done" && result?.savingsPercent === undefined ? (
          <Badge className="absolute end-2 top-2 border-white/15 bg-card/80 text-muted-foreground shadow-md">
            <CheckCircle2 className="me-0.5 size-3" aria-hidden="true" />
            {result?.mode === "browse" ? "browse" : "scanned"}
          </Badge>
        ) : null}
        {row.status === "error" ? (
          <Badge className="absolute end-2 top-2 border-destructive/40 bg-destructive/90 text-destructive-foreground shadow-md">
            <AlertCircle className="me-0.5 size-3" aria-hidden="true" />
            error
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p dir="auto" className="line-clamp-2 text-xs font-semibold leading-snug">
          {result?.title ?? row.url}
        </p>
        {result?.storeName ? (
          <p dir="auto" className="text-[11px] text-muted-foreground">{result.storeName}</p>
        ) : null}

        {row.status === "done" &&
        result?.supplierPriceUsd !== undefined &&
        result?.storePriceUsd !== undefined ? (
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-sm font-black tabular-nums text-success">
              {formatMoney(result.supplierPriceUsd, { whole: true })}
            </span>
            <span className="text-[11px] text-muted-foreground line-through tabular-nums">
              {formatMoney(result.storePriceUsd, { whole: true })}
            </span>
          </div>
        ) : null}

        {row.status === "error" && row.error ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-destructive/90">
            {row.error}
          </p>
        ) : null}

        {row.status === "pending" ? (
          <p className="mt-auto pt-1 text-[10px] text-muted-foreground/70">
            queued
          </p>
        ) : null}
      </div>
    </Wrapper>
  );
}

function StatusGlyph({ status }: { status: RowStatus }) {
  if (status === "scanning") return <Loader2 className="size-7 animate-spin" aria-hidden="true" />;
  if (status === "error") return <AlertCircle className="size-7" aria-hidden="true" />;
  if (status === "done") return <CheckCircle2 className="size-7" aria-hidden="true" />;
  return <Package className="size-7" aria-hidden="true" />;
}
