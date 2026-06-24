"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearHistory,
  getHistory,
  type ScanHistoryEntry,
} from "@/lib/scan-history";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/product-image";
import { Clock, ExternalLink, History, TrendingDown, X } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Recent scans drawer — opens from the nav.
 *
 * Pulls from localStorage so it's anonymous + zero backend. Clicking an entry
 * re-runs the URL via the home form which will normally hit the 14-day cache.
 */

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function RecentScans() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const router = useRouter();

  const refresh = useCallback(() => {
    setHistory(getHistory());
  }, []);

  // Hydrate on mount + listen for cross-component updates.
  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("busted:history-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("busted:history-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Mobile: lock body scroll while drawer is open so the page behind doesn't
  // scroll under the user's finger. The drawer has its own internal scroll.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (history.length === 0) return null;

  const handleSelect = (url: string) => {
    setOpen(false);
    track("history_click", { props: { url } });
    router.push(`/?url=${encodeURIComponent(url)}`);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Open recent scans (${history.length})`}
        className="h-9 gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 text-xs backdrop-blur-sm hover:border-white/15 hover:bg-white/[0.06] sm:px-3"
      >
        <History className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Recent</span>
        <Badge
          variant="outline"
          className="ms-0 border-white/15 bg-white/8 px-1.5 text-[10px] font-bold leading-none sm:ms-0.5"
        >
          {history.length}
        </Badge>
      </Button>

      {/* Backdrop — z-[60] so it sits above the sticky nav (z-50). */}
      {open ? (
        <div
          role="presentation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        />
      ) : null}

      {/* Drawer — z-[70] so it sits above the backdrop and the sticky nav.
          bg-card (fully opaque) — earlier bg-card/95 let bright chips/glows
          from the page behind bleed through on mobile. */}
      <aside
        role="dialog"
        aria-label="Recent scans"
        aria-modal="true"
        className={cn(
          "fixed inset-y-0 end-0 z-[70] flex w-full max-w-sm flex-col border-s border-white/10 bg-card shadow-2xl transition-transform duration-300 ease-out",
          // rtl:translate-x-(-full) auto-flips: in RTL the drawer is anchored
          // to the start (left) and slides in from the left edge.
          open ? "translate-x-0" : "translate-x-full rtl:-translate-x-full pointer-events-none",
        )}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-bold">Recent scans</p>
            <p className="text-xs text-muted-foreground">
              Saved on this device · {history.length}/25
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close recent scans"
            className="size-10"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
          {history.map((entry) => (
            <li key={entry.id} className="group relative">
              {entry.scanId ? (
                // Desktop-only hover affordance. On mobile the row itself
                // (the <button> below) is the primary action — the previous
                // opacity-0 + group-hover combo on mobile rendered the pill
                // invisible-but-tappable, so taps near the row corner could
                // misfire to the permalink instead of the row's re-scan.
                <a
                  href={`/scan/${entry.scanId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    track("history_click", { props: { url: entry.url, target: "permalink" } });
                  }}
                  aria-label={`Open permanent link for ${entry.title}`}
                  className="absolute top-3 end-5 hidden items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground opacity-0 transition-opacity sm:inline-flex sm:group-hover:opacity-100"
                >
                  <ExternalLink className="size-3" aria-hidden="true" />
                  View
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => handleSelect(entry.url)}
                className="flex w-full items-center gap-3 px-5 py-3 text-start transition-colors hover:bg-white/[0.04]"
              >
                {entry.imageUrl ? (
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20">
                    <ProductImage
                      src={entry.imageUrl}
                      alt=""
                      sizes="48px"
                    />
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground"
                  >
                    <Clock className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="line-clamp-1 text-sm font-semibold">
                    {entry.title || entry.url}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatRelative(entry.completedAt)}</span>
                    {typeof entry.savingsPercent === "number" ? (
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <TrendingDown className="size-3" aria-hidden="true" />
                        <span className="tabular-nums">{entry.savingsPercent}%</span>
                      </span>
                    ) : null}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <footer className="border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              clearHistory();
              setOpen(false);
            }}
            className="text-xs text-muted-foreground/70 transition-colors hover:text-destructive"
          >
            Clear history
          </button>
        </footer>
      </aside>
    </>
  );
}
