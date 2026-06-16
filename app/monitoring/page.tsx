import { StatusBoard } from "@/components/monitoring/status-board";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status — Busted",
  description: "Live health status of Busted's AI, scraper, database, and affiliate services.",
  robots: { index: false, follow: false },
};

export default function MonitoringPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
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

      <StatusBoard />
    </div>
  );
}
