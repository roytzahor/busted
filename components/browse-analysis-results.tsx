"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackAffiliateClick } from "@/lib/clicks";
import type { BrowseAnalysisResult } from "@/lib/analyze/map-response";
import { cn } from "@/lib/utils";
import { ExternalLink, Layers, Package, ShoppingBag, Sparkles, Star } from "lucide-react";
import Image from "next/image";

interface BrowseAnalysisResultsProps {
  result: BrowseAnalysisResult;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
}

function formatOrders(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k+ sold`;
  }
  return `${count}+ sold`;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Banner label: prefer Material > Style > Category, take the freshest cue. */
function buildVibeLabel(result: BrowseAnalysisResult): string {
  const material = result.materialPriors[0];
  const style = result.styleTokens[0];
  const category = result.productCategory;

  if (material && style) return `${toTitleCase(style)} ${toTitleCase(material)}`;
  if (material) return toTitleCase(material);
  if (style) return toTitleCase(style);
  return toTitleCase(category);
}

export function BrowseAnalysisResults({ result }: BrowseAnalysisResultsProps) {
  const { storeProduct, candidates, query, productCategory, styleTokens, materialPriors, cache } =
    result;
  const vibeLabel = buildVibeLabel(result);
  const hasCandidates = candidates.length > 0;

  return (
    <section
      aria-labelledby="browse-heading"
      className="animate-in fade-in slide-in-from-bottom-6 w-full space-y-5 duration-700"
    >
      {/* ── Browse-mode hero banner (blue/gray palette) ─────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-slate-500/[0.04] to-slate-600/[0.06] p-6 backdrop-blur-sm">
        {/* Top-edge shine */}
        <div
          aria-hidden="true"
          className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px"
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge className="border-sky-400/30 bg-sky-400/15 text-sky-200">
                <Layers className="mr-1 size-3" aria-hidden="true" />
                Browse mode
              </Badge>
              <Badge variant="outline" className="border-white/15 text-muted-foreground">
                {cache === "HIT" ? "Cached scrape" : "Fresh analysis"}
              </Badge>
              <Badge variant="outline" className="border-white/15 text-muted-foreground">
                <Package className="mr-1 size-3" aria-hidden="true" />
                {productCategory}
              </Badge>
            </div>
            <h2
              id="browse-heading"
              className="text-2xl font-black tracking-tight sm:text-3xl"
            >
              Browsing a collection? Here are{" "}
              <span className="bg-gradient-to-r from-sky-300 to-slate-200 bg-clip-text text-transparent">
                popular {vibeLabel}
              </span>{" "}
              alternatives on AliExpress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We detected a catalog page on{" "}
              <span className="font-semibold text-foreground/90">{storeProduct.storeName}</span>.
              {" "}Pick a piece you like — direct from the source.
            </p>
          </div>

          <div className="hidden shrink-0 text-right sm:block">
            <div className="bg-gradient-to-br from-sky-300 via-slate-200 to-slate-400 bg-clip-text text-5xl font-black tabular-nums leading-none text-transparent">
              {candidates.length}
            </div>
            <div className="text-xs text-muted-foreground">picks shown</div>
          </div>
        </div>

        {/* Vibe chips */}
        {styleTokens.length > 0 || materialPriors.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <Sparkles className="size-3.5 text-sky-300/80" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              Vibe:
            </span>
            {[...materialPriors, ...styleTokens].slice(0, 6).map((token) => (
              <span
                key={token}
                className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-foreground/85"
              >
                {token}
              </span>
            ))}
            {query ? (
              <span className="ml-1 text-muted-foreground/70">
                · query: <code className="text-foreground/70">{query}</code>
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl"
        />
      </div>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!hasCandidates ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm backdrop-blur-sm"
        >
          <ShoppingBag
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">No browse candidates available right now</p>
            <p className="text-muted-foreground">
              {result.skipReason ??
                "We couldn’t fetch AliExpress alternatives for this collection. Try a specific product link from this store for a 1:1 supplier match."}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── 3-col candidate grid ────────────────────────────────────── */}
      {hasCandidates ? (
        <ul
          role="list"
          aria-label="AliExpress browse candidates"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {candidates.map((candidate) => (
            <li key={candidate.productId}>
              <BrowseCard candidate={candidate} scanId={result.scanId} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface BrowseCardProps {
  candidate: BrowseAnalysisResult["candidates"][number];
  scanId?: string;
}

function BrowseCard({ candidate, scanId }: BrowseCardProps) {
  const handleClick = () =>
    trackAffiliateClick({ scanId, targetUrl: candidate.affiliateUrl });

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]",
        "backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-300",
        "hover:-translate-y-0.5 hover:border-sky-400/30 hover:shadow-xl hover:shadow-sky-400/10",
      )}
    >
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden border-b border-white/8 bg-black/20">
        {candidate.imageUrl ? (
          <Image
            src={candidate.imageUrl}
            alt={candidate.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Package className="size-10" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {candidate.title}
        </p>

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xl font-black tabular-nums text-sky-200">
            {formatUsd(candidate.priceUsd)}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {candidate.sellerRating.toFixed(1)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{formatOrders(candidate.orderCount)}</span>
          </div>
        </div>

        <Button
          asChild
          size="sm"
          className="mt-auto h-9 w-full bg-sky-500/90 text-white shadow-md shadow-sky-500/20 transition-[color,background-color,box-shadow,scale] hover:bg-sky-500 hover:shadow-lg hover:shadow-sky-500/30 active:scale-[0.97]"
        >
          <a
            href={candidate.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            onAuxClick={handleClick}
            aria-label={`View ${candidate.title} on AliExpress`}
          >
            View on AliExpress
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </article>
  );
}
