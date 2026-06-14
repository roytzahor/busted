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
import { BRAND_DESCRIPTION, BRAND_HOOK_BUSTED, BRAND_HOOK_RELIEF, BRAND_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Flame,
  Link2,
  RefreshCw,
} from "lucide-react";

type SearchPhase = "idle" | "analyzing" | "complete" | "error";

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
  const [dropshipResult, setDropshipResult] = useState<DropshipAnalysisResult | null>(
    null,
  );
  const [debugInfo, setDebugInfo] = useState<AnalyzeDebugInfo | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);

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
    setProgress({ step: "Checking 7-day cache…", progress: 0 });

    try {
      const result = await analyzeProductUrl(url, {
        debug: true,
        forceRefresh,
        onProgress: setProgress,
      });

      setComparison(result.comparison);
      setDropshipResult(result.dropshipAnalysis);
      setDebugInfo(result.debug);
      setPhase("complete");
    } catch (err) {
      const errorWithDebug = err as Error & { debug?: AnalyzeDebugInfo };
      setAnalysisError(
        err instanceof Error ? err.message : "Analysis failed. Please try again.",
      );
      if (errorWithDebug.debug) {
        setDebugInfo(errorWithDebug.debug);
      }
      setPhase("error");
    }
  }, [url, forceRefresh]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleAnalyze();
  };

  const isAnalyzing = phase === "analyzing";
  const canSubmit = url.trim().length > 0 && !validationError && !isAnalyzing;
  const hasResults = phase === "complete" && (comparison !== null || dropshipResult !== null);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-8 sm:py-12 md:gap-12 md:py-16">
      <section className="space-y-6 text-center">
        <div className="bg-primary/10 text-primary mx-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
          <Flame className="size-3.5" aria-hidden="true" />
          {BRAND_TAGLINE}
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl md:leading-tight">
            <span className="text-primary">{BRAND_HOOK_BUSTED}</span>{" "}
            <span className="text-success">{BRAND_HOOK_RELIEF}</span>
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg">
            {BRAND_DESCRIPTION}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto w-full max-w-xl space-y-3"
          aria-label="Product URL analyzer"
          noValidate
        >
          <div className="relative">
            <label htmlFor="product-url" className="sr-only">
              Product URL
            </label>
            <Link2
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="product-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://store.com/products/..."
              value={url}
              onChange={(event) => handleUrlChange(event.target.value)}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={
                validationError ? "url-error" : urlHint ? "url-hint-warn" : "url-hint"
              }
              className={cn(
                "h-12 pr-4 pl-10 text-base",
                validationError && "border-destructive ring-destructive/20",
                urlHint && !validationError && "border-accent/60",
              )}
              disabled={isAnalyzing}
            />
          </div>

          <p id="url-hint" className="text-muted-foreground text-left text-xs">
            Retail store links work best — Shopify, WooCommerce, independent shops.
            Results cached 7 days.
          </p>

          {urlHint && !validationError ? (
            <p
              id="url-hint-warn"
              className="text-accent-foreground flex items-start gap-1.5 text-left text-sm"
            >
              <Flame className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {urlHint}
            </p>
          ) : null}

          {validationError ? (
            <p
              id="url-error"
              role="alert"
              className="text-destructive flex items-center gap-1.5 text-left text-sm"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {validationError}
            </p>
          ) : null}

          <label className="text-muted-foreground flex cursor-pointer items-center justify-center gap-2 text-left text-xs sm:justify-start">
            <input
              type="checkbox"
              checked={forceRefresh}
              onChange={(event) => setForceRefresh(event.target.checked)}
              className="accent-primary size-4 rounded border"
            />
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Bypass cache (force re-scrape)
          </label>

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="h-12 w-full text-base"
          >
            {isAnalyzing ? "Scanning…" : "Run Busted Scan"}
            {!isAnalyzing ? <ArrowRight aria-hidden="true" /> : null}
          </Button>
        </form>
      </section>

      {phase === "analyzing" ? (
        <AnalysisSkeleton step={progress.step} progress={progress.progress} />
      ) : null}

      {phase === "error" && analysisError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive animate-in fade-in rounded-xl border p-4 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{analysisError}</p>
          </div>
        </div>
      ) : null}

      {phase === "error" && debugInfo ? (
        <AnalysisTabs
          comparison={null}
          dropshipResult={null}
          debugInfo={debugInfo}
        />
      ) : null}

      {hasResults ? (
        <AnalysisTabs
          comparison={comparison}
          dropshipResult={dropshipResult}
          debugInfo={debugInfo}
        />
      ) : null}

      {phase === "idle" ? (
        <section
          aria-label="How it works"
          className="grid gap-4 sm:grid-cols-3"
        >
          {[
            {
              step: "1",
              title: "Paste retail link",
              body: "Use the Shopify or Instagram store where you spotted the product.",
            },
            {
              step: "2",
              title: "AI finds red flags",
              body: "Busted scrapes the page and scores dropship likelihood with Gemini.",
            },
            {
              step: "3",
              title: "Compare & monitor",
              body: "Switch to Pipeline tab for waterfall timings and live diagnostics.",
            },
          ].map((item) => (
            <article
              key={item.step}
              className="bg-muted/40 rounded-xl border p-4 text-left"
            >
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Step {item.step}
              </span>
              <h2 className="mt-1 text-sm font-semibold">{item.title}</h2>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {item.body}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
