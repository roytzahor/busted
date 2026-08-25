"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCurrency, useMoney } from "@/components/currency-provider";
import { estimateLandedCost } from "@/lib/pricing/landed-cost";
import { MatchFeedback } from "@/components/match-feedback";
import { ProductImage } from "@/components/product-image";
import { ShareButton } from "@/components/share-button";
import { trackAffiliateClick } from "@/lib/clicks";
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

interface AnalysisResultsProps {
  result: ProductComparisonResult;
}

function formatOrders(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k+ orders`;
  }
  return `${count}+ orders`;
}

export function AnalysisResults({ result }: AnalysisResultsProps) {
  const formatMoney = useMoney();
  const { storeProduct, supplierProduct, savingsUsd, savingsPercent, cache } = result;
  const matchQuality = result.matchQuality ?? "high";
  const isBestEffort = result.bestEffortOnly === true;
  // Which marketplace the match came from — labels adapt so an eBay/Amazon
  // fallback match never renders as "AliExpress".
  const networkLabel =
    result.supplierNetwork === "ebay"
      ? "eBay"
      : result.supplierNetwork === "amazon"
        ? "Amazon"
        : "AliExpress";
  const isUncertainMatch = isBestEffort || matchQuality === "medium" || matchQuality === "low";
  const isVerifiedMatch = result.verified === true;
  const verifiedByUser = result.verifiedSource === "user_feedback";
  const matchPct =
    typeof result.matchConfidence === "number"
      ? Math.round(result.matchConfidence * 100)
      : null;
  const isImageVerified =
    typeof result.imageMatchScore === "number" &&
    result.imageMatchScore >= 0.7 &&
    result.imageMatchSameFunction === true;

  // Sticky mobile buy bar — shown while the user is reading the comparison,
  // then auto-hidden once the real in-page CTA scrolls into view so it never
  // double-stacks or covers the buttons. Desktop never sees it (md:hidden).
  const ctaRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-labelledby="comparison-heading"
      className="animate-in fade-in slide-in-from-bottom-2 ease-out w-full space-y-4 duration-300"
    >
      {/* ── Savings hero banner ──────────────────────────────────── */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm",
        isBestEffort ? "border-primary/20 bg-primary/8" : "border-success/20 bg-success/8",
      )}>
        {/* Top-edge shine */}
        <div aria-hidden="true" className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {isBestEffort ? (
                <Badge className="border-primary/30 bg-primary/15 text-primary-foreground">
                  <Package className="mr-1 size-3" aria-hidden="true" />
                  Similar product found
                </Badge>
              ) : (
                <Badge className="border-success/30 bg-success/15 text-success">
                  <TrendingDown className="mr-1 size-3" aria-hidden="true" />
                  Save {savingsPercent}%
                </Badge>
              )}
              {isVerifiedMatch ? (
                <Badge
                  className="border-success/40 bg-success/15 text-success"
                  title={
                    verifiedByUser
                      ? "A user confirmed this exact match — served instantly, no AI re-run."
                      : "High-confidence match locked in — served instantly, no AI re-run."
                  }
                >
                  <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
                  {verifiedByUser ? "Verified match" : "Verified · instant"}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/15 text-muted-foreground">
                  {cache === "HIT" ? "Cached result" : "Fresh analysis"}
                </Badge>
              )}
              {matchPct !== null && !isBestEffort ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/15",
                    matchQuality === "high" && "border-success/30 text-success",
                    matchQuality === "medium" && "border-accent/40 text-accent-foreground",
                    matchQuality === "low" && "border-destructive/30 text-destructive",
                  )}
                >
                  <span className="tabular-nums">{matchPct}%</span> match · {matchQuality}
                </Badge>
              ) : null}
              {isImageVerified && !isBestEffort ? (
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
            {isBestEffort ? (
              <>
                <h2
                  id="comparison-heading"
                  className="text-2xl font-black tracking-tight sm:text-3xl"
                >
                  Closest match on{" "}
                  <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
                    {networkLabel}
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  May not be the exact same product — compare before buying
                </p>
              </>
            ) : (
              <>
                <h2
                  id="comparison-heading"
                  className="text-2xl font-black tracking-tight sm:text-3xl"
                >
                  They&apos;re overcharging you{" "}
                  <span className="bg-gradient-to-r from-success to-emerald-400 bg-clip-text text-transparent">
                    {formatMoney(savingsUsd)}
                  </span>
                </h2>
                <p className="mt-1 tabular-nums text-sm text-muted-foreground">
                  {formatMoney(storeProduct.priceUsd)} retail vs{" "}
                  {formatMoney(supplierProduct.priceUsd)} on {networkLabel}
                </p>
              </>
            )}
          </div>

          {isBestEffort ? (
            <div className="text-right">
              <div className="bg-gradient-to-br from-primary to-amber-400 bg-clip-text text-5xl font-black tabular-nums leading-none text-transparent">
                {formatMoney(supplierProduct.priceUsd)}
              </div>
              <div className="text-xs text-muted-foreground">on {networkLabel}</div>
            </div>
          ) : (
            <div className="text-right">
              <div className="bg-gradient-to-br from-success via-emerald-400 to-green-300 bg-clip-text text-6xl font-black tabular-nums leading-none text-transparent">
                {savingsPercent}
                <span className="text-3xl">%</span>
              </div>
              <div className="text-xs text-muted-foreground">markup detected</div>
            </div>
          )}
        </div>

        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full blur-3xl",
            isBestEffort ? "bg-primary/10" : "bg-success/15",
          )}
        />
      </div>

      {/* ── Bento comparison grid ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        {/* Store product — glass card, red tint */}
        <ProductCard
          variant="store"
          label="Overpriced Store Product"
          title={storeProduct.title}
          translatedTitle={storeProduct.translatedTitle}
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
          label={isBestEffort ? `Closest match on ${networkLabel}` : `Original ${networkLabel} Supplier`}
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
            <p className="font-semibold">
              {isBestEffort ? "Closest match we could find — verify before buying" : "Best-guess match — verify before buying"}
            </p>
            <p className="text-muted-foreground">
              {isBestEffort
                ? `We couldn’t confirm this is the exact same product. Open the ${networkLabel} link and compare images + specs before buying.`
                : <>Our match confidence is only <span className="tabular-nums">{matchPct}%</span>. Open the {networkLabel} link and compare images + specs to confirm it&apos;s the same product.</>
              }
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
      <div ref={ctaRef} className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold">
              {isBestEffort ? `Shop similar on ${networkLabel}` : "Ready to skip the markup?"}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatOrders(supplierProduct.orderCount)} sold ·{" "}
              {supplierProduct.sellerRating}★ seller rating.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <ShareButton
              scanId={result.scanId}
              productUrl={result.originalUrl}
              title={storeProduct.title}
              savingsPercent={savingsPercent}
              storeUsd={storeProduct.priceUsd}
              aliUsd={supplierProduct.priceUsd}
              imageUrl={storeProduct.imageUrl}
              className="w-full sm:w-auto"
            />
            <Button
              asChild
              size="lg"
              className="glow-success h-11 w-full bg-success text-success-foreground shadow-lg shadow-success/20 transition-[color,background-color,box-shadow,scale] hover:bg-success/90 hover:shadow-xl hover:shadow-success/35 active:scale-[0.96] sm:w-auto sm:min-w-[260px]"
            >
              <a
                href={supplierProduct.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackAffiliateClick({
                    scanId: result.scanId,
                    targetUrl: supplierProduct.affiliateUrl,
                  })
                }
                onAuxClick={() =>
                  trackAffiliateClick({
                    scanId: result.scanId,
                    targetUrl: supplierProduct.affiliateUrl,
                  })
                }
              >
                {isBestEffort ? `View on ${networkLabel}` : `Buy Original on ${networkLabel} & Save`}
                <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        />
      </div>

      {/* ── Match feedback (Sprint 13 learning loop) ─────────────── */}
      {result.scanId ? (
        <MatchFeedback
          scanId={result.scanId}
          variant={isBestEffort ? "best-effort" : "confident"}
        />
      ) : null}

      {/* ── Sticky mobile buy bar ────────────────────────────────── */}
      <div
        aria-hidden={!showStickyBar}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 transform-gpu transition-transform duration-300 ease-out will-change-transform md:hidden",
          showStickyBar ? "translate-y-0" : "pointer-events-none translate-y-[130%]",
        )}
      >
        {/* Top-edge shine to lift the bar off the content behind it. */}
        <div aria-hidden="true" className="shine-top h-px" />
        <div className="flex items-center gap-3 border-t border-white/10 bg-background/85 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            {isBestEffort ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">
                  Closest match on {networkLabel}
                </p>
                <p className="text-lg font-black leading-tight tabular-nums text-primary">
                  {formatMoney(supplierProduct.priceUsd)}
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-1 text-sm font-bold leading-tight text-success">
                  <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />
                  Save {formatMoney(savingsUsd)}
                  <span className="text-success/80">· {savingsPercent}%</span>
                </p>
                <p className="truncate text-xs tabular-nums text-muted-foreground">
                  {formatMoney(storeProduct.priceUsd)} →{" "}
                  <span className="font-semibold text-foreground">
                    {formatMoney(supplierProduct.priceUsd)}
                  </span>
                </p>
              </>
            )}
          </div>
          <Button
            asChild
            size="lg"
            tabIndex={showStickyBar ? undefined : -1}
            className="glow-success h-11 shrink-0 bg-success px-5 text-success-foreground shadow-lg shadow-success/25 transition-[background-color,box-shadow,scale] hover:bg-success/90 active:scale-[0.96]"
          >
            <a
              href={supplierProduct.affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackAffiliateClick({
                  scanId: result.scanId,
                  targetUrl: supplierProduct.affiliateUrl,
                })
              }
              onAuxClick={() =>
                trackAffiliateClick({
                  scanId: result.scanId,
                  targetUrl: supplierProduct.affiliateUrl,
                })
              }
            >
              {isBestEffort ? "View" : "Buy & Save"}
              <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * "≈ $X landed" under the supplier price — import VAT for the user's market
 * (keyed by their display currency). Renders nothing when there is no VAT to
 * disclose (US de minimis, IL under-$75 exemption): silence over noise.
 */
function LandedCostLine({
  itemUsd,
  shippingUsd,
}: {
  itemUsd: number;
  shippingUsd: number | null;
}) {
  const { currency, formatMoney } = useCurrency();
  const estimate = estimateLandedCost({ itemUsd, shippingUsd, currency });
  if (estimate.vatUsd <= 0) return null;
  return (
    <p
      className="tabular-nums text-xs text-muted-foreground"
      title={estimate.notes.join(" ")}
    >
      ≈{" "}
      <span className="font-semibold text-foreground">
        {formatMoney(estimate.landedUsd)}
      </span>{" "}
      landed{" "}
      <span className="text-muted-foreground/70">
        (incl. {Math.round(estimate.vatRate * 100)}% import VAT)
      </span>
    </p>
  );
}

interface ProductCardProps {
  variant: "store" | "supplier";
  label: string;
  title: string;
  /** English translation when original title was non-Latin. */
  translatedTitle?: string;
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
  translatedTitle,
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
  const formatMoney = useMoney();
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
        <ProductImage
          src={imageUrl}
          alt={title}
          sizes="(max-width: 768px) 260px, 45vw"
        />
      </div>

      {/* Product info — dir="auto" lets Hebrew/Arabic/CJK titles render
          right-to-left even when the surrounding layout is LTR. */}
      <div className="relative z-10 space-y-1.5">
        <p
          dir="auto"
          className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base"
        >
          {title}
        </p>
        {translatedTitle ? (
          <p dir="auto" className="text-xs italic text-muted-foreground/80">
            → {translatedTitle}
          </p>
        ) : null}
        {storeName ? (
          <p dir="auto" className="text-xs text-muted-foreground">
            Sold by {storeName}
          </p>
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
          {formatMoney(price)}
        </p>

        {/* Total with shipping — only when shipping cost is known */}
        {!isStore &&
        typeof shippingCostUsd === "number" &&
        shippingCostUsd > 0 &&
        typeof totalCostUsd === "number" ? (
          <p className="tabular-nums text-xs text-muted-foreground">
            Total with shipping:{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(totalCostUsd)}
            </span>{" "}
            <span className="text-muted-foreground/70">
              (+{formatMoney(shippingCostUsd)} ship)
            </span>
          </p>
        ) : null}

        {/* Landed cost — the honest total after import VAT for the user's market */}
        {!isStore ? (
          <LandedCostLine itemUsd={price} shippingUsd={shippingCostUsd ?? null} />
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
