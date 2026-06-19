"use client";

import { useCallback, useState } from "react";
import { AnalysisSkeleton } from "@/components/analysis-skeleton";
import { AnalysisTabs } from "@/components/analysis-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyzeProductUrl,
  getProductUrlHint,
  validateProductUrl,
  type AnalyzeProgress,
} from "@/lib/analyze/client";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type { DropshipAnalysisResult } from "@/lib/analyze/map-response";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import {
  BRAND_DESCRIPTION,
  BRAND_HOOK_BUSTED,
  BRAND_HOOK_RELIEF,
  BRAND_TAGLINE,
  DISCLAIMER_SHORT,
} from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Flame,
  Info,
  Link2,
  Shield,
  Zap,
} from "lucide-react";

type SearchPhase = "idle" | "analyzing" | "complete" | "error";

const STATS = [
  { icon: Zap, label: "Avg scan", value: "~20s" },
  { icon: Shield, label: "Detection", value: "AI-powered" },
  { icon: Clock, label: "Cache", value: "14 days" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: Link2,
    title: "Paste any product link",
    body: "Drop a link from any online store — Shopify, TikTok Shop, or an independent brand. We handle the rest.",
    colorClass: "text-primary",
    glowClass: "bg-primary/12",
  },
  {
    step: "02",
    icon: Flame,
    title: "See if they're marking it up",
    body: "Our AI reads the product page and scores how likely it is you're paying a dropship premium.",
    colorClass: "text-destructive",
    glowClass: "bg-destructive/12",
  },
  {
    step: "03",
    icon: Shield,
    title: "Find it cheaper, instantly",
    body: "We find the same product at the source so you can buy direct and keep the difference.",
    colorClass: "text-success",
    glowClass: "bg-success/12",
  },
];

