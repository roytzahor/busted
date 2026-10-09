"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SilentBoundary } from "@/components/ui/silent-boundary";
import { useCurrency, useMoney } from "@/components/currency-provider";
import { estimateLandedCost } from "@/lib/pricing/landed-cost";
import { MatchFeedback } from "@/components/match-feedback";
import { ProductImage } from "@/components/product-image";
import { ShareButton } from "@/components/share-button";
import { buildOfferView, type OfferView } from "@/lib/analyze/offer-view";
import { AFFILIATE_DISCLOSURE, AFFILIATE_DISCLOSURE_SHORT } from "@/lib/brand";
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

/**
 * The supplier offer. Everything it may say comes from `buildOfferView()`
 * (spec 0002): no invented prices or trust metrics, identity wording that
 * follows the evidence, accusation wording that follows the server tier, and
 * a disclosure before every affiliate link. On `silent` the whole offer is
 * not mounted — one muted line, per trust/presence-tier-contract.
 */
export function AnalysisResults({ result }: AnalysisResultsProps) {
  const formatMoney = useMoney();
  const offer = buildOfferView(result);
  const { storeProduct } = result;

  return (
    <SilentBoundary
      tier={offer.tier}
      quiet={
        <p dir="auto" className="text-sm text-muted-foreground">
          {storeProduct.title}
          {offer.storePriceUsd !== null ? (
            <>
              {" · "}
              <bdi dir="ltr">{formatMoney(offer.storePriceUsd)}</bdi>
            </>
          ) : null}
        </p>
      }
    >
      <Offer result={result} offer={offer} />
    </SilentBoundary>
  );
}

