"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ProductComparisonResult } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDownRight,
  ExternalLink,
  Eye,
  Package,
  Palette,
  ShieldCheck,
  Star,
  TrendingDown,
  Truck,
  Warehouse,
} from "lucide-react";
import Image from "next/image";

interface AnalysisResultsProps {
  result: ProductComparisonResult;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
}

function formatOrders(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k+ orders`;
  }
  return `${count}+ orders`;
}

export function AnalysisResults({ result }: AnalysisResultsProps) {
  const { storeProduct, supplierProduct, savingsUsd, savingsPercent, cache } = result;
  const matchQuality = result.matchQuality ?? "high";
  const isUncertainMatch = matchQuality === "medium" || matchQuality === "low";
  const matchPct =
    typeof result.matchConfidence === "number"
      ? Math.round(result.matchConfidence * 100)
      : null;
  const isImageVerified =
    typeof result.imageMatchScore === "number" &&
    result.imageMatchScore >= 0.7 &&
    result.imageMatchSameFunction === true;

  return (
    <section
      aria-labelledby="comparison-heading"
      className="animate-in fade-in slide-in-from-bottom-6 w-full space-y-4 duration-700"
    >
      {/* ── Savings hero banner ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-success/20 bg-success/8 p-6 backdrop-blur-sm">
        {/* Top-edge shine */}
        <div aria-hidden="true" className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge className="border-success/30 bg-success/15 text-success">
                <TrendingDown className="mr-1 size-3" aria-hidden="true" />
                Save {savingsPercent}%
              </Badge>
              <Badge variant="outline" className="border-white/15 text-muted-foreground">
                {cache === "HIT" ? "Cached result" : "Fresh analysis"}
              </Badge>
              {matchPct !== null ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/15",
                    matchQuality === "high" && "border-success/30 text-success",
                    matchQuality === "medium" && "border-accent/40 text-accent-foreground",
                    matchQuality === "low" && "border-destructive/30 text-destructive",
                  )}
                >
                  {matchPct}% match · {matchQuality}
                </Badge>
              ) : null}
              {isImageVerified ? (
                <Badge
                  variant="outline"
                  className="border-success/30 bg-success/10 text-success"
                  title={result.imageMatchReasoning}
                >
                  <Eye className="mr-1 size-3" aria-hidden="true" />
                  Image-verified
                </Badge>
              ) : null}
            </div>
            <h2
              id="comparison-heading"
              className="text-2xl font-black tracking-tight sm:text-3xl"
            >
              They&apos;re overcharging you{" "}
              <span className="bg-gradient-to-r from-success to-emerald-400 bg-clip-text text-transparent">
                {formatUsd(savingsUsd)}
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatUsd(storeProduct.priceUsd)} retail vs{" "}
              {formatUsd(supplierProduct.priceUsd)} on AliExpress
            </p>
          </div>

          {/* Savings percentage — large display */}
          <div className="text-right">
            <div className="bg-gradient-to-br from-success via-emerald-400 to-green-300 bg-clip-text text-6xl font-black tabular-nums leading-none text-transparent">
              {savingsPercent}
              <span className="text-3xl">%</span>
            </div>
            <div className="text-xs text-muted-foreground">markup detected</div>
          </div>
        </div>

        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full bg-success/15 blur-3xl"
        />
      </div>

      {/* ── Bento comparison grid ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        {/* Store product — glass card, red tint */}
        <ProductCard
          variant="store"
          label="Overpriced Store Product"
          title={storeProduct.title}
          price={storeProduct.priceUsd}
          imageUrl={storeProduct.imageUrl}
          storeName={storeProduct.storeName}
        />

        {/* VS divider */}
        <div className="relative flex items-center justify-center py-2 md:flex-col md:px-2 md:py-8">
          <Separator className="absolute inset-x-4 top-1/2 md:hidden" />
          <Separator
            orientation="vertical"
            className="absolute inset-y-4 left-1/2 hidden md:block"
          />
          <div className="relative z-10 flex size-10 items-center justify-center rounded-full border border-white/12 bg-card text-xs font-black tracking-wider text-muted-foreground backdrop-blur-sm">
            vs
          </div>
        </div>

        {/* Supplier product — glass card, green tint */}
        <ProductCard
          variant="supplier"
          label="Original AliExpress Supplier"
          title={supplierProduct.title}
          price={supplierProduct.priceUsd}
          imageUrl={supplierProduct.imageUrl}
          orderCount={supplierProduct.orderCount}
          sellerRating={supplierProduct.sellerRating}
          shippingDays={supplierProduct.shippingDays}
          variantLabel={supplierProduct.variantLabel}
          totalCostUsd={supplierProduct.totalCostUsd}
          shippingCostUsd={supplierProduct.shippingCostUsd}
          warehouseCountry={supplierProduct.warehouseCountry ?? null}
          variantWarning={supplierProduct.variantWarning}
        />
      </div>

      {/* ── Uncertain-match warning ─────────────────────────────── */}
      {isUncertainMatch ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/8 p-4 text-sm backdrop-blur-sm"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-foreground"
          >
            !
          </span>
          <div className="space-y-1">
            <p className="font-semibold">Best-guess match — verify before buying</p>
            <p className="text-muted-foreground">
              Our match confidence is only {matchPct}%. Open the AliExpress link and
              compare images + specs to confirm it’s the same product.
            </p>
            {result.imageMatchReasoning ? (
              <p className="mt-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-foreground">Image AI saw:</span>{" "}
                <span className="text-muted-foreground">{result.imageMatchReasoning}</span>
                {result.imageMatchSameFunction === false ? (
                  <span className="mt-1 block text-destructive">
                    ⚠ Different function detected — this may do the same job differently.
                  </span>
                ) : null}
              </p>
            ) : null}
            {result.matchReasons && result.matchReasons.length > 0 ? (
              <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                {result.matchReasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── CTA row ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold">Ready to skip the markup?</p>
            <p className="text-sm text-muted-foreground">
              Verified supplier with {formatOrders(supplierProduct.orderCount)} and{" "}
              {supplierProduct.sellerRating}★ rating.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="glow-success h-11 w-full bg-success text-success-foreground shadow-lg shadow-success/20 transition-all hover:bg-success/90 hover:shadow-xl hover:shadow-success/35 sm:w-auto sm:min-w-[260px]"
          >
            <a
              href={supplierProduct.affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy Original on AliExpress &amp; Save
              <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>

        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        />
      </div>
    </section>
  );
}

interface ProductCardProps {
  variant: "store" | "supplier";
  label: string;
  title: string;
  price: number;
  imageUrl: string;
  storeName?: string;
  orderCount?: number;
  sellerRating?: number;
  shippingDays?: number;
  variantLabel?: string;
  totalCostUsd?: number;
  shippingCostUsd?: number;
  warehouseCountry?: string | null;
  variantWarning?: boolean;
}

function ProductCard({
  variant,
  label,
  title,
  price,
  imageUrl,
  storeName,
  orderCount,
  sellerRating,
  shippingDays,
  variantLabel,
  totalCostUsd,
  shippingCostUsd,
  warehouseCountry,
  variantWarning,
}: ProductCardProps) {
  const isStore = variant === "store";

  return (
    <article
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 backdrop-blur-sm sm:p-6",
        isStore
          ? "border-destructive/20 bg-destructive/6"
          : "border-success/20 bg-success/6",
      )}
    >
      {/* Decorative corner glow */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full blur-3xl",
          isStore ? "bg-destructive/20" : "bg-success/20",
        )}
      />

      {/* Label */}
      <div className="relative z-10 flex items-center gap-2">
        {isStore ? (
          <ArrowDownRight className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        )}
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </h3>
      </div>

      {/* Product image */}
      <div className="relative z-10 mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-black/20 shadow-sm sm:max-w-none">
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 260px, 45vw"
          unoptimized
        />
      </div>

      {/* Product info */}
      <div className="relative z-10 space-y-1.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
          {title}
        </p>
        {storeName ? (
          <p className="text-xs text-muted-foreground">Sold by {storeName}</p>
        ) : null}

        {/* Variant chip — supplier only, when we matched a SKU */}
        {!isStore && variantLabel ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success"
              title="Variant pre-selected — affiliate link opens this SKU directly"
            >
              {warehouseCountry && warehouseCountry !== "CN" ? (
                <Warehouse className="size-3" aria-hidden="true" />
              ) : (
                <Palette className="size-3" aria-hidden="true" />
              )}
              {variantLabel}
            </span>
          </div>
        ) : null}

        <p
          className={cn(
            "text-3xl font-black tabular-nums sm:text-4xl",
            isStore ? "text-destructive" : "text-success",
          )}
        >
          {formatUsd(price)}
        </p>

        {/* Total with shipping — only when shipping cost is known */}
        {!isStore &&
        typeof shippingCostUsd === "number" &&
        shippingCostUsd > 0 &&
        typeof totalCostUsd === "number" ? (
          <p className="text-xs text-muted-foreground">
            Total with shipping:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatUsd(totalCostUsd)}
            </span>{" "}
            <span className="text-muted-foreground/70">
              (+{formatUsd(shippingCostUsd)} ship)
            </span>
          </p>
        ) : null}
      </div>

      {/* Variant warning — supplier only, listing has multiple options but no match */}
      {!isStore && variantWarning ? (
        <div className="relative z-10 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Listing has multiple options — verify the correct variant before buying.
          </span>
        </div>
      ) : null}

      {/* Trust badges (supplier only) */}
      {!isStore && orderCount !== undefined && sellerRating !== undefined ? (
        <ul
          className="relative z-10 flex flex-wrap gap-2"
          aria-label="Supplier trust metrics"
        >
          <li>
            <Badge variant="secondary" className="gap-1 border border-white/10 bg-white/8">
              <Star
                className="size-3 fill-amber-400 text-amber-400"
                aria-hidden="true"
              />
              {sellerRating} rating
            </Badge>
          </li>
          <li>
            <Badge variant="secondary" className="gap-1 border border-white/10 bg-white/8">
              <Package className="size-3" aria-hidden="true" />
              {formatOrders(orderCount)}
            </Badge>
          </li>
          {shippingDays !== undefined ? (
            <li>
              <Badge
                variant="secondary"
                className="gap-1 border border-white/10 bg-white/8"
              >
                <Truck className="size-3" aria-hidden="true" />
                ~{shippingDays} day shipping
              </Badge>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Status badge */}
      <div className="relative z-10">
        {isStore ? (
          <Badge variant="destructive" className="w-fit">
            Dropship markup detected
          </Badge>
        ) : (
          <Badge className="w-fit bg-success text-success-foreground hover:bg-success">
            Verified original supplier — we got you
          </Badge>
        )}
      </div>
    </article>
  );
}
