"use client";

import { PaperLabel } from "@/components/ui/paper";
import { useMoney } from "@/components/currency-provider";
import type { PresenceTier } from "@/lib/analyze/presence-tier";
import { cn } from "@/lib/utils";

/**
 * The markup bar — the signature element. See DESIGN.md §4.6.
 *
 * A scale, not a progress bar: tick marks, a dimension line with labelled
 * ends, square corners. Ink and void carry the ratio instead of two colours —
 * measured 1.11:1 between `--paper-money` and paper fire, which fails
 * SC 1.4.11 and vanishes for a deuteranope, so the fill is solid `paper-ink`
 * against a hatched void instead. Renders nothing if there is no supplier
 * price: never draw a measurement from an estimate.
 */

interface MarkupBarProps {
  supplierPriceUsd: number;
  storePriceUsd: number;
  multiplier: string;
  tier: PresenceTier;
  className?: string;
}

export function MarkupBar({
  supplierPriceUsd,
  storePriceUsd,
  multiplier,
  tier,
  className,
}: MarkupBarProps) {
  const formatMoney = useMoney();

  if (
    !Number.isFinite(supplierPriceUsd) ||
    !Number.isFinite(storePriceUsd) ||
    storePriceUsd <= 0 ||
    supplierPriceUsd <= 0
  ) {
    return null;
  }

  const rawShare = supplierPriceUsd / storePriceUsd;
  // Below ~4% the block would be invisible. Clamp the RENDERED scale only —
  // the label keeps the honest multiplier regardless.
  const costShare = Math.min(1, Math.max(0.04, rawShare));
  const sharePct = Math.round(Math.min(1, rawShare) * 100);
  const flame = tier === "flame";

  return (
    <figure className={cn("space-y-2", className)}>
      <PaperLabel>
        <span>what it costs / what they add</span>
        <bdi dir="ltr">{multiplier}</bdi>
      </PaperLabel>

      <div
        role="img"
        aria-label={`Supplier price is ${sharePct}% of the retail price.`}
        style={{ "--cost-share": costShare } as React.CSSProperties}
        className={cn(
          "relative h-10 w-full overflow-hidden rounded-[1px] border border-paper-ink/25",
          // The void: 135deg hairline hatching reads as "excluded region" on a
          // technical drawing and survives grayscale and every colour-vision type.
          "bg-[repeating-linear-gradient(135deg,oklch(0.24_0.03_55/0.10)_0_2px,transparent_2px_7px)]",
        )}
      >
        {/* The real cost. Solid ink on flame (we're asserting the number);
            a 30% ghost with a solid leading edge on amber (the position is
            asserted, the mass is not) — the signature element is itself
            tier-derived, per §2.2. */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 start-0 h-full w-full origin-left rtl:origin-right",
            flame ? "bg-paper-ink" : "bg-paper-ink/30 border-e-2 border-paper-ink",
            "[transform:scaleX(var(--cost-share))]",
            "motion-safe:animate-[bar-draw_520ms_var(--ease-out)_both]",
          )}
        />
        {/* Tick marks at 25/50/75% — what makes this a scale, not a progress bar. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_calc(25%-1px),oklch(0.24_0.03_55/0.18)_calc(25%-1px)_25%)]"
        />
      </div>

      <figcaption className="flex items-baseline justify-between font-mono text-sm tracking-[-0.005em] leading-[1.45] text-paper-muted">
        <bdi dir="ltr">{formatMoney(supplierPriceUsd)}</bdi>
        <bdi dir="ltr">{formatMoney(storePriceUsd)}</bdi>
      </figcaption>
    </figure>
  );
}
