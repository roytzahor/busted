import { DevWarningBanner } from "@/components/dev-monitor/dev-warning-banner";
import { PipelineTraceLog } from "@/components/dev-monitor/pipeline-trace-log";
import { ServiceStatusGrid } from "@/components/dev-monitor/service-status-grid";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Dev Monitor — Busted Internal",
  robots: { index: false, follow: false },
};

export default function DevMonitorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <>
      <DevWarningBanner />

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="text-primary size-5" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Busted Dev Monitor
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {process.env.NODE_ENV ?? "development"}
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed sm:text-base">
            Isolated diagnostics workspace for Busted integration pillars. Run live
            probes against the database, scraper, AI engine, and affiliate search layer
            without triggering a full product analyze pipeline.
          </p>
        </header>

        <ServiceStatusGrid />

        <PipelineTraceLog />
      </div>
    </>
  );
}
