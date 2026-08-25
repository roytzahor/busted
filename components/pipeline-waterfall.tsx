"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PipelineWaterfallEntry } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import { GitBranch } from "lucide-react";
import { useEffect, useState } from "react";

interface PipelineWaterfallProps {
  entries: PipelineWaterfallEntry[];
  className?: string;
  animate?: boolean;
}

function statusColor(status: PipelineWaterfallEntry["status"]): string {
  switch (status) {
    case "complete":
      return "text-success";
    case "skipped":
      return "text-zinc-500";
    case "error":
      return "text-red-400";
    default:
      return "text-primary";
  }
}

function stageLabel(stage: PipelineWaterfallEntry["stage"]): string {
  switch (stage) {
    case "cache":
      return "Cache";
    case "scrape":
      return "Scrape";
    case "ai":
      return "AI";
    case "supplier":
      return "Supplier";
    case "persist":
      return "Persist";
  }
}

export function PipelineWaterfall({
  entries,
  className,
  animate = true,
}: PipelineWaterfallProps) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : entries.length);

  useEffect(() => {
    if (!animate) {
      setVisibleCount(entries.length);
      return;
    }

    setVisibleCount(0);
    if (entries.length === 0) return;

    let index = 0;
    const revealNext = () => {
      index += 1;
      setVisibleCount(index);
      if (index < entries.length) {
        const delay = Math.max(
          80,
          (entries[index]?.atMs ?? 0) - (entries[index - 1]?.atMs ?? 0),
        );
        window.setTimeout(revealNext, Math.min(delay, 600));
      }
    };

    const timer = window.setTimeout(revealNext, 120);
    return () => window.clearTimeout(timer);
  }, [animate, entries]);

  const visible = entries.slice(0, visibleCount);
  const totalMs = entries[entries.length - 1]?.atMs ?? 0;
  const aiComplete = visible.some(
    (entry) => entry.stage === "ai" && entry.status === "complete",
  );
  const supplierPending =
    aiComplete &&
    !visible.some((entry) => entry.stage === "supplier" && entry.status === "complete");

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="size-4" aria-hidden="true" />
            Pipeline Waterfall
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            {totalMs > 0 ? `${totalMs} ms total` : "In progress…"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Live trace of each pipeline stage. AI dropship verdict appears before
          supplier search continues (or is skipped).
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <div
          className="bg-zinc-950 max-h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed sm:text-sm"
          aria-live="polite"
        >
          {visible.map((entry, index) => (
            <div
              key={`${entry.stage}-${entry.atMs}-${index}`}
              className="animate-in fade-in slide-in-from-left-1 ease-out flex gap-3 py-1 duration-300"
            >
              <span className="text-zinc-500 w-16 shrink-0 tabular-nums">
                [{entry.atMs}ms]
              </span>
              <Badge
                variant="outline"
                className="h-5 shrink-0 border-zinc-700 font-mono text-[10px] text-zinc-400"
              >
                {stageLabel(entry.stage)}
              </Badge>
              <span className={statusColor(entry.status)}>{entry.message}</span>
            </div>
          ))}

          {supplierPending && visibleCount >= entries.length ? (
            <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">
              ↳ Supplier search skipped — add AliExpress keys to .env to enable.
            </div>
          ) : null}

          {animate && visibleCount < entries.length ? (
            <div className="mt-1 flex gap-3 py-1 text-zinc-500">
              <span className="w-16 shrink-0">[…]</span>
              <span>Running next stage…</span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
