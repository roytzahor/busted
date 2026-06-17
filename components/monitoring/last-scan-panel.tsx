"use client";

import { DebugPanel } from "@/components/debug-panel";
import { EventTimeline } from "@/components/monitoring/event-timeline";
import { PipelineWaterfall } from "@/components/pipeline-waterfall";
import { Badge } from "@/components/ui/badge";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import { Clock, ExternalLink, GitBranch, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface StoredScan {
  debug: AnalyzeDebugInfo;
  url: string;
  scannedAt: string;
}

function loadFromStorage(): StoredScan | null {
  try {
    const raw = localStorage.getItem("busted_last_scan_debug");
    const url = localStorage.getItem("busted_last_scan_url");
    const at = localStorage.getItem("busted_last_scan_at");
    if (!raw || !url || !at) return null;
    return { debug: JSON.parse(raw) as AnalyzeDebugInfo, url, scannedAt: at };
  } catch {
    return null;
  }
}

export function LastScanPanel() {
  const [scan, setScan] = useState<StoredScan | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setScan(loadFromStorage());
    setMounted(true);

    // Listen for storage changes from other tabs
    const onStorage = (e: StorageEvent) => {
      if (e.key === "busted_last_scan_debug") setScan(loadFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!mounted) return null;

  if (!scan) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
        <ScanSearch className="mx-auto mb-3 size-8 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No recent scan</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Run a scan from the{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-muted-foreground">
            home page
          </Link>{" "}
          to see the pipeline trace and debug output here.
        </p>
      </div>
    );
  }

  const { debug, url, scannedAt } = scan;
  const prediction = debug.ai.prediction;
  const scannedDate = new Date(scannedAt);

  return (
    <div className="space-y-4">
      {/* Scan header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Last scanned URL
          </p>
          <p className="truncate font-mono text-xs text-foreground/80">{url}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-mono text-xs">
            <Clock className="size-3" aria-hidden="true" />
            {scannedDate.toLocaleTimeString()}
          </Badge>
          <Badge variant="secondary">
            Cache: {debug.pipeline.cacheStatus}
          </Badge>
          <Badge variant="secondary">
            Scraper: {debug.scrape.provider}
          </Badge>
          {prediction ? (
            <Badge
              className={cn(
                prediction.isLikelyDropship
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              AI: {prediction.isLikelyDropship ? "Likely dropship" : "Unclear"} ·{" "}
              {Math.round(prediction.confidence * 100)}%
            </Badge>
          ) : null}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Open scanned URL in new tab"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Per-service event timeline (Phase 6) */}
      {debug.serviceEvents && debug.serviceEvents.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Service Timeline
            </h3>
          </div>
          <EventTimeline events={debug.serviceEvents} />
        </div>
      ) : null}

      {/* Pipeline waterfall */}
      {debug.waterfall && debug.waterfall.length > 0 ? (
        <PipelineWaterfall entries={debug.waterfall} animate={false} />
      ) : null}

      {/* Full debug panel */}
      <DebugPanel debug={debug} />
    </div>
  );
}
