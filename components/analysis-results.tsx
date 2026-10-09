"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Paper, PaperLabel } from "@/components/ui/paper";
import { SilentBoundary } from "@/components/ui/silent-boundary";
import { useCurrency, useMoney } from "@/components/currency-provider";
import { MatchFeedback } from "@/components/match-feedback";
import { ProductImage } from "@/components/product-image";
import { ShareButton } from "@/components/share-button";
import { VerdictSheet } from "@/components/verdict-sheet";
import { buildOfferView, type OfferView } from "@/lib/analyze/offer-view";
import { AFFILIATE_DISCLOSURE } from "@/lib/brand";
import { trackAffiliateClick } from "@/lib/clicks";
import type { ProductComparisonResult } from "@/lib/mock-data";
import { estimateLandedCost } from "@/lib/pricing/landed-cost";
import { cn } from "@/lib/utils";
import { AlertTriangle, ExternalLink, Palette, Warehouse } from "lucide-react";

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
 * A scan with a supplier match, as The Ledger (DESIGN.md §5.2/§5.3, spec 0004).
 *
 * Reading order IS the trust argument and is enforced in DOM order (§8.1):
 * the verdict sheet and its evidence, then the offer line, then the supplier
 * listing, then any uncertainty as prose, then the disclosure and the money
 * link — last. No sticky CTA, no glow, no gradient: we are paid for the
 * answer, so the link may never outshout or precede the reasoning (§8.2).
 *
 * What may be SAID comes from `buildOfferView()` (spec 0002): no invented
 * prices or trust data, identity wording that follows the evidence, tier
 * wording that follows the server. On `silent` nothing here mounts.
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
      <LedgerOffer result={result} offer={offer} />
    </SilentBoundary>
  );
}

