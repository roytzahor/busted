"use client";

import { Button } from "@/components/ui/button";
import type { PartialResult as PartialResultData } from "@/lib/analyze/map-response";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Image from "next/image";

/**
 * Sprint 12 Stage 31 — partial result UI.
 *
 * Shown when the scrape stage succeeded but the AI verdict was unavailable
 * (most commonly: Gemini quota exhausted, transient 503). The product card
 * is still rendered so the visit isn't wasted; the verdict + supplier
 * comparison are replaced by a clear "try again" affordance.
 */

interface PartialResultProps {
  result: PartialResultData;
  onRetry: () => void;
  className?: string;
}

function formatUsd(v: number | null | undefined): string {
  if (typeof v !== "number" || v <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(v);
}

function reasonCopy(reason: PartialResultData["degradedReason"]): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "ai_unavailable":
      return {
        title: "AI verdict temporarily unavailable",
        body: "We scraped the product page, but the verdict service is rate-limited right now. Try again in a couple minutes — the cache will speed things up.",
      };
    case "supplier_search_failed":
      return {
        title: "Supplier match unavailable",
        body: "We got the product info, but couldn't reach AliExpress to compare prices right now.",
      };
  }
}

export function PartialResult({ result, onRetry, className }: PartialResultProps) {
  const copy = reasonCopy(result.degradedReason);

  return (
    <section
      aria-label="Partial scan result"
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 mx-auto w-full max-w-2xl space-y-4 duration-500",
        className,
      )}
    >
      {/* Banner */}
      <div
        role="status"
        className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-amber-400/8 p-5 backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15"
          >
            <AlertTriangle className="size-4 text-amber-200" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-bold text-amber-100">{copy.title}</p>
            <p className="text-sm text-amber-200/85">{copy.body}</p>
            {result.degradedDetail ? (
              <p className="mt-1 text-[11px] text-amber-200/55">
                Detail: {result.degradedDetail.slice(0, 160)}
                {result.degradedDetail.length > 160 ? "…" : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Scraped product card */}
      <article className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative aspect-square w-full max-w-[180px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <Image
              src={result.storeProduct.imageUrl}
              alt={result.storeProduct.title}
              fill
              className="object-cover"
              sizes="180px"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Scraped product
            </p>
            <h2 className="text-xl font-bold leading-tight sm:text-2xl">
              {result.storeProduct.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              Sold by {result.storeProduct.storeName}
            </p>
            <p className="text-2xl font-black tabular-nums">
              {formatUsd(result.storeProduct.priceUsd)}
            </p>
          </div>
        </div>
      </article>

      <div className="flex justify-center">
        <Button
          type="button"
          onClick={onRetry}
          size="lg"
          className="gap-1.5 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Retry scan
        </Button>
      </div>
    </section>
  );
}
