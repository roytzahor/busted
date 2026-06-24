"use client";

import { useCurrency } from "@/components/currency-provider";
import { convertUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Flame, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Animated trust counter.
 *
 * Fetches `/api/stats/totals` on mount (server caches 1h) and tweens from 0 →
 * the real number over ~1.2s. Respects prefers-reduced-motion (jumps straight
 * to the final value). Renders a stable fallback pill when the API errors.
 */

interface TotalsPayload {
  scansThisWeek: number;
  scansAllTime: number;
  totalSavingsUsd: number;
  refreshedAt: string;
}

function useTweenedNumber(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced || target <= 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic for a snappier feel near the end.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function formatMoneyCompact(usdAmount: number, currency: { symbol: string; fxFromUsd: number; locale: string }): string {
  const n = convertUsd(usdAmount, "USD") * currency.fxFromUsd;
  if (n >= 1_000_000)
    return `${currency.symbol}${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)
    return `${currency.symbol}${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${currency.symbol}${n.toLocaleString(currency.locale, { maximumFractionDigits: 0 })}`;
}

export function TrustCounter({ className }: { className?: string }) {
  const { meta } = useCurrency();
  const [data, setData] = useState<TotalsPayload | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let abort = false;
    fetch("/api/stats/totals", { next: { revalidate: 3600 } } as RequestInit)
      .then((r) => r.json() as Promise<TotalsPayload>)
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

  const scans = useTweenedNumber(data?.scansThisWeek ?? 0);
  const savings = useTweenedNumber(data?.totalSavingsUsd ?? 0);

  // Hide entirely when we have no real data yet — avoids a "0 scans" flash.
  if (!data && !errored) return null;

  if (errored || (data && data.scansAllTime === 0)) {
    return (
      <div
        className={cn(
          "mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] text-muted-foreground/70 backdrop-blur-sm sm:text-xs",
          className,
        )}
      >
        <Flame className="size-3 text-primary" aria-hidden="true" />
        Busted is live · be the first
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.04] px-4 py-1.5 text-xs backdrop-blur-sm tabular-nums sm:text-sm",
        className,
      )}
      aria-label={`${data!.scansThisWeek} scans this week, ${formatMoneyCompact(data!.totalSavingsUsd, meta)} in savings exposed`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Flame className="size-3.5 text-primary" aria-hidden="true" />
        <span className="font-bold text-foreground">{formatCount(scans)}</span>
        <span className="text-muted-foreground">stores busted this week</span>
      </span>
      {data!.totalSavingsUsd > 0 ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground/30">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TrendingDown className="size-3.5 text-success" aria-hidden="true" />
            <span className="font-bold text-success">{formatMoneyCompact(savings, meta)}</span>
            <span className="text-muted-foreground">saved</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
