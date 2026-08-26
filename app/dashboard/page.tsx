import type { ComponentType } from "react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MOCK_DASHBOARD_ANALYTICS,
  MOCK_SCAN_HISTORY,
} from "@/lib/mock-data";
import { isDevMonitorAllowed } from "@/lib/dev-monitor/service-probes";
import { notFound } from "next/navigation";
import {
  Bell,
  DollarSign,
  ExternalLink,
  ScanSearch,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard — Busted",
  description: "Track your scan history, price alerts, and cumulative savings.",
  // Every figure on this page is MOCK_* data. Never let it be indexed.
  robots: { index: false, follow: false },
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default function DashboardPage() {
  // Savings, alerts and scan history here are all MOCK_* fixtures. Shipping
  // invented personal records is exactly the behaviour Busted accuses stores
  // of — keep the route dev-only until it reads from /api/stats/*.
  if (!isDevMonitorAllowed()) {
    notFound();
  }

  const analytics = MOCK_DASHBOARD_ANALYTICS;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Your Savings Dashboard
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
          Track every scan, monitor price alerts, and watch your cumulative
          savings grow — built to keep you coming back.
        </p>
      </header>

      <section
        aria-label="Savings analytics summary"
        className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AnalyticsCard
          title="Total Scans"
          value={String(analytics.totalScans)}
          description="Products analyzed this month"
          icon={ScanSearch}
          accent="default"
        />
        <AnalyticsCard
          title="Active Alerts"
          value={String(analytics.activeAlerts)}
          description="Price drops we're watching"
          icon={Bell}
          accent="accent"
        />
        <AnalyticsCard
          title="Cumulative Money Saved"
          value={formatUsd(analytics.cumulativeSavingsUsd)}
          description="Total vs. dropship markups"
          icon={DollarSign}
          accent="success"
          className="sm:col-span-2 lg:col-span-1"
        />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Scan History</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Your past product analyses and savings breakdown.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit gap-1">
            <TrendingUp className="size-3" aria-hidden="true" />
            LTV Tracker Active
          </Badge>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Store</TableHead>
                  <TableHead className="text-right">Store Price</TableHead>
                  <TableHead className="text-right">Real Price</TableHead>
                  <TableHead className="text-right">Saved</TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Date
                  </TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_SCAN_HISTORY.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="line-clamp-2 text-sm font-medium">
                          {item.productTitle}
                        </p>
                        <p className="text-muted-foreground sm:hidden text-xs">
                          {item.storeName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {item.storeName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(item.storePriceUsd)}
                    </TableCell>
                    <TableCell className="text-success text-right tabular-nums">
                      {formatUsd(item.supplierPriceUsd)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-success font-medium tabular-nums">
                          {formatUsd(item.savingsUsd)}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {item.savingsPercent}% off
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-sm md:table-cell">
                      {formatDate(item.scannedAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={item.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
                        aria-label={`Open ${item.productTitle}`}
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface AnalyticsCardProps {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: "default" | "accent" | "success";
  className?: string;
}

function AnalyticsCard({
  title,
  value,
  description,
  icon: Icon,
  accent,
  className,
}: AnalyticsCardProps) {
  const accentStyles = {
    default: "bg-primary/10 text-primary",
    accent: "bg-accent text-accent-foreground",
    success: "bg-success/10 text-success",
  } as const;

  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-4 p-5 sm:p-6">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${accentStyles[accent]}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
