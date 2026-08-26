import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, HelpCircle, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import {
  loadStoreReport,
  MIN_DECISIVE_SCANS,
  normalizeDomainParam,
  type StoreReport,
  type StoreTier,
} from "@/lib/store/report";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ domain: string }>;
}

/**
 * Public per-store report — the programmatic SEO surface ("is {store}
 * legit"). Rendered from the scan DB; revalidated hourly so crawlers get a
 * cacheable page without a DB read per hit.
 */

export const revalidate = 3600;

const TIER_COPY: Record<
  StoreTier,
  { label: string; blurb: (r: StoreReport) => string }
> = {
  flagged: {
    label: "Dropship signals found",
    blurb: (r) =>
      `${r.dropshipCount} of ${r.totalScans} scanned products matched cheaper supplier listings or carried strong dropship signals.`,
  },
  mixed: {
    label: "Mixed results",
    blurb: (r) =>
      `Scans of this store returned a mix of verdicts (${r.dropshipCount} dropship, ${r.legitCount} legit) — check individual products below.`,
  },
  clean: {
    label: "No dropship signals found",
    blurb: (r) =>
      `${r.legitCount} of ${r.totalScans} scanned products came back without dropship signals.`,
  },
  insufficient: {
    label: "Not enough data yet",
    blurb: (r) =>
      `Only ${r.totalScans} scan${r.totalScans === 1 ? "" : "s"} on record — too few for a store-level verdict. Scan a product below to add evidence.`,
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain: raw } = await params;
  const domain = normalizeDomainParam(raw);
  if (!domain) return { title: `Store not found — ${BRAND_NAME}` };
  const report = await loadStoreReport(domain);
  if (!report) {
    return {
      title: `Is ${domain} legit? — ${BRAND_NAME}`,
      robots: { index: false, follow: true },
    };
  }
  const copy = TIER_COPY[report.tier];
  return {
    title: `Is ${domain} legit? ${copy.label} — ${BRAND_NAME} report`,
    description: `${copy.blurb(report)} Based on ${report.totalScans} automated ${BRAND_NAME} scan${report.totalScans === 1 ? "" : "s"}.`,
  };
}

/**
 * Verdict enums are an internal contract, not consumer copy. Shipping
 * `insufficient_evidence` to a public page reads as a system leaking, and on
 * a page that names a real business it reads as a machine passing judgement.
 */
const VERDICT_LABEL: Record<string, string> = {
  dropship: "Dropship signals",
  legit: "Looks legit",
  collection_page: "Category page",
  insufficient_evidence: "Not enough evidence",
  not_a_product: "Not a product page",
};

function verdictLabel(verdict: string | null): string {
  return verdict ? (VERDICT_LABEL[verdict] ?? "No verdict") : "No verdict";
}

function TierBanner({ report }: { report: StoreReport }) {
  const copy = TIER_COPY[report.tier];
  const styles: Record<StoreTier, string> = {
    // --primary (fire), not --destructive: red is the error colour here and
    // everywhere else in the app. A flagged store is a finding, not a fault.
    flagged: "border-primary/30 bg-primary/10 text-primary",
    mixed: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    clean: "border-success/30 bg-success/10 text-success",
    insufficient: "border-white/10 bg-white/[0.04] text-muted-foreground",
  };
  const Icon =
    report.tier === "flagged"
      ? Flame
      : report.tier === "clean"
        ? ShieldCheck
        : report.tier === "mixed"
          ? Scale
          : HelpCircle;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-5 backdrop-blur-sm",
        styles[report.tier],
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-base font-bold">{copy.label}</p>
        <p className="mt-1 text-sm opacity-80">{copy.blurb(report)}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function StoreReportPage({ params }: PageProps) {
  const { domain: raw } = await params;
  const domain = normalizeDomainParam(raw);
  if (!domain) notFound();

  const report = await loadStoreReport(domain);
  if (!report) notFound();

  return (
    <div className="relative">
      {/* Ambient blobs removed — see DESIGN.md; film grain on body::after. */}
      <div className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:pt-12">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 mb-6 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Home
          </Link>
        </Button>

        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Store report
        </p>
        {/* The fire gradient is the flame register. Rendering it above "Not
            enough data yet" makes the headline louder than the finding — the
            accusation colour is earned by the tier, not by the page. */}
        <h1
          className={cn(
            "mt-2 text-4xl font-black tracking-tight sm:text-5xl",
            report.tier === "flagged"
              ? "bg-gradient-to-br from-primary via-orange-400 to-amber-300 bg-clip-text text-transparent"
              : "text-foreground",
          )}
        >
          Is {report.domain} legit?
        </h1>

        <div className="mt-6">
          <TierBanner report={report} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Products scanned" value={String(report.totalScans)} />
          <Stat label="Dropship verdicts" value={String(report.dropshipCount)} />
          <Stat label="Legit verdicts" value={String(report.legitCount)} />
          <Stat
            label="Avg. markup savings"
            value={report.avgSavingsPercent !== null ? `${report.avgSavingsPercent}%` : "—"}
          />
        </div>

        {/* Above the evidence, at readable size. This page names a real
            business on an indexed URL; the methodology is load-bearing, and a
            disclaimer at 60% opacity below the fold is not a disclosure. */}
        <p className="mt-8 max-w-prose text-sm leading-relaxed text-muted-foreground">
          How this is produced: {BRAND_NAME} runs automated scans on individual
          product pages and compares them against supplier listings. Verdicts
          are AI-assisted estimates, not accusations or findings of
          wrongdoing, and low-confidence results are excluded from the
          store-level verdict entirely. A store-level verdict needs at least{" "}
          {MIN_DECISIVE_SCANS} confident scans. Always verify before you buy.
        </p>

        <h2 className="mt-10 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Scanned products
        </h2>
        <ul className="mt-3 space-y-2">
          {report.scans.map((scan) => (
            <li key={scan.scanId}>
              <Link
                href={`/scan/${scan.scanId}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:border-white/12 hover:bg-white/[0.05]"
              >
                <span dir="auto" className="line-clamp-1 text-sm font-medium">
                  {scan.title}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                  {scan.savingsPercent !== null ? (
                    <span className="font-semibold text-success">
                      −{scan.savingsPercent}%
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-medium",
                      scan.verdict === "dropship"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : scan.verdict === "legit" || scan.verdict === "collection_page"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-white/10 bg-white/5 text-muted-foreground",
                    )}
                  >
                    {verdictLabel(scan.verdict)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Provenance only — the methodology and its limits are stated above
            the evidence, not after it. */}
        <p className="mt-10 text-center text-xs text-muted-foreground/60">
          Automated report from {report.totalScans} {BRAND_NAME} scan
          {report.totalScans === 1 ? "" : "s"} · last scan{" "}
          {new Date(report.lastScannedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
