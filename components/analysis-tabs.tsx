"use client";

import { AnalysisResults } from "@/components/analysis-results";
import { DropshipAnalysisResults } from "@/components/dropship-analysis-results";
import type { DropshipAnalysisResult } from "@/lib/analyze/map-response";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import { Activity } from "lucide-react";
import Link from "next/link";

interface AnalysisTabsProps {
  comparison: ProductComparisonResult | null;
  dropshipResult: DropshipAnalysisResult | null;
  debugInfo: AnalyzeDebugInfo | null;
}

export function AnalysisTabs({
  comparison,
  dropshipResult,
}: AnalysisTabsProps) {
  return (
    <section className="animate-in fade-in w-full space-y-4 duration-500">
      {dropshipResult ? (
        <DropshipAnalysisResults result={dropshipResult} />
      ) : null}
      {comparison ? <AnalysisResults result={comparison} /> : null}
      {!dropshipResult && !comparison ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          No product results to display.
        </div>
      ) : null}

      <div className="flex justify-center pt-2">
        <Link
          href="/monitoring"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          <Activity className="size-3" aria-hidden="true" />
          View pipeline trace &amp; behind-the-scenes
        </Link>
      </div>
    </section>
  );
}
