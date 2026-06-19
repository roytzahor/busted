import { CacheStats } from "@/components/monitoring/cache-stats";
import { LastScanPanel } from "@/components/monitoring/last-scan-panel";
import { StatusBoard } from "@/components/monitoring/status-board";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, ScanSearch } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status — Busted",
  description: "Live health status and last scan trace for Busted services.",
  robots: { index: false, follow: false },
};

export default function MonitoringPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      {/* Header */}
      <header className="mb-8 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-2">
            <Activity className="size-4 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            System Status
          </h1>
          <Badge
            variant="outline"
            className="border-primary/25 bg-primary/10 text-xs font-bold uppercase tracking-widest text-primary"
          >
            Live
          </Badge>
        </div>
        <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
          Real-time health checks for every service powering a Busted scan.
          Probes run automatically every 30 seconds.
        </p>
      </header>

      {/* Service status cards */}
      <StatusBoard />

      <Separator className="my-10 border-white/8" />

      {/* Cache performance overview */}
      <CacheStats />

      <Separator className="my-10 border-white/8" />

      {/* Last scan behind-the-scenes */}
      <section aria-labelledby="last-scan-heading">
        <header className="mb-5 space-y-1">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-2">
              <ScanSearch className="size-4 text-primary" aria-hidden="true" />
            </div>
            <h2
              id="last-scan-heading"
              className="text-lg font-black tracking-tight sm:text-xl"
            >
              Last Scan — Behind the Scenes
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Pipeline trace, scrape output, and AI prediction from the most recent product scan in this browser.
          </p>
        </header>

        <LastScanPanel />
      </section>
    </div>
  );
}
