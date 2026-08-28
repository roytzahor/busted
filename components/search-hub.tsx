"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnalysisSkeleton } from "@/components/analysis-skeleton";
import { AnalysisTabs } from "@/components/analysis-tabs";
import { BulkPaste } from "@/components/bulk-paste";
import { PartialResult } from "@/components/partial-result";
import { LivePipelineView } from "@/components/live-pipeline-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyzeProductUrl,
  getProductUrlHintKey,
  validateProductUrl,
  type AnalyzeProgress,
  type LiveStageUpdate,
  type SSEStageId,
  type UrlHintKey,
} from "@/lib/analyze/client";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type {
  BrowseAnalysisResult,
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
import { LandingLedger } from "@/components/landing-ledger";
import { TrustCounter } from "@/components/trust-counter";
import { useT } from "@/components/locale-provider";
import { ValuePropFaq } from "@/components/value-prop-faq";
import { DISCLAIMER_SHORT } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  ClipboardPaste,
  Flame,
  Info,
  Link2,
} from "lucide-react";

type SearchPhase = "idle" | "analyzing" | "complete" | "error";
type SearchMode = "single" | "bulk";

export function SearchHub() {
  const searchParams = useSearchParams();
  const t = useT();
  const [mode, setMode] = useState<SearchMode>("single");
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [urlHintKey, setUrlHintKey] = useState<UrlHintKey | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzeProgress>({
    step: "Checking 7-day cache…",
    progress: 0,
  });
  const [comparison, setComparison] = useState<ProductComparisonResult | null>(null);
  const [dropshipResult, setDropshipResult] = useState<DropshipAnalysisResult | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseAnalysisResult | null>(null);
  const [partialResult, setPartialResult] = useState<PartialResultData | null>(null);
  const [debugInfo, setDebugInfo] = useState<AnalyzeDebugInfo | null>(null);
  // Stage 17 — live pipeline state
  const [liveStages, setLiveStages] = useState<Map<SSEStageId, LiveStageUpdate>>(new Map());
  // Stage 33 — self-healing demo examples
  const [examples, setExamples] = useState<DemoExample[]>(DEMO_EXAMPLES_FALLBACK);
  // Mobile: the progress + results render below the fold. Anchor we scroll to
  // so the user lands on the answer instead of staring at the hero.
  const resultsAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ac = new AbortController();
    void fetchFeaturedExamples(ac.signal).then(setExamples);
    return () => ac.abort();
  }, []);
  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (value.trim()) {
      setValidationError(validateProductUrl(value));
      setUrlHintKey(getProductUrlHintKey(value));
    } else {
      setValidationError(null);
      setUrlHintKey(null);
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
    setBrowseResult(null);
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
      setBrowseResult(result.browse);
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
            result.comparison?.scanId ??
            result.dropshipAnalysis?.scanId ??
            result.browse?.scanId,
          props: {
            savingsPercent: result.comparison?.savingsPercent ?? null,
            fromCache:
              result.comparison?.cache === "HIT" ||
              result.dropshipAnalysis?.cache === "HIT" ||
              result.browse?.cache === "HIT",
            mode: result.mode,
            ...(result.browse
              ? { browseCandidates: result.browse.candidates.length }
              : {}),
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
              result.comparison?.scanId ??
              result.dropshipAnalysis?.scanId ??
              result.browse?.scanId,
            title:
              result.comparison?.storeProduct.title ??
              result.dropshipAnalysis?.storeProduct.title ??
              result.browse?.storeProduct.title ??
              targetUrl,
            imageUrl:
              result.comparison?.storeProduct.imageUrl ??
              result.dropshipAnalysis?.storeProduct.imageUrl ??
              result.browse?.storeProduct.imageUrl ??
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

  // Mobile-only: pull the live pipeline / results into view when a scan starts
  // or completes — desktop already shows everything above the fold, and the
  // CSS `scroll-behavior` (smooth, auto under reduced-motion) handles easing.
  useEffect(() => {
    if (phase !== "analyzing" && phase !== "complete") return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const id = window.setTimeout(() => {
      resultsAnchorRef.current?.scrollIntoView({ block: "start" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [phase]);

  const isAnalyzing = phase === "analyzing";
  const canSubmit = url.trim().length > 0 && !validationError && !isAnalyzing;
  const hasResults =
    phase === "complete" &&
    (comparison !== null || dropshipResult !== null || browseResult !== null);
  const isIdle = phase === "idle";

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="py-10 text-center sm:py-20 md:py-24">
        {/* Tagline chip */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <span className="animate-live size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <Flame className="size-3.5" aria-hidden="true" />
          {t("hero.tagline")}
        </div>

        {/* Headline — solid foreground, DESIGN.md §4.4 Display scale.
            Gradient clip-text killed: costs legibility, breaks
            high-contrast modes, adds no information. Exactly one word
            carries --primary. */}
        <h1 className="mb-5 text-[clamp(2.25rem,5.5vw,3.75rem)] font-extrabold tracking-[-0.035em] leading-[1.04] text-balance">
          <span className="text-primary">{t("hero.headline.busted")}</span>{" "}
          <span className="text-foreground">{t("hero.headline.relief")}</span>
        </h1>

        <p className="mx-auto mb-6 max-w-lg text-base leading-[1.6] text-pretty text-muted-foreground sm:text-lg">
          {t("hero.description")}
        </p>

        {/* Live trust counter — real DB aggregate, cached server-side 1h */}
        <div className="mb-10 flex justify-center">
          <TrustCounter />
        </div>

        {/* ── Mode tabs: Single URL / Bulk paste ───────────────────── */}
        <div
          role="tablist"
          aria-label={t("hero.howItWorks")}
          className="mx-auto mb-3 inline-flex w-full max-w-xl items-center justify-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1 text-xs backdrop-blur-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => setMode("single")}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 py-1.5 font-medium transition-colors sm:min-h-0",
              mode === "single"
                ? "bg-primary/90 text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("bulk.tab.single")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "bulk"}
            onClick={() => setMode("bulk")}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 py-1.5 font-medium transition-colors sm:min-h-0",
              mode === "bulk"
                ? "bg-primary/90 text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("bulk.tab.bulk")}
          </button>
        </div>

        {mode === "bulk" ? (
          <BulkPaste className="mx-auto w-full max-w-2xl" />
        ) : (
        <>
        {/* ── Glass search card ────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
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
                className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="product-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                dir="ltr"
                placeholder="https://store.com/products/..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={
                  validationError
                    ? "url-error"
                    : urlHintKey
                      ? "url-hint-warn"
                      : "url-hint"
                }
                className={cn(
                  "h-12 border-white/10 bg-white/5 ps-10 text-base placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:ring-primary/20",
                  validationError && "border-destructive/60 ring-2 ring-destructive/20",
                  urlHintKey && !validationError && "border-primary/40",
                  canClipboard && !url && "pe-24",
                )}
                disabled={isAnalyzing}
              />
              {canClipboard && !url && !isAnalyzing ? (
                <button
                  type="button"
                  onClick={() => void handleClipboardPaste()}
                  aria-label={t("hero.paste")}
                  className="absolute top-1/2 end-2 inline-flex h-10 -translate-y-1/2 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-muted-foreground transition-[color,background-color,border-color] hover:border-primary/30 hover:bg-primary/8 hover:text-foreground active:scale-[0.96]"
                >
                  <ClipboardPaste className="size-3.5" aria-hidden="true" />
                  {t("hero.paste")}
                </button>
              ) : null}
            </div>

            {urlHintKey && !validationError ? (
              <p
                id="url-hint-warn"
                className="flex items-start gap-1.5 text-start text-sm text-accent-foreground"
              >
                <Flame className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t(urlHintKey)}
              </p>
            ) : (
              <p id="url-hint" className="text-start text-xs text-muted-foreground">
                {t("hero.hint")}
              </p>
            )}

            {validationError ? (
              <p
                id="url-error"
                role="alert"
                className="flex items-center gap-1.5 text-start text-sm text-destructive"
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
                t("hero.cta.scanning")
              ) : (
                <>
                  {t("hero.cta.scan")}
                  {/* Arrow rotates in RTL so it always points in the reading direction. */}
                  <ArrowRight className="ms-1 size-4 rtl:rotate-180" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Legal disclaimer — visible before scan so expectations are set. */}
        <p
          role="note"
          className={cn(
            "mx-auto mt-4 flex max-w-xl items-start gap-2 px-2 text-start text-[11px] leading-relaxed text-muted-foreground/70 transition-opacity duration-300 sm:text-xs",
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
              {t("hero.tryOne")}
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
        </>
        )}
      </section>

      {/* Scroll anchor — `scroll-mt` clears the sticky nav + notch inset. */}
      <div
        ref={resultsAnchorRef}
        aria-hidden="true"
        className="scroll-mt-[calc(4rem+env(safe-area-inset-top))]"
      />

      {/* ── Progress ──────────────────────────────────────────────── */}
      {phase === "analyzing" ? (
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 ease-out duration-300">
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
          className="mb-6 animate-in fade-in ease-out rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive backdrop-blur-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{analysisError}</p>
          </div>
        </div>
      ) : null}

      {/* ── Results ───────────────────────────────────────────────── */}
      {phase === "error" && debugInfo ? (
        <AnalysisTabs
          comparison={null}
          dropshipResult={null}
          browseResult={null}
          debugInfo={debugInfo}
        />
      ) : null}

      {hasResults ? (
        <div className="mb-16 animate-in fade-in slide-in-from-bottom-2 ease-out duration-300">
          <AnalysisTabs
            comparison={comparison}
            dropshipResult={dropshipResult}
            browseResult={browseResult}
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

      {/* ── The open ledger — DESIGN.md §5.1 (idle only) ──────────── */}
      {isIdle ? (
        <>
          <LandingLedger className="mb-12" />
          <ValuePropFaq className="mb-20" />
        </>
      ) : null}
    </div>
  );
}