function LedgerOffer({ result, offer }: { result: ProductComparisonResult; offer: OfferView }) {
  const formatMoney = useMoney();
  const { storeProduct, supplierProduct } = result;
  const { networkLabel, savingsUsd, savingsPercent, storePriceUsd, supplierPriceUsd } = offer;
  const isClosest = offer.matchKind === "closest";
  const isSame = offer.matchKind === "same";
  const hasSaving = savingsUsd !== null && savingsPercent !== null;
  const isFlame = offer.tier === "flame";
  // Missing data must degrade, never promote: defaulting to "high" would
  // suppress the uncertain-match warning on a response the server never scored.
  const matchQuality = result.matchQuality ?? "low";
  const isUncertainMatch =
    isClosest || result.matchQuality == null || matchQuality === "medium" || matchQuality === "low";
  const matchPct =
    typeof result.matchConfidence === "number" ? Math.round(result.matchConfidence * 100) : null;
  const supplierPriceText = supplierPriceUsd !== null ? formatMoney(supplierPriceUsd) : null;

  // Observed prices decide the sheet's figure whenever both are known for a
  // listing that is at least a likely match — including when the answer is
  // "no figure" (not cheaper). Hedged when the identity is (spec 0004, REQ-3).
  // A closest match is a different product, so its price measures nothing.
  const observed =
    storePriceUsd !== null && supplierPriceUsd !== null && !isClosest
      ? { storeUsd: storePriceUsd, supplierUsd: supplierPriceUsd, confirmed: isSame }
      : undefined;
  // The money link never appears without its reasoning (§8.1).
  const ctaHref = result.dropshipPrediction ? offer.ctaHref : null;
  const differentFunction = result.imageMatchSameFunction === false;

  const trackClick = () =>
    ctaHref ? trackAffiliateClick({ scanId: result.scanId, targetUrl: ctaHref }) : undefined;

  // Offer line. Accusation ("overcharging") only at flame with a real saving;
  // amber speaks of signals (spec 0002, REQ-4/REQ-6).
  let heading: ReactNode;
  let subline: ReactNode;
  if (isClosest) {
    heading = <>Closest match on {networkLabel}</>;
    subline = "May not be the exact same product — compare before buying.";
  } else if (hasSaving && isFlame) {
    heading = <>They&apos;re overcharging you {formatMoney(savingsUsd)}</>;
    subline = (
      <>
        {formatMoney(storePriceUsd!)} here, {supplierPriceText} on {networkLabel} — {savingsPercent}% cheaper.
      </>
    );
  } else if (hasSaving) {
    heading = (
      <>
        Listed for {formatMoney(savingsUsd)} less on {networkLabel}
      </>
    );
    subline = (
      <>
        Dropship signals detected · {formatMoney(storePriceUsd!)} here, {supplierPriceText} there —{" "}
        {savingsPercent}% cheaper.
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
        ? "We couldn’t read this store’s price — compare before buying."
        : "Not cheaper than this store’s price.",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  // One quiet metadata line instead of a row of chips. Match confidence is
  // about the listing, not the verdict, so it does not re-open the sheet.
  const meta = [
    matchPct !== null && !isClosest ? `${matchPct}% match · ${matchQuality}` : null,
    isSame && result.verified ? (result.verifiedSource === "user_feedback" ? "user-verified" : "verified") : null,
    typeof result.imageMatchScore === "number" &&
    result.imageMatchScore >= 0.7 &&
    result.imageMatchSameFunction === true &&
    !isClosest
      ? "image-verified"
      : null,
    result.cache === "HIT" ? "cached" : null,
  ].filter(Boolean);

  return (
    <section
      aria-label="Scan result"
      className="animate-in fade-in slide-in-from-bottom-2 ease-out w-full space-y-10 duration-300"
    >
      {/* 1 — the verdict, its bar and its evidence. */}
      {result.dropshipPrediction ? (
        <VerdictSheet
          prediction={result.dropshipPrediction}
          tier={offer.tier}
          storeName={storeProduct.storeName}
          observed={observed}
        />
      ) : null}

      {/* 2…5 — the offer, in the room. */}
      <div aria-labelledby="offer-heading" role="region" className="w-full max-w-xl space-y-4">
        <header className="space-y-1.5">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase rtl:font-sans rtl:text-[11px] rtl:tracking-[0.06em] rtl:normal-case">
            {offer.supplierLabel}
          </p>
          {/* dir="auto": the copy is English today, and an English sentence
              in an RTL page otherwise has its punctuation and prices
              reordered (".here, $7.42 … $64.32") — verified in a browser. */}
          <h2 id="offer-heading" dir="auto" className="text-xl font-semibold tracking-tight text-balance">
            {heading}
          </h2>
          <p dir="auto" className="text-sm text-muted-foreground tabular-nums text-pretty">{subline}</p>
          {meta.length > 0 ? (
            <p dir="auto" className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
              {meta.join(" · ")}
            </p>
          ) : null}
        </header>

        <SupplierCard
          onPaper={isSame}
          networkLabel={networkLabel}
          title={supplierProduct.title}
          priceUsd={supplierPriceUsd}
          imageUrl={supplierProduct.imageUrl}
          trust={offer.trust}
          variantLabel={supplierProduct.variantLabel}
          totalCostUsd={supplierProduct.totalCostUsd}
          shippingCostUsd={supplierProduct.shippingCostUsd}
          warehouseCountry={supplierProduct.warehouseCountry ?? null}
          variantWarning={supplierProduct.variantWarning}
        />

        {/* Uncertainty is prose in the reading column — never a chip, never
            collapsed (§8.3). */}
        {isUncertainMatch || differentFunction ? (
          <div role="status" dir="auto" className="space-y-1.5 border-s-2 border-accent/60 ps-3 text-sm">
            {isUncertainMatch ? (
              <>
            <p className="font-semibold">
              {isClosest
                ? "Closest match we could find — verify before buying."
                : "Best-guess match — verify before buying."}
            </p>
            <p className="text-muted-foreground">
              {isClosest || matchPct === null ? (
                `We couldn’t confirm this is the exact same product. Open the ${networkLabel} listing and compare images and specs before buying.`
              ) : (
                <>
                  Our match confidence is only <span className="tabular-nums">{matchPct}%</span>. Open the{" "}
                  {networkLabel} listing and compare images and specs to confirm it&apos;s the same product.
                </>
              )}
            </p>
              </>
            ) : null}
            {result.imageMatchReasoning ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Image AI saw:</span> {result.imageMatchReasoning}
              </p>
            ) : null}
            {/* Never conditional on reasoning or match quality (§8.3). */}
            {differentFunction ? (
              <p className="text-xs text-destructive">
                Different function detected — this may do the same job differently.
              </p>
            ) : null}
            {result.matchReasons && result.matchReasons.length > 0 ? (
              <ul className="list-disc ps-4 text-xs text-muted-foreground">
                {result.matchReasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* The money link — last, plain, disclosed in its own container. */}
        <div data-affiliate-cta="" className="space-y-3 border-t border-border pt-4">
          {ctaHref ? (
            <p dir="auto" className="text-xs text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            {ctaHref ? (
              <Button
                asChild
                size="lg"
                className="h-11 w-full bg-success text-success-foreground transition-[background-color,scale] hover:bg-success/90 active:scale-[0.97] sm:w-auto"
              >
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={trackClick}
                  onAuxClick={trackClick}
                >
                  {offer.ctaLabel}
                  <ExternalLink className="ms-1.5 size-4" aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>

      </div>

      {/* After the offer region, so the money link is the region's last
          interactive element (spec 0004, REQ-1). */}
      {result.scanId ? (
        <div data-match-feedback="" className="w-full max-w-xl">
          <MatchFeedback scanId={result.scanId} variant={isClosest ? "best-effort" : "confident"} />
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
function LandedCostLine({ itemUsd, shippingUsd }: { itemUsd: number; shippingUsd: number | null }) {
  const { currency, formatMoney } = useCurrency();
  const estimate = estimateLandedCost({ itemUsd, shippingUsd, currency });
  if (estimate.vatUsd <= 0) return null;
  return (
    <p className="tabular-nums text-xs opacity-80" title={estimate.notes.join(" ")}>
      ≈ <span className="font-semibold">{formatMoney(estimate.landedUsd)}</span> landed (incl.{" "}
      {Math.round(estimate.vatRate * 100)}% import VAT)
    </p>
  );
}

interface SupplierCardProps {
  /** Paper is for facts we stand behind: a confirmed same-product match only (§4.1). */
  onPaper: boolean;
  networkLabel: string;
  title: string;
  priceUsd: number | null;
  imageUrl: string;
  trust: OfferView["trust"];
  variantLabel?: string;
  totalCostUsd?: number;
  shippingCostUsd?: number;
  warehouseCountry: string | null;
  variantWarning?: boolean;
}

function SupplierCard({
  onPaper,
  networkLabel,
  title,
  priceUsd,
  imageUrl,
  trust,
  variantLabel,
  totalCostUsd,
  shippingCostUsd,
  warehouseCountry,
  variantWarning,
}: SupplierCardProps) {
  const formatMoney = useMoney();
  const trustLine = [
    trust.sellerRating !== undefined ? `${trust.sellerRating}★ seller` : null,
    trust.orderCount !== undefined ? formatOrders(trust.orderCount) : null,
    trust.shippingDays !== undefined ? `~${trust.shippingDays} days to ship` : null,
  ].filter(Boolean);

  const body = (
    <>
      <div className="flex gap-4">
        <div
          className={cn(
            "relative size-24 shrink-0 overflow-hidden rounded-[2px] border sm:size-28",
            onPaper ? "border-paper-ink/15" : "border-border",
          )}
        >
          <ProductImage src={imageUrl} alt={title} sizes="112px" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p dir="auto" className="line-clamp-2 text-sm leading-snug font-medium">
            {title}
          </p>
          {variantLabel ? (
            <p
              className="inline-flex items-center gap-1.5 text-xs opacity-80"
              title="Variant pre-selected — the link opens this SKU directly"
            >
              {warehouseCountry && warehouseCountry !== "CN" ? (
                <Warehouse className="size-3" aria-hidden="true" />
              ) : (
                <Palette className="size-3" aria-hidden="true" />
              )}
              {variantLabel}
            </p>
          ) : null}
          {priceUsd !== null ? (
            <p className="font-mono text-2xl font-semibold tracking-[-0.02em] tabular-nums">
              <bdi dir="ltr">{formatMoney(priceUsd)}</bdi>
            </p>
          ) : null}
          {typeof shippingCostUsd === "number" && shippingCostUsd > 0 && typeof totalCostUsd === "number" ? (
            <p className="tabular-nums text-xs opacity-80">
              Total with shipping: <span className="font-semibold">{formatMoney(totalCostUsd)}</span> (+
              {formatMoney(shippingCostUsd)} ship)
            </p>
          ) : null}
          {priceUsd !== null ? <LandedCostLine itemUsd={priceUsd} shippingUsd={shippingCostUsd ?? null} /> : null}
          {trustLine.length > 0 ? (
            <p dir="auto" className="text-xs opacity-80" aria-label="Supplier trust metrics, as the marketplace reports them">
              {trustLine.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      {variantWarning ? (
        <p className="flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          This listing has several options — check you pick the same variant before buying.
        </p>
      ) : null}
    </>
  );

  if (onPaper) {
    return (
      <Paper>
        <PaperLabel>
          <span>confirmed same product</span>
          <span dir="ltr">{networkLabel}</span>
        </PaperLabel>
        {body}
      </Paper>
    );
  }
  return <div className="space-y-3 rounded-[2px] border border-border p-4">{body}</div>;
}
