"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useMoney } from "@/components/currency-provider";
import { useT } from "@/components/locale-provider";
import { ProductImage } from "@/components/product-image";
import { cn } from "@/lib/utils";
import { Flame, TrendingDown } from "lucide-react";

/**
 * "Trending Now" social-proof rail on the home page.
 *
 * Fetches recently-scanned products from /api/stats/trending (CDN-cached
 * 5min), renders them as a horizontal-scroll rail on mobile and a 4-col
 * grid on desktop. Each card links to the permanent /scan/[id] page.
 *
 * Hidden entirely when the feed is empty (cold start, no recent scans) —
 * we'd rather show nothing than a "no data" placeholder under the hero.
 */

interface TrendingItem {
  scanId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  storeName: string;
  storePriceUsd: number;
  supplierPriceUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  scannedAtIso: string;
}

interface TrendingPayload {
  items: TrendingItem[];
  windowHours: number;
}

function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round((now - then) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

interface TrendingNowProps {
  className?: string;
}

export function TrendingNow({ className }: TrendingNowProps) {
  const formatMoney = useMoney();
  const t = useT();
  const [data, setData] = useState<TrendingPayload | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let abort = false;
    fetch("/api/stats/trending?limit=12")
      .then((r) => r.json() as Promise<TrendingPayload>)
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
    <section
      aria-labelledby="trending-heading"
      className={cn("animate-in fade-in ease-out w-full duration-300", className)}
    >
      <div className="mb-4 flex items-end justify-between gap-3 px-1">
        <div>
          <h2
            id="trending-heading"
            className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg"
          >
            <Flame className="size-4 text-primary" aria-hidden="true" />
            {t("trending.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("trending.subtitle", { hours: data?.windowHours ?? 72 })}
          </p>
        </div>
      </div>

      {/* Skeleton row while loading. */}
      {!data ? (
        <ul
          role="list"
          aria-busy="true"
          aria-label="Loading trending products"
          className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="min-w-[200px] flex-shrink-0 sm:min-w-0"
              aria-hidden="true"
            >
              <div className="h-full animate-pulse rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="mb-3 aspect-square w-full rounded-xl bg-white/5" />
                <div className="mb-2 h-3 w-3/4 rounded bg-white/5" />
                <div className="h-3 w-1/2 rounded bg-white/5" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          role="list"
          aria-label="Trending scanned products"
          className={cn(
            "flex gap-3 overflow-x-auto pb-2",
            "scrollbar-thin sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3 lg:grid-cols-4",
            "snap-x snap-mandatory sm:snap-none",
          )}
        >
          {data.items.map((item) => (
            <li
              key={item.scanId}
              className="min-w-[200px] flex-shrink-0 snap-start sm:min-w-0"
            >
              <TrendingCard
                item={item}
                formatMoney={formatMoney}
                savePctLabel={t("trending.savePct", { pct: item.savingsPercent })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface TrendingCardProps {
  item: TrendingItem;
  formatMoney: (usdAmount: number, opts?: { whole?: boolean; compact?: boolean }) => string;
  savePctLabel: string;
}

function TrendingCard({ item, formatMoney, savePctLabel }: TrendingCardProps) {
  return (
    <Link
      href={`/scan/${item.scanId}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-success/30 hover:shadow-xl hover:shadow-success/10"
    >
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden border-b border-white/8 bg-black/20">
        <ProductImage
          src={item.imageUrl}
          alt={item.title}
          className="transition-transform duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 200px, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Savings badge — corner overlay (RTL-aware via end-2). */}
        <Badge className="absolute end-2 top-2 border-success/40 bg-success/90 text-success-foreground shadow-md backdrop-blur-sm">
          <TrendingDown className="me-0.5 size-3" aria-hidden="true" />
          {savePctLabel}
        </Badge>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p dir="auto" className="line-clamp-2 text-xs font-semibold leading-snug">
          {item.title}
        </p>
        <p dir="auto" className="text-[11px] text-muted-foreground">{item.storeName}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-black tabular-nums text-success">
            {formatMoney(item.supplierPriceUsd, { whole: true })}
          </span>
          <span className="text-[11px] text-muted-foreground line-through tabular-nums">
            {formatMoney(item.storePriceUsd, { whole: true })}
          </span>
        </div>
        <p className="mt-auto pt-1 text-[10px] text-muted-foreground/70">
          {timeAgo(item.scannedAtIso)}
        </p>
      </div>
    </Link>
  );
}
