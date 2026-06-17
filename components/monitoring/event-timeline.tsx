"use client";

import { Badge } from "@/components/ui/badge";
import type { AnalyzeDebugServiceEvent } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import {
  Bot,
  CheckCircle2,
  Database,
  Eye,
  GitBranch,
  Link2,
  Loader2,
  PackageSearch,
  ScanSearch,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";

interface EventTimelineProps {
  events: AnalyzeDebugServiceEvent[];
}

const SERVICE_ICONS: Record<string, LucideIcon> = {
  scraper: ScanSearch,
  "product-identifier": Sparkles,
  "dropship-verdict": Bot,
  "supplier-match": PackageSearch,
  affiliate: Link2,
  cache: Database,
  default: GitBranch,
};

const SERVICE_COLORS: Record<string, string> = {
  scraper: "text-blue-400",
  "product-identifier": "text-amber-400",
  "dropship-verdict": "text-primary",
  "supplier-match": "text-success",
  affiliate: "text-emerald-400",
  cache: "text-muted-foreground",
  default: "text-muted-foreground",
};

function iconForService(service: string): LucideIcon {
  return SERVICE_ICONS[service] ?? SERVICE_ICONS.default;
}

function colorForService(service: string): string {
  return SERVICE_COLORS[service] ?? SERVICE_COLORS.default;
}

function StatusIcon({ status }: { status: AnalyzeDebugServiceEvent["status"] }) {
  if (status === "ok")
    return <CheckCircle2 className="size-3 text-success" aria-hidden="true" />;
  if (status === "error")
    return <XCircle className="size-3 text-destructive" aria-hidden="true" />;
  if (status === "degraded")
    return <Loader2 className="size-3 text-amber-400" aria-hidden="true" />;
  return <Eye className="size-3 text-muted-foreground/50" aria-hidden="true" />;
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
        No service events recorded for this scan.
      </div>
    );
  }

  // Group by service (preserving order of first appearance)
  const grouped = new Map<string, AnalyzeDebugServiceEvent[]>();
  for (const event of events) {
    const arr = grouped.get(event.service) ?? [];
    arr.push(event);
    grouped.set(event.service, arr);
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([service, serviceEvents]) => {
        const Icon = iconForService(service);
        const color = colorForService(service);
        const lastEvent = serviceEvents[serviceEvents.length - 1];
        const totalMs = lastEvent.latencyMs;

        return (
          <div
            key={service}
            className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm"
          >
            {/* Service header */}
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4", color)} aria-hidden="true" />
                <p className="text-sm font-semibold">{service}</p>
                <StatusIcon status={lastEvent.status} />
              </div>
              <Badge variant="outline" className="border-white/15 font-mono text-xs text-muted-foreground">
                {totalMs}ms
              </Badge>
            </div>

            {/* Event stream */}
            <ol className="divide-y divide-white/5 font-mono text-xs">
              {serviceEvents.map((event, idx) => (
                <li
                  key={`${event.service}-${idx}-${event.at}`}
                  className="flex items-start gap-3 px-4 py-2"
                >
                  <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground/60">
                    {event.latencyMs}ms
                  </span>
                  <span
                    className={cn(
                      "w-32 shrink-0 truncate text-xs",
                      event.status === "error" && "text-destructive",
                      event.status === "ok" && "text-foreground/80",
                      event.status === "skip" && "text-muted-foreground/60",
                    )}
                  >
                    {event.stage}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-foreground/70">
                    {event.message ?? "—"}
                    {event.meta && Object.keys(event.meta).length > 0 ? (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground/50 hover:text-muted-foreground">
                          metadata
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed text-muted-foreground">
                          {JSON.stringify(event.meta, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
