"use client";

import { useCallback, useState } from "react";
import { AnalysisResults } from "@/components/analysis-results";
import { AnalysisSkeleton } from "@/components/analysis-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductComparisonResult } from "@/lib/mock-data";
import {
  mockAnalyzeProduct,
  validateProductUrl,
  type MockAnalyzeProgress,
} from "@/lib/mock-analyze";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, Link2, Sparkles } from "lucide-react";

type SearchPhase = "idle" | "analyzing" | "complete" | "error";

export function SearchHub() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MockAnalyzeProgress>({
    step: "Checking 7-day cache…",
    progress: 0,
  });
  const [result, setResult] = useState<ProductComparisonResult | null>(null);

  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (value.trim()) {
      setValidationError(validateProductUrl(value));
    } else {
      setValidationError(null);
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
    setResult(null);
    setPhase("analyzing");
    setProgress({ step: "Checking 7-day cache…", progress: 0 });

    try {
      const comparison = await mockAnalyzeProduct(url, setProgress);
      setResult(comparison);
      setPhase("complete");
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Analysis failed. Please try again.",
      );
      setPhase("error");
    }
  }, [url]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleAnalyze();
  };

  const isAnalyzing = phase === "analyzing";
  const canSubmit = url.trim().length > 0 && !validationError && !isAnalyzing;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:py-12 md:gap-14 md:py-16">
      <section className="space-y-6 text-center">
        <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 mx-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Consumer protection, powered by AI
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl md:leading-tight">
            Stop Paying{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              Dropshipping Markups
            </span>
          </h1>
          <p className="text-muted-foreground mx-auto max-w-xl text-base sm:text-lg">
            Paste any product link from a dropship store. BuyPass finds the
            original AliExpress supplier and shows you exactly how much
            you&apos;re being overcharged.
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
                validationError ? "url-error" : "url-hint"
              }
              className={cn(
                "h-12 pr-4 pl-10 text-base",
                validationError && "border-destructive ring-destructive/20",
              )}
              disabled={isAnalyzing}
            />
          </div>

          <p id="url-hint" className="text-muted-foreground text-left text-xs">
            Works with Shopify, WooCommerce, and most product pages.
          </p>

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

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="h-12 w-full text-base"
          >
            {isAnalyzing ? "Analyzing…" : "Analyze Product"}
            {!isAnalyzing ? (
              <ArrowRight aria-hidden="true" />
            ) : null}
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

      {phase === "complete" && result ? (
        <AnalysisResults result={result} />
      ) : null}

      {phase === "idle" ? (
        <section
          aria-label="How it works"
          className="grid gap-4 sm:grid-cols-3"
        >
          {[
            {
              step: "1",
              title: "Paste a link",
              body: "Drop any dropship product URL into the search bar.",
            },
            {
              step: "2",
              title: "We analyze it",
              body: "BuyPass scrapes the page and matches the original supplier.",
            },
            {
              step: "3",
              title: "Save big",
              body: "See the real price and buy direct from AliExpress.",
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
