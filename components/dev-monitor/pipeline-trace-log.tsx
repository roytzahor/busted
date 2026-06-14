"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal } from "lucide-react";

interface TraceLine {
  atMs: number;
  text: string;
  tone?: "default" | "success" | "warn" | "info";
}

const PIPELINE_TRACE: TraceLine[] = [
  { atMs: 0, text: "Cache Lookup initiated…", tone: "info" },
  { atMs: 14, text: "Cache MISS. Invoking Firecrawl…", tone: "warn" },
  {
    atMs: 1420,
    text: "Firecrawl returned Markdown (4,758 chars). Extracting title & price…",
    tone: "default",
  },
  {
    atMs: 1435,
    text: "Invoking Gemini Flash for Red Flags & dropship extraction…",
    tone: "info",
  },
  {
    atMs: 2150,
    text: "Gemini returned structured JSON. Confidence: 95%. Category: Book Stands.",
    tone: "default",
  },
  {
    atMs: 2165,
    text: "AliExpress product.query — 38 candidates ranked (volume · rating · shipping).",
    tone: "info",
  },
  {
    atMs: 2172,
    text: "Affiliate deep link generated. HTTP 200 validation passed.",
    tone: "default",
  },
  { atMs: 2180, text: "DB written successfully. Pipeline completed.", tone: "success" },
];

function toneClass(tone: TraceLine["tone"]): string {
  switch (tone) {
    case "success":
      return "text-emerald-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-sky-400";
    default:
      return "text-zinc-300";
  }
}

export function PipelineTraceLog() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const runSimulation = useCallback(() => {
    setVisibleCount(0);
    setIsRunning(true);
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    if (visibleCount >= PIPELINE_TRACE.length) {
      setIsRunning(false);
      return;
    }

    const current = PIPELINE_TRACE[visibleCount];
    const previousAt = visibleCount === 0 ? 0 : PIPELINE_TRACE[visibleCount - 1].atMs;
    const delay = Math.max(120, current.atMs - previousAt);

    const timer = window.setTimeout(() => {
      setVisibleCount((count) => count + 1);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isRunning, visibleCount]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleCount]);

  const totalMs = PIPELINE_TRACE[PIPELINE_TRACE.length - 1]?.atMs ?? 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="size-4" aria-hidden="true" />
            Pipeline Execution Trace
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              Simulated run · {totalMs} ms total
            </Badge>
            <Button variant="outline" size="sm" onClick={runSimulation}>
              Replay trace
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Waterfall timings for a representative cache-miss analyze pipeline. Values
          are illustrative for dev diagnostics.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <div
          ref={logRef}
          className="bg-zinc-950 max-h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed sm:max-h-96 sm:text-sm"
          aria-live="polite"
          aria-label="Pipeline trace log"
        >
          {PIPELINE_TRACE.slice(0, visibleCount).map((line) => (
            <div key={`${line.atMs}-${line.text}`} className="flex gap-3 py-0.5">
              <span className="text-zinc-500 shrink-0 tabular-nums">[{line.atMs}ms]</span>
              <span className={toneClass(line.tone)}>{line.text}</span>
            </div>
          ))}
          {isRunning && visibleCount < PIPELINE_TRACE.length ? (
            <div className="mt-1 flex gap-3 py-0.5">
              <span className="text-zinc-500 shrink-0">[…]</span>
              <span className="animate-pulse text-zinc-500">Awaiting next stage…</span>
            </div>
          ) : null}
          {!isRunning && visibleCount >= PIPELINE_TRACE.length ? (
            <div className="mt-3 border-t border-zinc-800 pt-3 text-emerald-400">
              ✓ Trace complete — end-to-end latency within expected dev bounds.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
