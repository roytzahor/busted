"use client";

import { Paper, PaperLabel, PaperRule } from "@/components/ui/paper";
import { Stamp } from "@/components/ui/stamp";
import type { PresenceTier } from "@/lib/analyze/presence-tier";
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
  className?: string;
}

function markupMultiplier(prediction: DropshipPrediction): string | null {
  const pct = prediction.estimatedMarkupPercent;
  if (pct === null || !Number.isFinite(pct) || pct <= 0) return null;
  const x = 1 + pct / 100;
  // Below ~1.5× the number is not the story and a huge "×1.2" overstates it.
  if (x < 1.5) return null;
  return `×${x.toFixed(1)}`;
}

export function VerdictSheet({
  prediction,
  tier,
  storeName,
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
  const multiplier = markupMultiplier(prediction);

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
        {flame && multiplier ? (
          <p
            aria-hidden="true"
            className="font-mono text-6xl leading-none font-bold tracking-[-0.04em] sm:text-7xl"
          >
            {multiplier}
          </p>
        ) : null}

        <p className="text-lg font-semibold tracking-tight text-balance">
          {flame
            ? "They're marking this up."
            : "This might be a dropship — we're not sure."}
        </p>

        <p className="max-w-prose text-sm leading-relaxed text-paper-muted">
          {prediction.reasoning}
        </p>

        {prediction.reasoningSignals.length > 0 ? (
          <>
            <PaperRule />
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] tracking-[0.14em] text-paper-muted uppercase">
                what we found
              </p>
              <ul className="space-y-1 text-sm leading-relaxed">
                {prediction.reasoningSignals.map((signal) => (
                  <li key={signal} className="flex items-start gap-2">
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
                  <li key={signal} className="flex items-start gap-2">
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

      {flame && multiplier ? (
        <Stamp className="absolute -bottom-4 end-[-12px]">
          BUSTED {multiplier}
        </Stamp>
      ) : null}
    </section>
  );
}