export function SearchHub() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [urlHint, setUrlHint] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzeProgress>({
    step: "Checking 7-day cache…",
    progress: 0,
  });
  const [comparison, setComparison] = useState<ProductComparisonResult | null>(null);
  const [dropshipResult, setDropshipResult] = useState<DropshipAnalysisResult | null>(null);
  const [debugInfo, setDebugInfo] = useState<AnalyzeDebugInfo | null>(null);
  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (value.trim()) {
      setValidationError(validateProductUrl(value));
      setUrlHint(getProductUrlHint(value));
    } else {
      setValidationError(null);
      setUrlHint(null);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    const error = validateProductUrl(url);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setAnalysisError(null);
    setComparison(null);
    setDropshipResult(null);
    setDebugInfo(null);
    setPhase("analyzing");
    setProgress({ step: "Checking cache…", progress: 0 });
    try {
      const result = await analyzeProductUrl(url, {
        debug: true,
        onProgress: setProgress,
      });
      setComparison(result.comparison);
      setDropshipResult(result.dropshipAnalysis);
      setDebugInfo(result.debug);
      setPhase("complete");
      // Persist debug info to localStorage so /monitoring can display it
      if (result.debug) {
        try {
          localStorage.setItem("busted_last_scan_debug", JSON.stringify(result.debug));
          localStorage.setItem("busted_last_scan_url", url);
          localStorage.setItem("busted_last_scan_at", new Date().toISOString());
        } catch { /* storage full or unavailable */ }
      }
    } catch (err) {
      const errorWithDebug = err as Error & { debug?: AnalyzeDebugInfo };
      setAnalysisError(
        err instanceof Error ? err.message : "Analysis failed. Please try again.",
      );
      if (errorWithDebug.debug) setDebugInfo(errorWithDebug.debug);
      setPhase("error");
    }
  }, [url]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleAnalyze();
  };

  const isAnalyzing = phase === "analyzing";
  const canSubmit = url.trim().length > 0 && !validationError && !isAnalyzing;
  const hasResults =
    phase === "complete" && (comparison !== null || dropshipResult !== null);
  const isIdle = phase === "idle";

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="py-10 text-center sm:py-20 md:py-24">
        {/* Tagline chip */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <span className="animate-live size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <Flame className="size-3.5" aria-hidden="true" />
          {BRAND_TAGLINE}
        </div>

        {/* Headline */}
        <h1 className="mb-5 text-4xl font-black tracking-tight sm:text-5xl md:text-6xl lg:text-7xl md:leading-[1.05]">
          <span className="bg-gradient-to-br from-primary via-orange-400 to-amber-300 bg-clip-text text-transparent">
            {BRAND_HOOK_BUSTED}
          </span>{" "}
          <span className="bg-gradient-to-br from-success via-emerald-400 to-green-300 bg-clip-text text-transparent">
            {BRAND_HOOK_RELIEF}
          </span>
        </h1>

        <p className="mx-auto mb-8 max-w-lg text-base text-muted-foreground sm:text-lg">
          {BRAND_DESCRIPTION}
        </p>

        {/* Stats bar — glass pill */}
        <div className="mb-10 inline-flex items-center justify-center divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-1 px-3 py-2.5 text-xs sm:gap-2 sm:px-5 sm:text-sm">
              <Icon className="size-3.5 shrink-0 text-primary sm:size-4" aria-hidden="true" />
              <span className="hidden text-muted-foreground sm:inline">{label}:</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>

        {/* ── Glass search card ────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
          {/* Top-edge shine */}
          <div aria-hidden="true" className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px" />
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-label="Product URL analyzer"
            noValidate
          >
            <div className="relative">
              <label htmlFor="product-url" className="sr-only">
                Product URL
              </label>
              <Link2
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="product-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://store.com/products/..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={
                  validationError
                    ? "url-error"
                    : urlHint
                      ? "url-hint-warn"
                      : "url-hint"
                }
                className={cn(
                  "h-12 border-white/10 bg-white/5 pl-10 text-base placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:ring-primary/20",
                  validationError && "border-destructive/60 ring-2 ring-destructive/20",
                  urlHint && !validationError && "border-primary/40",
                )}
                disabled={isAnalyzing}
              />
            </div>

            {urlHint && !validationError ? (
              <p
                id="url-hint-warn"
                className="flex items-start gap-1.5 text-left text-sm text-accent-foreground"
              >
                <Flame className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {urlHint}
              </p>
            ) : (
              <p id="url-hint" className="text-left text-xs text-muted-foreground">
                Any product link works — repeat lookups are instant thanks to 14-day caching.
              </p>
            )}

            {validationError ? (
              <p
                id="url-error"
                role="alert"
                className="flex items-center gap-1.5 text-left text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {validationError}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              className="glow-primary relative h-12 w-full overflow-hidden bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/40 disabled:opacity-40 disabled:shadow-none"
            >
              {isAnalyzing ? (
                "Scanning…"
              ) : (
                <>
                  Run Busted Scan
                  <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Legal disclaimer — visible before scan so expectations are set. */}
        <p
          role="note"
          className={cn(
            "mx-auto mt-4 flex max-w-xl items-start gap-2 px-2 text-left text-[11px] leading-relaxed text-muted-foreground/70 transition-opacity duration-300 sm:text-xs",
            isAnalyzing && "opacity-40",
          )}
        >
          <Info
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
          <span>{DISCLAIMER_SHORT}</span>
        </p>
      </section>

      {/* ── Progress ──────────────────────────────────────────────── */}
      {phase === "analyzing" ? (
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <AnalysisSkeleton step={progress.step} progress={progress.progress} />
        </div>
      ) : null}

      {/* ── Error banner ──────────────────────────────────────────── */}
      {phase === "error" && analysisError ? (
        <div
          role="alert"
          className="mb-6 animate-in fade-in rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive backdrop-blur-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{analysisError}</p>
          </div>
        </div>
      ) : null}

      {/* ── Results ───────────────────────────────────────────────── */}
      {phase === "error" && debugInfo ? (
        <AnalysisTabs comparison={null} dropshipResult={null} debugInfo={debugInfo} />
      ) : null}

      {hasResults ? (
        <div className="mb-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <AnalysisTabs
            comparison={comparison}
            dropshipResult={dropshipResult}
            debugInfo={debugInfo}
          />
        </div>
      ) : null}

      {/* ── How it works — bento grid (idle only) ─────────────────── */}
      {isIdle ? (
        <section aria-label="How it works" className="mb-20">
          <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
            How it works
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.step}
                  className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-left backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.055] hover:shadow-xl hover:shadow-black/20"
                >
                  {/* Color-coded ambient glow */}
                  <div
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full blur-3xl",
                      item.glowClass,
                    )}
                  />

                  {/* Large step number watermark */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 bottom-3 select-none text-8xl font-black leading-none text-foreground/[0.06]"
                  >
                    {item.step}
                  </span>

                  <div className="relative z-10 mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-3 transition-colors duration-300 group-hover:border-white/15 group-hover:bg-white/8">
                    <Icon className={cn("size-5", item.colorClass)} aria-hidden="true" />
                  </div>

                  <h2 className="relative z-10 mb-2 text-sm font-bold">{item.title}</h2>
                  <p className="relative z-10 text-xs leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
