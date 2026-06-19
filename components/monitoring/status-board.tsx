"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  HelpCircle,
  Link2,
  Loader2,
  RefreshCw,
  Wifi,
  XCircle,
} from "lucide-react";

type ServiceId = "database" | "scraper" | "ai" | "affiliate";
type ProbeStatus = "idle" | "loading" | "connected" | "error" | "uninitialized";

interface ServiceState {
  status: ProbeStatus;
  latencyMs: number | null;
  message: string;
}

const SERVICE_CONFIG: Record<
  ServiceId,
  { label: string; description: string; icon: typeof Bot }
> = {
  ai: {
    label: "AI Analysis",
    icon: Bot,
    description: "Gemini Flash — dropship detection & keyword generation",
  },
  scraper: {
    label: "Page Scraper",
    icon: Wifi,
    description: "Firecrawl — extracts product data from any store",
  },
  database: {
    label: "Cache Database",
    icon: Database,
    description: "Neon Postgres — stores 14-day scan results",
  },
  affiliate: {
    label: "Affiliate Links",
    icon: Link2,
    description: "Admitad — converts AliExpress links to affiliate",
  },
};

const ALL_SERVICES: ServiceId[] = ["ai", "scraper", "database", "affiliate"];

function defaultState(): ServiceState {
  return { status: "idle", latencyMs: null, message: "Not yet probed" };
}

function StatusIcon({ status }: { status: ProbeStatus }) {
  if (status === "loading")
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />;
  if (status === "connected")
    return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (status === "error")
    return <XCircle className="size-4 text-destructive" aria-hidden="true" />;
  if (status === "uninitialized")
    return <AlertTriangle className="size-4 text-amber-400" aria-hidden="true" />;
  return <HelpCircle className="size-4 text-muted-foreground/50" aria-hidden="true" />;
}

function StatusBadge({ status }: { status: ProbeStatus }) {
  const map: Record<ProbeStatus, { label: string; cls: string }> = {
    idle: { label: "Not checked", cls: "border-white/15 text-muted-foreground" },
    loading: { label: "Checking…", cls: "border-white/15 text-muted-foreground" },
    connected: { label: "Operational", cls: "border-success/30 bg-success/10 text-success" },
    error: { label: "Error", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
    uninitialized: { label: "Not configured", cls: "border-amber-400/30 bg-amber-400/10 text-amber-400" },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cn("text-xs", cls)}>
      {label}
    </Badge>
  );
}

function monitoringHeaders(): HeadersInit {
  const secret = process.env.NEXT_PUBLIC_MONITORING_SECRET;
  return {
    "Content-Type": "application/json",
    ...(secret ? { "x-monitoring-secret": secret } : {}),
  };
}

async function probeService(service: ServiceId): Promise<ServiceState> {
  const res = await fetch("/api/monitoring", {
    method: "POST",
    headers: monitoringHeaders(),
    body: JSON.stringify({ service }),
  });
  if (!res.ok) {
    return { status: "error", latencyMs: null, message: "Request failed" };
  }
  const data = (await res.json()) as {
    status: ProbeStatus;
    latencyMs: number;
    message: string;
  };
  return { status: data.status, latencyMs: data.latencyMs, message: data.message };
}

export function StatusBoard() {
  const [states, setStates] = useState<Record<ServiceId, ServiceState>>(
    () => Object.fromEntries(ALL_SERVICES.map((s) => [s, defaultState()])) as Record<ServiceId, ServiceState>,
  );
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRunningAll, setIsRunningAll] = useState(false);

  const probeSingle = useCallback(async (service: ServiceId) => {
    setStates((prev) => ({ ...prev, [service]: { ...prev[service], status: "loading" } }));
    const result = await probeService(service);
    setStates((prev) => ({ ...prev, [service]: result }));
  }, []);

  const probeAll = useCallback(async () => {
    setIsRunningAll(true);
    setStates((prev) =>
      Object.fromEntries(ALL_SERVICES.map((s) => [s, { ...prev[s], status: "loading" }])) as Record<ServiceId, ServiceState>,
    );
    await Promise.all(ALL_SERVICES.map(async (service) => {
      const result = await probeService(service);
      setStates((prev) => ({ ...prev, [service]: result }));
    }));
    setLastRefreshed(new Date());
    setIsRunningAll(false);
  }, []);

  // Auto-probe on mount and every 5 minutes
  useEffect(() => {
    void probeAll();
    const interval = setInterval(() => void probeAll(), 5 * 60_000);
    return () => clearInterval(interval);
  }, [probeAll]);

  const allOk = ALL_SERVICES.every((s) => states[s].status === "connected");
  const anyError = ALL_SERVICES.some((s) => states[s].status === "error");

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl border p-4 backdrop-blur-sm transition-colors",
          allOk && "border-success/20 bg-success/6",
          anyError && "border-destructive/20 bg-destructive/6",
          !allOk && !anyError && "border-white/8 bg-white/[0.03]",
        )}
      >
        <div className="flex items-center gap-3">
          {allOk ? (
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          ) : anyError ? (
            <XCircle className="size-5 text-destructive" aria-hidden="true" />
          ) : (
            <Flame className="size-5 text-primary" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {allOk ? "All systems operational" : anyError ? "One or more services degraded" : "Checking services…"}
            </p>
            {lastRefreshed ? (
              <p className="text-xs text-muted-foreground">
                Last checked {lastRefreshed.toLocaleTimeString()} · auto-refreshes every 5 min
              </p>
            ) : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-white/10 hover:border-white/20"
          onClick={() => void probeAll()}
          disabled={isRunningAll}
          aria-label="Run all service probes"
        >
          {isRunningAll ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden="true" />
          )}
          <span className="ml-1.5 hidden sm:inline">
            {isRunningAll ? "Checking…" : "Run all"}
          </span>
        </Button>
      </div>

      {/* Service cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ALL_SERVICES.map((service) => {
          const config = SERVICE_CONFIG[service];
          const state = states[service];
          const Icon = config.icon;

          return (
            <div
              key={service}
              className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors hover:border-white/12 hover:bg-white/[0.05]"
            >
              {/* Top-edge shine */}
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-t-2xl",
                  state.status === "connected" && "bg-success/40",
                  state.status === "error" && "bg-destructive/40",
                  state.status === "loading" && "animate-pulse bg-primary/40",
                )}
              />

              <div className="mb-3 flex items-start justify-between">
                <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                </div>
                <StatusIcon status={state.status} />
              </div>

              <p className="mb-1 text-sm font-semibold">{config.label}</p>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {config.description}
              </p>

              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={state.status} />
                {state.latencyMs !== null ? (
                  <Badge variant="outline" className="border-white/15 font-mono text-xs text-muted-foreground">
                    {state.latencyMs}ms
                  </Badge>
                ) : null}
              </div>

              {state.message && state.status !== "idle" ? (
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground/80">
                  {state.message}
                </p>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full border-white/10 text-xs hover:border-white/20"
                onClick={() => void probeSingle(service)}
                disabled={state.status === "loading"}
                aria-label={`Probe ${config.label}`}
              >
                {state.status === "loading" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                ) : null}
                Probe now
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
