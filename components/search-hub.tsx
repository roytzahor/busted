"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnalysisSkeleton } from "@/components/analysis-skeleton";
import { AnalysisTabs } from "@/components/analysis-tabs";
import { PartialResult } from "@/components/partial-result";
import { LivePipelineView } from "@/components/live-pipeline-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyzeProductUrl,
  getProductUrlHint,
  validateProductUrl,
  type AnalyzeProgress,
  type LiveStageUpdate,
  type SSEStageId,
} from "@/lib/analyze/client";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type {
  DropshipAnalysisResult,
  PartialResult as PartialResultData,
} from "@/lib/analyze/map-response";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import {
  DEMO_EXAMPLES_FALLBACK,
  fetchFeaturedExamples,
  type DemoExample,
} from "@/lib/examples";
import { appendScan } from "@/lib/scan-history";
import { track } from "@/lib/track";
import { TrustCounter } from "@/components/trust-counter";
import { ValuePropFaq } from "@/components/value-prop-faq";
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
  ClipboardPaste,
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
  const searchParams = useSearchParams();
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
  const [partialResult, setPartialResult] = useState<PartialResultData | null>(null);
  const [debugInfo, setDebugInfo] = useState<AnalyzeDebugInfo | null>(null);
  // Stage 17 — live pipeline state
  const [liveStages, setLiveStages] = useState<Map<SSEStageId, LiveStageUpdate>>(new Map());
  // Stage 33 — self-healing demo examples
  const [examples, setExamples] = useState<DemoExample[]>(DEMO_EXAMPLES_FALLBACK);
  useEffect(() => {
    const ac = new AbortController();
    void fetchFeaturedExamples(ac.signal).then(setExamples);
    return () => ac.abort();
  }, []);
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

  const handleAnalyze = useCallback(async (overrideUrl?: string) => {
    const targetUrl = overrideUrl ?? url;
    const error = validateProductUrl(targetUrl);
    if (error) {
      setValidationError(error);
      return;
    }
    if (overrideUrl) setUrl(overrideUrl); // keep input in sync when called from a chip
    setValidationError(null);
    setAnalysisError(null);
    setComparison(null);
    setDropshipResult(null);
    setPartialResult(null);
    setDebugInfo(null);
    setLiveStages(new Map()); // reset stage view for new scan
    setPhase("analyzing");
    setProgress({ step: "Checking cache…", progress: 0 });
    const scanStartedAt = performance.now();
    track("scan_start", { props: { url: targetUrl, source: overrideUrl ? "chip" : "manual" } });
    try {
      const result = await analyzeProductUrl(targetUrl, {
        debug: true,
        onProgress: setProgress,
        onStage: (update) => {
          setLiveStages((prev) => {
            const next = new Map(prev);
            next.set(update.stage, update);
            return next;
          });
        },
      });
      setComparison(result.comparison);
      setDropshipResult(result.dropshipAnalysis);
      setPartialResult(result.partial);
      setDebugInfo(result.debug);
      setPhase("complete");

      if (result.mode === "partial") {
        track("scan_partial", {
          props: {
            url: targetUrl,
            reason: result.partial?.degradedReason ?? "unknown",
            durationMs: Math.round(performance.now() - scanStartedAt),
          },
        });
      } else {
        track("scan_complete", {
          scanId:
            result.comparison?.scanId ?? result.dropshipAnalysis?.scanId,
          props: {
            savingsPercent: result.comparison?.savingsPercent ?? null,
            fromCache:
              result.comparison?.cache === "HIT" ||
              result.dropshipAnalysis?.cache === "HIT",
            durationMs: Math.round(performance.now() - scanStartedAt),
          },
        });
      }

      // Append to local scan history for the Recent drawer. Partial results
      // aren't persisted to the server cache and have nothing useful to revisit,
      // so we skip them here too.
      if (result.mode !== "partial") {
        try {
          appendScan({
            url: targetUrl,
            scanId:
              result.comparison?.scanId ?? result.dropshipAnalysis?.scanId,
            title:
              result.comparison?.storeProduct.title ??
              result.dropshipAnalysis?.storeProduct.title ??
              targetUrl,
            imageUrl:
              result.comparison?.storeProduct.imageUrl ??
              result.dropshipAnalysis?.storeProduct.imageUrl ??
              null,
            savingsPercent: result.comparison?.savingsPercent ?? null,
          });
        } catch { /* non-critical */ }
      }

      // Persist debug info to localStorage so /monitoring can display it
      if (result.debug) {
        try {
          localStorage.setItem("busted_last_scan_debug", JSON.stringify(result.debug));
          localStorage.setItem("busted_last_scan_url", targetUrl);
          localStorage.setItem("busted_last_scan_at", new Date().toISOString());
        } catch { /* storage full or unavailable */ }
      }
    } catch (err) {
      const errorWithDebug = err as Error & { debug?: AnalyzeDebugInfo };
      const message =
        err instanceof Error ? err.message : "Analysis failed. Please try again.";
      setAnalysisError(message);
      if (errorWithDebug.debug) setDebugInfo(errorWithDebug.debug);
      setPhase("error");
      track("scan_error", { props: { url: targetUrl, message: message.slice(0, 200) } });
    }
  }, [url]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleAnalyze();
  };

  // Clipboard paste — Stage 23. Reads navigator.clipboard.readText when
  // available (HTTPS + user gesture required). Errors silently if blocked.
  const [canClipboard, setCanClipboard] = useState(false);
  useEffect(() => {
    setCanClipboard(
      typeof navigator !== "undefined" &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.readText === "function",
    );
  }, []);
  const handleClipboardPaste = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      handleUrlChange(text);
      track("paste_click");
    } catch {
      /* permission denied — no-op */
    }
  }, [handleUrlChange]);

  // Honor ?url=... or PWA share_target ?text=... / ?share=... — auto-run once.
  useEffect(() => {
    const incoming =
      searchParams.get("url") ??
      searchParams.get("share") ??
      searchParams.get("text");
    if (!incoming) return;
    if (phase !== "idle") return;
    if (validateProductUrl(incoming)) return; // invalid → ignore silently
    void handleAnalyze(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

        <p className="mx-auto mb-6 max-w-lg text-base text-muted-foreground sm:text-lg">
          {BRAND_DESCRIPTION}
        </p>

        {/* Live trust counter — real DB aggregate, cached server-side 1h */}
        <div className="mb-6 flex justify-center">
          <TrustCounter />
        </div>

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
                  canClipboard && !url && "pr-24",
                )}
                disabled={isAnalyzing}
              />
              {canClipboard && !url && !isAnalyzing ? (
                <button
                  type="button"
                  onClick={() => void handleClipboardPaste()}
                  aria-label="Paste link from clipboard"
                  className="absolute top-1/2 right-2 inline-flex h-10 -translate-y-1/2 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-muted-foreground transition-[color,background-color,border-color] hover:border-primary/30 hover:bg-primary/8 hover:text-foreground active:scale-[0.96]"
                >
                  <ClipboardPaste className="size-3.5" aria-hidden="true" />
                  Paste
                </button>
              ) : null}
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
              className="glow-primary relative h-12 w-full overflow-hidden bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-[color,background-color,box-shadow,opacity,scale] hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/40 disabled:opacity-40 disabled:shadow-none active:scale-[0.96]"
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

        {/* Demo example chips — give a cold visitor a one-click path to results. */}
        {isIdle ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground/50">
              Try one
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {examples.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => {
                    track("example_click", { props: { url: ex.url, label: ex.label } });
                    void handleAnalyze(ex.url);
                  }}
                  disabled={isAnalyzing}
                  aria-label={`Try the ${ex.label} example`}
                  className="group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs backdrop-blur-sm transition-[color,background-color,border-color,transform,scale] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/8 disabled:opacity-40 disabled:hover:translate-y-0 active:scale-[0.96]"
                >
                  <span className="font-semibold text-foreground/90">{ex.label}</span>
                  <span className="text-muted-foreground/70 group-hover:text-success">
                    {ex.savingsHint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Progress ──────────────────────────────────────────────── */}
      {phase === "analyzing" ? (
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {liveStages.size > 0 ? (
            <LivePipelineView stageMap={liveStages} />
          ) : (
            <AnalysisSkeleton step={progress.step} progress={progress.progress} />
          )}
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

      {/* Stage 31 — partial result (scrape OK, AI failed) */}
      {phase === "complete" && partialResult ? (
        <div className="mb-16">
          <PartialResult result={partialResult} onRetry={() => void handleAnalyze(partialResult.originalUrl)} />
        </div>
      ) : null}

      {/* ── How it works — bento grid (idle only) ─────────────────── */}
      {isIdle ? (
        <>
        <section aria-label="How it works" className="mb-12">
          <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
            How it works
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.step}
                  className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-left backdrop-blur-sm transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.055] hover:shadow-xl hover:shadow-black/20"
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

                  <div className="relative z-10 mb-4 inline-flex rounded-lg border border-white/10 bg-white/5 p-3 transition-colors duration-300 group-hover:border-white/15 group-hover:bg-white/8">
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
        <ValuePropFaq className="mb-20" />
        </>
      ) : null}
    </div>
  );
}
