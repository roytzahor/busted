"use client";

import { Paper, PaperLabel, PaperRule } from "@/components/ui/paper";
import { MarkupBar } from "@/components/ui/markup-bar";
import { Stamp } from "@/components/ui/stamp";
import type { PresenceTier } from "@/lib/analyze/presence-tier";
import { formatMultiplier } from "@/lib/analyze/markup-multiplier";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import { cn } from "@/lib/utils";

/**
 * The verdict headline, in the register the evidence earns. See DESIGN.md §5.
 *
 * Two axes, deliberately kept separate:
 *   - `tier` decides how LOUD to be. It is computed on the server and passed
 *     through verbatim; deriving it here from `prediction.confidence` would let
 *     this page and the extension badge disagree about our own confidence.
 *   - `verdict` decides WHAT WE SAY. `computePresenceTier()` returns silent for
 *     every non-dropship verdict, so a legit brand and an unreadable page share
 *     a tier — right for a badge, wrong for a sentence.
 *
 * The restraint is the point. A tool that performs certainty it does not have
 * is exactly as untrustworthy as the stores it audits, so `silent` renders as
 * bare text with no sheet at all, and that is what buys the right to shout on
 * `flame`.
 */

interface VerdictSheetProps {
  prediction: DropshipPrediction;
  tier: PresenceTier;
  storeName: string;
  /**
   * Prices we actually observed: the resolved store price and the matched
   * listing's price (spec 0004). When present they — never the model's
   * estimates — decide the multiplier, the bar and the stamp. `confirmed` is
   * whether the listing is known to be the same product: a likely match gets
   * a hedged figure (≈), the ghost bar and no figure on the stamp.
   */
  observed?: { storeUsd: number; supplierUsd: number; confirmed: boolean };
  className?: string;
}

function markupMultiplier(prediction: DropshipPrediction): string | null {
  // Prefer the ratio of the two USD estimates — the same source MarkupBar
  // draws its fill from — over the model's independently-estimated
  // estimatedMarkupPercent. The model fills in all three fields from the
  // same prompt with no arithmetic constraint between them; deriving both
  // the headline figure and the bar from one source guarantees the giant
  // "×N" text, the stamp, and the to-scale bar underneath it can never show
  // three different ratios for the same verdict.
  const { estimatedStorePriceUsd: store, estimatedSupplierPriceUsd: supplier } = prediction;
  if (
    store !== null &&
    supplier !== null &&
    Number.isFinite(store) &&
    Number.isFinite(supplier) &&
    supplier > 0 &&
    store > 0
  ) {
    return formatMultiplier(store / supplier);
  }
  const pct = prediction.estimatedMarkupPercent;
  if (pct === null || !Number.isFinite(pct) || pct <= 0) return null;
  return formatMultiplier(1 + pct / 100);
}

