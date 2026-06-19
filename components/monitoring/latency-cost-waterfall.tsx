"use client";

/**
 * Horizontal latency + cost waterfall — Sprint 9 Stage 15.
 *
 * One bar per service, length proportional to total time spent in that
 * service, colour-coded by cost bucket. A right-hand column shows the
 * estimated USD spend (4-decimal precision because Gemini calls are
 * fractions of a cent).
 *
 * Replaces nothing — sits ABOVE the existing text-trace waterfall.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  bucketColour,
  bucketForService,
  bucketLabel,
  estimateStageCost,
  visionPreprocessCost,
  type CostEstimate,
} from "@/lib/monitoring/cost-model";
import type {
  AnalyzeDebugInfo,
  AnalyzeDebugServiceEvent,
} from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import { DollarSign, Timer } from "lucide-react";

interface LatencyCostWaterfallProps {
  events: AnalyzeDebugServiceEvent[];
  debug: AnalyzeDebugInfo;
  className?: string;
}

interface ServiceTimingRow {
  service: string;
  status: AnalyzeDebugServiceEvent["status"];
  totalMs: number;
  cost: CostEstimate;
}

function rowsFromEvents(
  events: AnalyzeDebugServiceEvent[],
  debug: AnalyzeDebugInfo,
): ServiceTimingRow[] {
  // Group events by service, keep insertion order.
  const groups = new Map<string, AnalyzeDebugServiceEvent[]>();
  for (const e of events) {
    const arr = groups.get(e.service) ?? [];
    arr.push(e);
    groups.set(e.service, arr);
  }

  const preprocess = debug.supplier?.preprocess;
  const visionExtra = visionPreprocessCost({
    attempted: preprocess?.attempted ?? false,
    cacheHit: preprocess?.cacheHit ?? false,
  });

  return Array.from(groups.entries()).map(([service, serviceEvents]) => {
    const last = serviceEvents[serviceEvents.length - 1];
    // Each emit's latencyMs is cumulative from service start (matches the
    // pattern in EventTimeline above), so the last event's value is the
    // service's total wall-clock cost.
    const totalMs = last.latencyMs;

    const status = last.status;
    const skipped = status === "skip";

    // Cost = sum of per-stage costs in this service's event stream.
    // Cache-hit on the scraper service zeroes the page-fetch cost.
    const wasScraperCacheHit = service === "scraper" &&
      serviceEvents.some((ev) => ev.cacheStatus === "HIT");

    const stageCosts = serviceEvents
      .map((ev) =>
        estimateStageCost(ev.service, ev.stage.split(":")[1] ?? ev.stage, {
          wasCacheHit:
            wasScraperCacheHit ||
            ev.cacheStatus === "HIT" ||
            skipped,
        }),
      )
      .filter((c) => c.usd > 0);

    // De-duplicate — most services emit "start" + "done" with the same key.
    const totalUsd = stageCosts.length > 0
      ? stageCosts[0].usd
      : 0;

    // Add vision preprocess cost into the supplier-match row, since that's
    // where it's actually invoked from.
    const usd =
      service === "supplier-match"
        ? totalUsd + visionExtra.usd
        : totalUsd;

    const breakdown = [
      ...stageCosts.flatMap((c) => c.breakdown),
      ...(service === "supplier-match" ? visionExtra.breakdown : []),
    ];

    return {
      service,
      status,
      totalMs,
      cost: { usd, breakdown },
    };
  });
}

export function LatencyCostWaterfall({
  events,
  debug,
  className,
}: LatencyCostWaterfallProps) {
  if (!events || events.length === 0) return null;

  const rows = rowsFromEvents(events, debug);
  const maxMs = Math.max(1, ...rows.map((r) => r.totalMs));
  const totalMs = rows.reduce((a, b) => a + b.totalMs, 0);
  const totalUsd = rows.reduce((a, b) => a + b.cost.usd, 0);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="size-4" aria-hidden="true" />
            Latency & Cost Waterfall
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 font-mono text-xs">
              <Timer className="size-3" aria-hidden="true" />
              {totalMs.toLocaleString()} ms
            </Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-xs">
              <DollarSign className="size-3" aria-hidden="true" />
              {totalUsd.toFixed(4)}
            </Badge>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Where each scan&apos;s time and money actually go. Estimates only —
          AE/Admitad calls are free within quota.
        </p>
      </CardHeader>

      <CardContent className="space-y-2.5 p-4">
        {rows.map((row) => {
          const widthPct = `${Math.max(2, (row.totalMs / maxMs) * 100)}%`;
          const bucket = bucketForService(row.service);
          const isSkip = row.status === "skip";
          const isError = row.status === "error";

          return (
            <div key={row.service} className="group">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      bucketColour(bucket),
                      isError && "bg-destructive",
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-foreground">
                    {row.service}
                  </span>
                  <span className="text-muted-foreground/60">
                    · {bucketLabel(bucket)}
                  </span>
                  {isSkip ? (
                    <Badge
                      variant="outline"
                      className="border-white/15 text-[10px] text-muted-foreground"
                    >
                      skipped
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="tabular-nums text-muted-foreground">
                    {row.totalMs.toLocaleString()} ms
                  </span>
                  <span
                    className={cn(
                      "w-16 text-right tabular-nums",
                      row.cost.usd > 0
                        ? "text-foreground/90"
                        : "text-muted-foreground/50",
                    )}
                  >
                    ${row.cost.usd.toFixed(4)}
                  </span>
                </div>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                    bucketColour(bucket),
                    isError && "bg-destructive",
                    isSkip && "opacity-30",
                  )}
                  style={{ width: widthPct }}
                  aria-hidden="true"
                />
              </div>
              {row.cost.breakdown.length > 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground/50">
                  {row.cost.breakdown.join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}

        {/* Totals row */}
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="flex items-baseline justify-between font-mono text-xs">
            <span className="font-semibold uppercase tracking-widest text-muted-foreground">
              total
            </span>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-foreground">
                {totalMs.toLocaleString()} ms
              </span>
              <span className="w-16 text-right tabular-nums text-foreground">
                ${totalUsd.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
