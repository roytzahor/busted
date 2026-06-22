"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AnalysisSkeletonProps {
  step: string;
  progress: number;
}

export function AnalysisSkeleton({ step, progress }: AnalysisSkeletonProps) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="Analyzing product"
      className="animate-in fade-in slide-in-from-bottom-4 w-full duration-500"
    >
      <Card className="overflow-hidden border-dashed">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-full">
              <Loader2
                className="text-primary size-5 animate-spin"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Analyzing product…</p>
              <p className="text-muted-foreground truncate text-xs">{step}</p>
            </div>
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              {progress}%
            </span>
          </div>

          <div
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Analysis progress"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonPanel label="Scanning store product" />
            <SkeletonPanel label="Finding original supplier" delay />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SkeletonPanel({
  label,
  delay = false,
}: {
  label: string;
  delay?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4",
        delay && "animate-in fade-in duration-700 fill-mode-both delay-150",
      )}
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}