export function VerdictSheet({
  prediction,
  tier,
  storeName,
  observed,
  className,
}: VerdictSheetProps) {
  const verdict = prediction.verdict;
  const confidencePct = Math.round(prediction.confidence * 100);

  // ── Silent ───────────────────────────────────────────────────────────────
  // No paper, no colour, no card. Two different messages share this tier.
  if (tier === "silent") {
    const legit = verdict === "legit";
    return (
      <section
        aria-labelledby="verdict-heading"
        className={cn("w-full space-y-2", className)}
      >
        <h2
          id="verdict-heading"
          className={cn(
            "text-lg font-semibold tracking-tight",
            legit ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {legit
            ? `${storeName} looks like the real seller.`
            : verdict === "not_a_product"
              ? "This page isn't a product."
              : "We couldn't tell."}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {legit
            ? "No markup signals worth flagging. Nothing to route around here."
            : verdict === "not_a_product"
              ? "Paste a specific product URL and we'll take another look."
              : "This page didn't give us enough to stand behind a verdict, so we're not going to guess."}
        </p>
      </section>
    );
  }

  // ── Flame / Amber ────────────────────────────────────────────────────────
  const flame = tier === "flame";
  // Observed prices are a measurement; estimates are not (DESIGN §8.4,
  // markup-bar.tsx: "never draw a measurement from an estimate"). So an
  // estimate prints with "≈", draws no bar, and earns no figure on the stamp.
  // When observed prices exist they are the answer even when the answer is
  // "no figure" (under 1.5×, or not cheaper at all) — falling back to the
  // model's estimate there would print "≈×8.7" beside "20% cheaper".
  const hasObserved = observed !== undefined && observed.supplierUsd > 0 && observed.storeUsd > 0;
  const observedMultiplier = hasObserved
    ? formatMultiplier(observed.storeUsd / observed.supplierUsd)
    : null;
  const confirmed = hasObserved && observed.confirmed;
  const estimatedMultiplier = hasObserved ? null : markupMultiplier(prediction);
  const multiplierText = observedMultiplier
    ? confirmed
      ? observedMultiplier
      : `≈${observedMultiplier}`
    : estimatedMultiplier
      ? `≈${estimatedMultiplier}`
      : null;

  return (
    <section
      aria-labelledby="verdict-heading"
      className={cn("relative w-full max-w-xl", className)}
    >
      <Paper torn={flame}>
        <PaperLabel>
          <span>{flame ? "what they charge" : "what this looks like"}</span>
          <span dir="ltr">{storeName}</span>
        </PaperLabel>

        <h2 id="verdict-heading" className="sr-only">
          {flame
            ? `Dropship detected, ${confidencePct}% confidence`
            : `Possible dropship, ${confidencePct}% confidence`}
        </h2>

        {/* The multiplier is the argument, so it gets the size. Marked
            aria-hidden because the sr-only heading above already states the
            verdict — a screen reader should not hear "times 8.7" twice. */}
        {flame && multiplierText ? (
          <p
            aria-hidden="true"
            className="font-mono text-6xl leading-none font-bold tracking-[-0.04em] sm:text-7xl"
          >
            {/* bdi: "×8.7" is neutral + weak characters, so an RTL page
                renders it "8.7×" without an isolate. */}
            <bdi dir="ltr">{multiplierText}</bdi>
          </p>
        ) : null}

        <p dir="auto" className="text-lg font-semibold tracking-tight text-balance">
          {flame
            ? "They're marking this up."
            : "This might be a dropship — we're not sure."}
        </p>

        <p dir="auto" className="max-w-prose text-sm leading-relaxed text-paper-muted">
          {prediction.reasoning}
        </p>

        {hasObserved && observedMultiplier ? (
          <MarkupBar
            supplierPriceUsd={observed.supplierUsd}
            storePriceUsd={observed.storeUsd}
            multiplier={multiplierText ?? observedMultiplier}
            // A likely match asserts the position, not the mass — the same
            // ghost fill amber uses (DESIGN §2.2: the bar is tier-derived).
            tier={confirmed ? tier : "amber"}
          />
        ) : null}

        {prediction.reasoningSignals.length > 0 ? (
          <>
            <PaperRule />
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] tracking-[0.14em] text-paper-muted uppercase">
                what we found
              </p>
              <ul className="space-y-1 text-sm leading-relaxed">
                {prediction.reasoningSignals.map((signal) => (
                  <li key={signal} dir="auto" className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55em] size-1 shrink-0 bg-paper-ink/50"
                    />
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {/* Framed as what would have raised our confidence, not as an apology
            for missing data. Same array either way — but "what we couldn't
            find" reads as failure, and this reads as rigour. Most valuable on
            amber, which is precisely the tier that has to justify hedging. */}
        {prediction.missingSignals.length > 0 ? (
          <>
            <PaperRule />
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] tracking-[0.14em] text-paper-muted uppercase">
                what would have convinced us
              </p>
              <ul className="space-y-1 text-sm leading-relaxed text-paper-muted">
                {prediction.missingSignals.map((signal) => (
                  <li key={signal} dir="auto" className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55em] size-1 shrink-0 bg-paper-ink/30"
                    />
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Paper>

      {flame ? (
        <Stamp className="absolute -bottom-4 end-[-12px]">
          {confirmed && observedMultiplier ? `BUSTED ${observedMultiplier}` : "BUSTED"}
        </Stamp>
      ) : null}
    </section>
  );
}
