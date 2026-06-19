"use client";

/**
 * Real-time stage-by-stage pipeline animation — Stage 17.
 *
 * Replaces <AnalysisSkeleton /> during a scan. Each stage transitions through
 * queued → active → done/skipped/error driven by SSE events from the server.
 *
 * A cache HIT shows a gold lightning bolt on "Cache" and instantly marks all
 * remaining stages as skipped (they were never needed).
 */

import { Badge } from "@/components/ui/badge";
import type { LiveStageUpdate, SSEStageId, SSEStageStatus } from "@/lib/analyze/client";
import { cn } from "@/lib/utils";
import {
  Bot,
  CheckCircle2,
  Database,
  Globe2,
  Loader2,
  PackageSearch,
  Save,
  SkipForward,
  Sparkles,
  Zap,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

// ── Stage config ──────────────────────────────────────────────────────────────

interface StageConfig {
  id: SSEStageId;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  color: string;
}

const ORDERED_STAGES: StageConfig[] = [
  { id: "cache-lookup",      label: "Cache",              icon: Database,      color: "text-muted-foreground" },
  { id: "scrape",            label: "Fetch page",          icon: Globe2,        color: "text-blue-400" },
  { id: "identify",          label: "Identify product",    icon: Sparkles,      color: "text-amber-400" },
  { id: "verdict",           label: "AI dropship check",   icon: Bot,           color: "text-primary" },
  { id: "supplier-search",   label: "Search AliExpress",   icon: PackageSearch, color: "text-success" },
  { id: "persist",           label: "Save result",         icon: Save,          color: "text-muted-foreground" },
];

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(status: SSEStageStatus): string {
  switch (status) {
    case "active":   return "Running";
    case "done":     return "Done";
    case "hit":      return "Cache hit";
    case "miss":     return "Miss";
    case "skipped":  return "Skipped";
    case "error":    return "Error";
  }
}

function StatusIcon({ status, color }: { status: SSEStageStatus; color: string }) {
  if (status === "active") {
    return (
      <Loader2
        className={cn("size-4 animate-spin", color)}
        aria-label="Running"
        aria-hidden={false}
      />
    );
  }
  if (status === "done" || status === "miss") {
    return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  }
  if (status === "hit") {
    return <Zap className="size-4 text-amber-300" aria-hidden="true" />;
  }
  if (status === "skipped") {
    return <SkipForward className="size-4 text-muted-foreground/50" aria-hidden="true" />;
  }
  if (status === "error") {
    return <XCircle className="size-4 text-destructive" aria-hidden="true" />;
  }
  return null;
}

function StatusBadge({ status }: { status: SSEStageStatus }) {
  const map: Record<SSEStageStatus, { label: string; cls: string }> = {
    active:  { label: "Running",    cls: "border-primary/30 bg-primary/10 text-primary" },
    done:    { label: "Done",       cls: "border-success/30 bg-success/10 text-success" },
    hit:     { label: "Cache hit",  cls: "border-amber-300/40 bg-amber-300/10 text-amber-300" },
    miss:    { label: "Miss",       cls: "border-white/15 text-muted-foreground" },
    skipped: { label: "Skipped",    cls: "border-white/10 text-muted-foreground/50" },
    error:   { label: "Error",      cls: "border-destructive/30 bg-destructive/10 text-destructive" },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls)}>
      {label}
    </Badge>
  );
}

// ── Queued indicator ──────────────────────────────────────────────────────────

function QueuedDot() {
  return (
    <div className="flex size-4 items-center justify-center" aria-hidden="true">
      <div className="size-1.5 rounded-full bg-muted-foreground/25" />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LivePipelineViewProps {
  stageMap: Map<SSEStageId, LiveStageUpdate>;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LivePipelineView({ stageMap, className }: LivePipelineViewProps) {
  // Detect cache HIT: all stages after cache-lookup should appear skipped
  const cacheHit = stageMap.get("cache-lookup")?.status === "hit";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Pipeline progress"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Running scan
        </p>
      </div>

      {/* Stage list */}
      <ol className="divide-y divide-white/5 px-5 py-2">
        {ORDERED_STAGES.map((stage, index) => {
          const update = stageMap.get(stage.id);

          // If cache HIT, show stages after cache-lookup as skipped instantly
          const effectiveStatus: SSEStageStatus | "queued" =
            cacheHit && index > 0
              ? "skipped"
              : update
                ? update.status
                : "queued";

          const Icon = stage.icon;
          const isActive = effectiveStatus === "active";
          const isQueued = effectiveStatus === "queued";
          const isError = effectiveStatus === "error";

          return (
            <li
              key={stage.id}
              className={cn(
                "flex items-start gap-3 py-3 transition-opacity duration-300",
                isQueued && "opacity-40",
                isError && "opacity-100",
              )}
            >
              {/* Stage icon */}
              <div
                className={cn(
                  "mt-0.5 inline-flex shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 transition-colors duration-300",
                  isActive && "border-primary/30 bg-primary/10",
                  effectiveStatus === "done" && "border-success/25 bg-success/8",
                  effectiveStatus === "hit" && "border-amber-300/30 bg-amber-300/10",
                  isError && "border-destructive/30 bg-destructive/8",
                )}
                aria-hidden="true"
              >
                <Icon
                  className={cn(
                    "size-3.5",
                    isQueued ? "text-muted-foreground/40" : stage.color,
                    isActive && "text-primary",
                    effectiveStatus === "done" && "text-success",
                    effectiveStatus === "hit" && "text-amber-300",
                    isError && "text-destructive",
                  )}
                  aria-hidden={true}
                />
              </div>

              {/* Label + message */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isQueued && "text-muted-foreground/60",
                      isActive && "text-foreground",
                      effectiveStatus === "done" && "text-foreground",
                      effectiveStatus === "hit" && "text-amber-200",
                      isError && "text-destructive",
                    )}
                  >
                    {stage.label}
                  </p>
                  {!isQueued ? <StatusBadge status={effectiveStatus as SSEStageStatus} /> : null}
                </div>

                {/* Sub-message */}
                {update?.message && !isQueued ? (
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-relaxed",
                      isActive && "text-primary/80 animate-pulse",
                      !isActive && "text-muted-foreground/70",
                      isError && "text-destructive/80",
                    )}
                  >
                    {update.message}
                  </p>
                ) : isActive ? (
                  <p className="mt-0.5 animate-pulse text-xs text-primary/60">
                    Working…
                  </p>
                ) : null}
              </div>

              {/* Right: status icon or queued dot */}
              <div className="mt-0.5 shrink-0">
                {isQueued ? (
                  <QueuedDot />
                ) : (
                  <StatusIcon
                    status={effectiveStatus as SSEStageStatus}
                    color={stage.color}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Cache HIT fast-path note */}
      {cacheHit ? (
        <div className="border-t border-white/8 px-5 py-3">
          <p className="text-xs text-amber-200/80">
            <Zap className="mr-1 inline size-3" aria-hidden="true" />
            Cache hit — results restored instantly, no live scrape needed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