function Offer({ result, offer }: { result: ProductComparisonResult; offer: OfferView }) {
  const formatMoney = useMoney();
  const { storeProduct, supplierProduct, cache } = result;
  const { networkLabel, savingsUsd, savingsPercent, storePriceUsd, supplierPriceUsd } = offer;
  const isClosest = offer.matchKind === "closest";
  const hasSaving = savingsUsd !== null && savingsPercent !== null;
  const isFlame = offer.tier === "flame";
  // Missing data must degrade, never promote: defaulting to "high" would
  // suppress the uncertain-match warning on a response the server never scored.
  const matchQuality = result.matchQuality ?? "low";
  const isUncertainMatch =
    isClosest ||
    result.matchQuality == null ||
    matchQuality === "medium" ||
    matchQuality === "low";
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
  const supplierPriceText = supplierPriceUsd !== null ? formatMoney(supplierPriceUsd) : null;

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

  const trackClick = () =>
    offer.ctaHref
      ? trackAffiliateClick({ scanId: result.scanId, targetUrl: offer.ctaHref })
      : undefined;

  // Headline copy. Accusation ("overcharging") is earned only at flame with a
  // real saving; amber speaks of signals (spec 0002, REQ-4/REQ-6).
  let heading: ReactNode;
  let subline: ReactNode;
  if (isClosest) {
    heading = <>Closest match on {networkLabel}</>;
    subline = "May not be the exact same product — compare before buying";
  } else if (hasSaving && isFlame) {
    heading = (
      <>
        They&apos;re overcharging you{" "}
        <span className="text-success">{formatMoney(savingsUsd)}</span>
      </>
    );
    subline = (
      <>
        {formatMoney(storePriceUsd!)} here vs {supplierPriceText} on {networkLabel}
      </>
    );
  } else if (hasSaving) {
    heading = (
      <>
        Listed for <span className="text-success">{formatMoney(savingsUsd)}</span> less on{" "}
        {networkLabel}
      </>
    );
    subline = (
      <>
        Dropship signals detected · {formatMoney(storePriceUsd!)} here vs {supplierPriceText} on{" "}
        {networkLabel}
      </>
    );
  } else {
    heading = supplierPriceText ? (
      <>
        Found on {networkLabel} for {supplierPriceText}
      </>
    ) : (
      <>Found on {networkLabel}</>
    );
    subline = [
      isFlame ? null : "Dropship signals detected",
      storePriceUsd === null
        ? "We couldn’t read this store’s price — compare before buying"
        : "Not cheaper than this store’s price",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const storeBadge = isFlame
    ? hasSaving
      ? "Dropship markup detected"
      : "Dropship store detected"
    : "Dropship signals detected";

  const trustParts = [
    offer.trust.orderCount !== undefined ? `${formatOrders(offer.trust.orderCount)} sold` : null,
    offer.trust.sellerRating !== undefined ? `${offer.trust.sellerRating}★ seller rating` : null,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="comparison-heading"
      className="animate-in fade-in slide-in-from-bottom-2 ease-out w-full space-y-4 duration-300"
    >
      {/* ── Savings hero banner ──────────────────────────────────── */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm",
        hasSaving ? "border-success/20 bg-success/8" : "border-primary/20 bg-primary/8",
      )}>
        {/* Top-edge shine */}
        <div aria-hidden="true" className="shine-top pointer-events-none absolute inset-x-0 top-0 h-px" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {hasSaving ? (
                <Badge className="border-success/30 bg-success/15 text-success">
                  <TrendingDown className="mr-1 size-3" aria-hidden="true" />
                  {savingsPercent}% cheaper
                </Badge>
              ) : (
                <Badge className="border-primary/30 bg-primary/15 text-primary-foreground">
                  <Package className="mr-1 size-3" aria-hidden="true" />
                  {isClosest ? "Similar product found" : `Found on ${networkLabel}`}
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
              {matchPct !== null && !isClosest ? (
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
              {isImageVerified && !isClosest ? (
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
              {heading}
            </h2>
            <p className="mt-1 tabular-nums text-sm text-muted-foreground">{subline}</p>
          </div>

          {hasSaving ? (
            <div className="text-right">
              <div className="text-6xl font-black tabular-nums leading-none text-success">
                {savingsPercent}
                <span className="text-3xl">%</span>
              </div>
              {/* A share of the store price — a saving, not a markup. */}
              <div className="text-xs text-muted-foreground">cheaper on {networkLabel}</div>
            </div>
          ) : supplierPriceText ? (
            <div className="text-right">
              <div className="text-5xl font-black tabular-nums leading-none text-primary">
                {supplierPriceText}
              </div>
              <div className="text-xs text-muted-foreground">on {networkLabel}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Comparison grid ──────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        <ProductCard
          variant="store"
          label="This store"
          title={storeProduct.title}
          translatedTitle={storeProduct.translatedTitle}
          price={storePriceUsd}
          priceTone={isFlame ? "accuse" : "neutral"}
          imageUrl={storeProduct.imageUrl}
          storeName={storeProduct.storeName}
          statusBadge={storeBadge}
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

        <ProductCard
          variant="supplier"
          label={offer.supplierLabel}
          confirmed={offer.matchKind === "same"}
          title={supplierProduct.title}
          price={supplierPriceUsd}
          imageUrl={supplierProduct.imageUrl}
          trust={offer.trust}
          variantLabel={supplierProduct.variantLabel}
          totalCostUsd={supplierProduct.totalCostUsd}
          shippingCostUsd={supplierProduct.shippingCostUsd}
          warehouseCountry={supplierProduct.warehouseCountry ?? null}
          variantWarning={supplierProduct.variantWarning}
          statusBadge={offer.matchKind === "same" ? "Confirmed same product" : undefined}
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
              {isClosest ? "Closest match we could find — verify before buying" : "Best-guess match — verify before buying"}
            </p>
            <p className="text-muted-foreground">
              {isClosest || matchPct === null
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
              {isClosest
                ? `Shop similar on ${networkLabel}`
                : hasSaving && isFlame
                  ? "Ready to skip the markup?"
                  : hasSaving
                    ? `Get it for less on ${networkLabel}`
                    : `Compare on ${networkLabel}`}
            </p>
            {trustParts.length > 0 ? (
              <p className="text-sm text-muted-foreground">{trustParts.join(" · ")}</p>
            ) : null}
          </div>
          <div data-affiliate-cta="" className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {/* Above the button, never below it: the conflict has to be
                visible at the moment of the click. */}
            {offer.ctaHref ? (
              <p className="text-xs text-muted-foreground sm:text-right">
                {AFFILIATE_DISCLOSURE}
              </p>
            ) : null}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <ShareButton
              scanId={result.scanId}
              productUrl={result.originalUrl}
              title={storeProduct.title}
              savingsPercent={savingsPercent}
              // The share card strikes through the store price — only true
              // when there is a real saving on the same product.
              storeUsd={hasSaving ? storePriceUsd! : undefined}
              aliUsd={hasSaving ? supplierPriceUsd! : undefined}
              imageUrl={storeProduct.imageUrl}
              className="w-full sm:w-auto"
            />
            {offer.ctaHref ? (
              <Button
                asChild
                size="lg"
                className="glow-success h-11 w-full bg-success text-success-foreground shadow-lg shadow-success/20 transition-[color,background-color,box-shadow,scale] hover:bg-success/90 hover:shadow-xl hover:shadow-success/35 active:scale-[0.96] sm:w-auto sm:min-w-[260px]"
              >
                <a
                  href={offer.ctaHref}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={trackClick}
                  onAuxClick={trackClick}
                >
                  {offer.ctaLabel}
                  <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
                </a>
              </Button>
            ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Match feedback (Sprint 13 learning loop) ─────────────── */}
      {result.scanId ? (
        <MatchFeedback
          scanId={result.scanId}
          variant={isClosest ? "best-effort" : "confident"}
        />
      ) : null}

      {/* ── Sticky mobile buy bar ────────────────────────────────── */}
      {offer.ctaHref ? (
        <div
          aria-hidden={!showStickyBar}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 transform-gpu transition-transform duration-300 ease-out will-change-transform md:hidden",
            showStickyBar ? "translate-y-0" : "pointer-events-none translate-y-[130%]",
          )}
        >
          {/* Top-edge shine to lift the bar off the content behind it. */}
          <div aria-hidden="true" className="shine-top h-px" />
          <div data-affiliate-cta="" className="border-t border-white/10 bg-background/85 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            {/* The bar is its own CTA container, so it carries its own
                disclosure — the in-page line is off screen while it shows. */}
            <p className="mb-1.5 text-[10px] text-muted-foreground">{AFFILIATE_DISCLOSURE_SHORT}</p>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {hasSaving ? (
                  <>
                    <p className="flex items-center gap-1 text-sm font-bold leading-tight text-success">
                      <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />
                      Save {formatMoney(savingsUsd)}
                      <span className="text-success/80">· {savingsPercent}%</span>
                    </p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {formatMoney(storePriceUsd!)} →{" "}
                      <span className="font-semibold text-foreground">{supplierPriceText}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">
                      {offer.supplierLabel}
                    </p>
                    {supplierPriceText ? (
                      <p className="text-lg font-black leading-tight tabular-nums text-primary">
                        {supplierPriceText}
                      </p>
                    ) : null}
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
                  href={offer.ctaHref}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={trackClick}
                  onAuxClick={trackClick}
                >
                  {hasSaving && !isClosest ? "Buy & save" : "View"}
                  <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
  /** Null when unknown — rendered as an absence, never as $0. */
  price: number | null;
  /** Store only: red is an accusation, earned at flame. */
  priceTone?: "accuse" | "neutral";
  /** Supplier only: the match is confirmed (Gold Path or image-verified high). */
  confirmed?: boolean;
  imageUrl: string;
  storeName?: string;
  trust?: OfferView["trust"];
  variantLabel?: string;
  totalCostUsd?: number;
  shippingCostUsd?: number;
  warehouseCountry?: string | null;
  variantWarning?: boolean;
  statusBadge?: string;
}

function ProductCard({
  variant,
  label,
  title,
  translatedTitle,
  price,
  priceTone = "neutral",
  confirmed = false,
  imageUrl,
  storeName,
  trust,
  variantLabel,
  totalCostUsd,
  shippingCostUsd,
  warehouseCountry,
  variantWarning,
  statusBadge,
}: ProductCardProps) {
  const formatMoney = useMoney();
  const isStore = variant === "store";
  const hasTrust =
    !isStore &&
    trust !== undefined &&
    (trust.orderCount !== undefined || trust.sellerRating !== undefined || trust.shippingDays !== undefined);

  return (
    <article
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 backdrop-blur-sm sm:p-6",
        isStore
          ? priceTone === "accuse"
            ? "border-destructive/20 bg-destructive/6"
            : "border-white/10 bg-white/[0.03]"
          : "border-success/20 bg-success/6",
      )}
    >
      {/* Label */}
      <div className="relative z-10 flex items-center gap-2">
        {isStore ? (
          <ArrowDownRight
            className={cn("size-4 shrink-0", priceTone === "accuse" ? "text-destructive" : "text-muted-foreground")}
            aria-hidden="true"
          />
        ) : confirmed ? (
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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

        {price !== null ? (
          <p
            className={cn(
              "text-3xl font-black tabular-nums sm:text-4xl",
              isStore ? (priceTone === "accuse" ? "text-destructive" : "text-foreground") : "text-success",
            )}
          >
            {formatMoney(price)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Price not found on the page</p>
        )}

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
        {!isStore && price !== null ? (
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

      {/* Trust metrics (supplier only) — only what the source reported */}
      {hasTrust ? (
        <ul
          className="relative z-10 flex flex-wrap gap-2"
          aria-label="Supplier trust metrics"
        >
          {trust!.sellerRating !== undefined ? (
            <li>
              <Badge variant="secondary" className="gap-1 border border-white/10 bg-white/8">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                {trust!.sellerRating} rating
              </Badge>
            </li>
          ) : null}
          {trust!.orderCount !== undefined ? (
            <li>
              <Badge variant="secondary" className="gap-1 border border-white/10 bg-white/8">
                <Package className="size-3" aria-hidden="true" />
                {formatOrders(trust!.orderCount)}
              </Badge>
            </li>
          ) : null}
          {trust!.shippingDays !== undefined ? (
            <li>
              <Badge variant="secondary" className="gap-1 border border-white/10 bg-white/8">
                <Truck className="size-3" aria-hidden="true" />
                ~{trust!.shippingDays} day shipping
              </Badge>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Status badge */}
      {statusBadge ? (
        <div className="relative z-10">
          <Badge
            variant={isStore ? (priceTone === "accuse" ? "destructive" : "outline") : "default"}
            className={cn(
              "w-fit",
              isStore && priceTone !== "accuse" && "border-accent/40 text-accent-foreground",
              !isStore && "bg-success text-success-foreground hover:bg-success",
            )}
          >
            {statusBadge}
          </Badge>
        </div>
      ) : null}
    </article>
  );
}
