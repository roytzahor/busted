"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DevMonitorServiceId,
  DevMonitorServiceSnapshot,
  DevMonitorSnapshotResponse,
  DevMonitorStatus,
  DevMonitorTestResult,
} from "@/lib/dev-monitor/types";
import { cn } from "@/lib/utils";
import {
  Bot,
  Database,
  Loader2,
  Network,
  ScanSearch,
} from "lucide-react";

interface ServiceCardConfig {
  id: DevMonitorServiceId;
  title: string;
  description: string;
  icon: typeof Database;
  testLabel: string;
}

const SERVICE_CARDS: ServiceCardConfig[] = [
  {
    id: "database",
    title: "Database Layer",
    description: "Prisma ORM · Neon Postgres connection pool",
    icon: Database,
    testLabel: "Test DB Ping",
  },
  {
    id: "scraper",
    title: "Scraping Engine",
    description: "Firecrawl primary · Playwright headless fallback",
    icon: ScanSearch,
    testLabel: "Test Scraper",
  },
  {
    id: "ai",
    title: "AI Thinking Engine",
    description: "Google Gemini Flash · dropship verification",
    icon: Bot,
    testLabel: "Test LLM Prompt",
  },
  {
    id: "affiliate",
    title: "Affiliate / Search Layer",
    description: "AliExpress Affiliate API · Admitad routing",
    icon: Network,
    testLabel: "Test Search API",
  },
];

function resolveBadgeVariant(
  status: DevMonitorStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "loading") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

function statusLabel(status: DevMonitorStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "loading":
      return "Testing…";
    case "error":
      return "Error";
    case "uninitialized":
      return "Uninitialized";
    default:
      return "Idle";
  }
}

function statusBadgeClass(status: DevMonitorStatus): string {
  if (status === "connected") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (status === "error") {
    return "bg-destructive/10 text-destructive";
  }
  if (status === "uninitialized") {
    return "bg-destructive/10 text-destructive";
  }
  return "";
}

interface ServiceState {
  status: DevMonitorStatus;
  latencyMs: number | null;
  message: string | null;
  error: string | null;
}

function initialStateFromSnapshot(
  snapshot: DevMonitorServiceSnapshot | undefined,
): ServiceState {
  if (!snapshot) {
    return { status: "idle", latencyMs: null, message: null, error: null };
  }

  return {
    status: snapshot.configured ? "idle" : "uninitialized",
    latencyMs: null,
    message: snapshot.configured
      ? "Configured — run a live probe to verify."
      : "Required environment variables are missing.",
    error: null,
  };
}

export function ServiceStatusGrid() {
  const [snapshots, setSnapshots] = useState<
    DevMonitorSnapshotResponse["services"] | null
  >(null);
  const [services, setServices] = useState<Record<DevMonitorServiceId, ServiceState>>(
    {
      database: initialStateFromSnapshot(undefined),
      scraper: initialStateFromSnapshot(undefined),
      ai: initialStateFromSnapshot(undefined),
      affiliate: initialStateFromSnapshot(undefined),
    },
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSnapshot() {
      try {
        const response = await fetch("/api/dev-test");
        if (!response.ok) {
          throw new Error(`Snapshot failed (${response.status})`);
        }

        const data = (await response.json()) as DevMonitorSnapshotResponse;
        setSnapshots(data.services);
        setServices({
          database: initialStateFromSnapshot(data.services.database),
          scraper: initialStateFromSnapshot(data.services.scraper),
          ai: initialStateFromSnapshot(data.services.ai),
          affiliate: initialStateFromSnapshot(data.services.affiliate),
        });
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load service snapshot.",
        );
      }
    }

    void loadSnapshot();
  }, []);

  const runTest = useCallback(async (serviceId: DevMonitorServiceId) => {
    setServices((current) => ({
      ...current,
      [serviceId]: {
        ...current[serviceId],
        status: "loading",
        error: null,
      },
    }));

    try {
      const response = await fetch("/api/dev-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceId }),
      });

      const result = (await response.json()) as DevMonitorTestResult | { error: string };

      if (!response.ok || "error" in result && !("service" in result)) {
        throw new Error("error" in result ? result.error : `HTTP ${response.status}`);
      }

      const probe = result as DevMonitorTestResult;
      setServices((current) => ({
        ...current,
        [serviceId]: {
          status: probe.status,
          latencyMs: probe.latencyMs,
          message: probe.message,
          error: probe.error ?? null,
        },
      }));
    } catch (error) {
      setServices((current) => ({
        ...current,
        [serviceId]: {
          status: "error",
          latencyMs: null,
          message: "Client request failed.",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, []);

  return (
    <section aria-label="Service status grid" className="space-y-4">
      {loadError ? (
        <p className="text-destructive text-sm">{loadError}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SERVICE_CARDS.map((card) => {
          const Icon = card.icon;
          const state = services[card.id];
          const snapshot = snapshots?.[card.id];

          return (
            <Card key={card.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{card.title}</CardTitle>
                      <CardDescription className="text-xs">
                        {card.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={resolveBadgeVariant(state.status)}
                    className={cn("shrink-0 font-mono text-[10px]", statusBadgeClass(state.status))}
                  >
                    {statusLabel(state.status)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">
                    Latency
                  </span>
                  <span className="font-mono text-base font-medium tabular-nums">
                    {state.latencyMs !== null ? `${state.latencyMs} ms` : "—"}
                  </span>
                </div>

                {snapshot ? (
                  <dl className="space-y-1.5 text-xs">
                    {Object.entries(snapshot.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, " $1")}
                        </dt>
                        <dd className="font-mono text-right">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="bg-muted/50 h-16 animate-pulse rounded-lg" />
                )}

                {state.message ? (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {state.message}
                  </p>
                ) : null}

                {state.error ? (
                  <p className="text-destructive text-xs leading-relaxed">{state.error}</p>
                ) : null}
              </CardContent>

              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={state.status === "loading"}
                  onClick={() => void runTest(card.id)}
                >
                  {state.status === "loading" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Running probe…
                    </>
                  ) : (
                    card.testLabel
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
