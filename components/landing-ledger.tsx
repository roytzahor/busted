"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Paper, PaperLabel, PaperRule } from "@/components/ui/paper";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The landing ledger — DESIGN.md §5.1.
 *
 * Replaces the old "Trending now" card grid. A column of real scans is a
 * record; three feature cards is a widget. This is the site's entire claim
 * ("we have receipts") rendered as receipts actually look: one continuous
 * paper sheet, ruled rows, right-aligned figures.
 *
 * Same data source as the component this replaced (/api/stats/trending,
 * CDN-cached 5min) — only the rendering changed.
 */

interface LedgerItem {
  scanId: string;
  url: string;
  title: string;
  storeName: string;
  storePriceUsd: number;
  supplierPriceUsd: number;
  savingsPercent: number;
  scannedAtIso: string;
}

interface LedgerPayload {
  items: LedgerItem[];
  windowHours: number;
}

function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round((now - then) / 60000));
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h`;
  return `${Math.round(diffHr / 24)}d`;
}

/** Store price / supplier price — the same ratio MarkupBar draws from. */
function multiplierFor(item: LedgerItem): string | null {
  if (item.supplierPriceUsd <= 0 || item.storePriceUsd <= 0) return null;
  const x = item.storePriceUsd / item.supplierPriceUsd;
  if (x < 1.5) return null;
  return `×${x.toFixed(1)}`;
}

interface LandingLedgerProps {
  className?: string;
}

export function LandingLedger({ className }: LandingLedgerProps) {
  const t = useT();
  const [data, setData] = useState<LedgerPayload | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let abort = false;
    fetch("/api/stats/trending?limit=8")
      .then((r) => r.json() as Promise<LedgerPayload>)
      .then((d) => {
        if (!abort) setData(d);
      })
      .catch(() => {
        if (!abort) setErrored(true);
      });
    return () => {
      abort = true;
    };
  }, []);

  if (errored) return null;
  if (data && data.items.length === 0) return null;

  return (
    <section aria-labelledby="ledger-heading" className={cn("w-full", className)}>
      <Paper className="gap-0 p-0">
        <PaperLabel className="px-5 pt-5 pb-3">
          <span id="ledger-heading">{t("trending.title")}</span>
          <span>{data ? t("trending.subtitle", { hours: data.windowHours }) : " "}</span>
        </PaperLabel>
        <PaperRule />

        {!data ? (
          <ul aria-busy="true" aria-label="Loading recent scans">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className={cn("flex items-center gap-4 px-5 py-3", i > 0 && "border-t border-paper-rule")}
              >
                <div className="h-3 w-24 animate-pulse rounded bg-paper-ink/10" />
                <div className="h-3 flex-1 animate-pulse rounded bg-paper-ink/10" />
                <div className="h-3 w-10 animate-pulse rounded bg-paper-ink/10" />
              </li>
            ))}
          </ul>
        ) : (
          <ul aria-label="Recently scanned products" className="divide-y divide-paper-rule">
            {data.items.map((item) => {
              const multiplier = multiplierFor(item);
              return (
                <li key={item.scanId}>
                  <Link
                    href={`/scan/${item.scanId}`}
                    className="flex min-h-11 items-baseline gap-4 px-5 py-3 font-mono text-sm tracking-[-0.005em] leading-[1.45] transition-colors hover:bg-paper-ink/[0.04]"
                  >
                    <span dir="ltr" className="shrink-0 text-paper-ink">
                      {item.storeName}
                    </span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-paper-muted">
                      {item.title}
                    </span>
                    {multiplier ? (
                      <bdi dir="ltr" className="shrink-0 tabular-nums text-paper-ink">
                        {multiplier}
                      </bdi>
                    ) : (
                      <bdi dir="ltr" className="shrink-0 tabular-nums text-paper-money">
                        {t("trending.savePct", { pct: item.savingsPercent })}
                      </bdi>
                    )}
                    <span className="shrink-0 text-paper-muted">{timeAgo(item.scannedAtIso)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Paper>
    </section>
  );
}
