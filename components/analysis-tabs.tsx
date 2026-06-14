"use client";

import { DebugPanel } from "@/components/debug-panel";
import { AnalysisResults } from "@/components/analysis-results";
import { DropshipAnalysisResults } from "@/components/dropship-analysis-results";
import { PipelineWaterfall } from "@/components/pipeline-waterfall";
import type { DropshipAnalysisResult } from "@/lib/analyze/map-response";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import { Layers, PackageSearch, Workflow } from "lucide-react";
import { useState } from "react";

interface AnalysisTabsProps {
  comparison: ProductComparisonResult | null;
  dropshipResult: DropshipAnalysisResult | null;
  debugInfo: AnalyzeDebugInfo | null;
}

type TabId = "product" | "pipeline";

export function AnalysisTabs({
  comparison,
  dropshipResult,
  debugInfo,
}: AnalysisTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("product");

  const tabs: Array<{ id: TabId; label: string; icon: typeof PackageSearch }> = [
    { id: "product", label: "Product", icon: PackageSearch },
    { id: "pipeline", label: "Pipeline & Monitor", icon: Workflow },
  ];

  return (
    <section className="animate-in fade-in w-full space-y-4 duration-500">
      <div
        role="tablist"
        aria-label="Analysis views"
        className="bg-muted/50 flex w-full rounded-xl border p-1"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`panel-${id}`}
            id={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div
        id="panel-product"
        role="tabpanel"
        aria-labelledby="tab-product"
        hidden={activeTab !== "product"}
        className={cn(activeTab !== "product" && "hidden")}
      >
        {dropshipResult ? (
          <DropshipAnalysisResults result={dropshipResult} />
        ) : null}
        {comparison ? <AnalysisResults result={comparison} /> : null}
        {!dropshipResult && !comparison ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            No product results to display.
          </div>
        ) : null}
      </div>

      <div
        id="panel-pipeline"
        role="tabpanel"
        aria-labelledby="tab-pipeline"
        hidden={activeTab !== "pipeline"}
        className={cn("space-y-4", activeTab !== "pipeline" && "hidden")}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers className="text-primary size-4" aria-hidden="true" />
          Live pipeline trace &amp; diagnostics
        </div>

        {debugInfo?.waterfall && debugInfo.waterfall.length > 0 ? (
          <PipelineWaterfall entries={debugInfo.waterfall} animate={false} />
        ) : (
          <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Run an analysis to see the pipeline waterfall.
          </div>
        )}

        {debugInfo ? <DebugPanel debug={debugInfo} /> : null}
      </div>
    </section>
  );
}
