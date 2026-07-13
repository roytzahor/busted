"use client";

/**
 * Match feedback widget — Sprint 13 self-improving loop.
 *
 * Three-button strip that lets a user tell us whether the AliExpress match
 * was right, similar, or wrong. The choice is sent fire-and-forget via
 * `submitMatchFeedback()` which routes to /api/feedback. Once a verdict is
 * submitted we lock the widget into a "thanks" state — but allow undo within
 * the same render so a misclick doesn't poison the learner.
 *
 * Designed to feel light. No modals, no required fields. Note is optional
 * and only appears after a "wrong" tap because that's the case where we
 * benefit most from a free-form correction.
 */

import { Button } from "@/components/ui/button";
import { submitMatchFeedback, type FeedbackVerdict } from "@/lib/feedback";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ThumbsDown,
  ThumbsUp,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";

interface MatchFeedbackProps {
  scanId: string;
  /** Tighter "right/wrong" copy for confident matches; softer for bestEffort. */
  variant?: "confident" | "best-effort";
  className?: string;
}

interface VerdictMeta {
  verdict: FeedbackVerdict;
  label: string;
  Icon: typeof ThumbsUp;
  accent: string;
}

const VERDICTS: VerdictMeta[] = [
  {
    verdict: "right",
    label: "Same product",
    Icon: ThumbsUp,
    accent: "border-success/40 text-success hover:bg-success/10 aria-pressed:bg-success/15",
  },
  {
    verdict: "similar",
    label: "Close enough",
    Icon: Sparkles,
    accent: "border-accent/40 text-accent-foreground hover:bg-accent/10 aria-pressed:bg-accent/15",
  },
  {
    verdict: "wrong",
    label: "Wrong product",
    Icon: ThumbsDown,
    accent: "border-destructive/40 text-destructive hover:bg-destructive/10 aria-pressed:bg-destructive/15",
  },
];

const BEST_EFFORT_LABELS: Record<FeedbackVerdict, string> = {
  right: "Exact match",
  similar: "Useful alternative",
  wrong: "Not what I wanted",
};

export function MatchFeedback({
  scanId,
  variant = "confident",
  className,
}: MatchFeedbackProps) {
  const [submitted, setSubmitted] = useState<FeedbackVerdict | null>(null);
  const [note, setNote] = useState("");
  const [noteSubmitted, setNoteSubmitted] = useState(false);

  const handleSelect = (verdict: FeedbackVerdict) => {
    setSubmitted(verdict);
    submitMatchFeedback({ scanId, verdict });
    track("scan_complete", { scanId, props: { feedback: verdict } });
  };

  const handleUndo = () => {
    setSubmitted(null);
    setNote("");
    setNoteSubmitted(false);
  };

  const handleNoteSubmit = () => {
    if (!submitted) return;
    const trimmed = note.trim();
    if (trimmed.length === 0) return;
    submitMatchFeedback({ scanId, verdict: submitted, note: trimmed });
    setNoteSubmitted(true);
  };

  if (submitted) {
    return (
      <section
        aria-label="Feedback received"
        className={cn(
          "rounded-2xl border border-success/20 bg-success/5 p-4 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-success/30 bg-success/15"
          >
            <CheckCircle2 className="size-4 text-success" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">
              {submitted === "right"
                ? "Saved — we'll remember this match."
                : submitted === "wrong"
                  ? "Got it — we won't show that match again."
                  : "Thanks — that helps us tune the matcher."}
            </p>
            <p className="text-sm text-muted-foreground">
              {submitted === "right"
                ? "The next scan of this product is instant — no AI, no waiting."
                : submitted === "wrong"
                  ? "We've cleared that mapping and will search again on the next scan."
                  : "Your feedback feeds the prior we use to pick keywords + thresholds for the next scan in this category."}
            </p>
            {submitted === "wrong" && !noteSubmitted ? (
              <div className="mt-3 space-y-2">
                <label htmlFor={`note-${scanId}`} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                  What did you actually want? (optional)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id={`note-${scanId}`}
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 280))}
                    placeholder="e.g. I wanted the same brand, not a generic version"
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm transition-[border-color,background-color] focus:border-primary/40 focus:bg-white/[0.05] focus:outline-none"
                    maxLength={280}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleNoteSubmit}
                    disabled={note.trim().length === 0}
                    className="h-10 px-4"
                  >
                    Send note
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Stored anonymously, used only to improve matching.
                </p>
              </div>
            ) : null}
            {noteSubmitted ? (
              <p className="mt-2 text-xs text-success">Note saved — thanks!</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Was this the right match?"
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {variant === "best-effort"
              ? "Was this a useful alternative?"
              : "Did we match the right product?"}
          </p>
          <p className="text-xs text-muted-foreground">
            Your tap teaches the matcher per-category — the next scan benefits.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          {VERDICTS.map(({ verdict, label, Icon, accent }) => (
            <button
              key={verdict}
              type="button"
              onClick={() => handleSelect(verdict)}
              aria-label={`Mark match ${verdict}`}
              className={cn(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium",
                "transition-[color,background-color,border-color,box-shadow,opacity,scale] active:scale-[0.96]",
                accent,
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {variant === "best-effort" ? BEST_EFFORT_LABELS[verdict] : label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Compact inline trigger that can sit at the end of the result card, before
 * the affiliate CTA. Tap reveals the full widget.
 */
export function MatchFeedbackInline({
  scanId,
  variant,
  className,
}: MatchFeedbackProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground",
          "transition-[color,background-color,border-color,scale] hover:border-primary/30 hover:text-foreground active:scale-[0.96]",
          className,
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        Help tune the matcher
      </button>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <MatchFeedback scanId={scanId} variant={variant} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close feedback"
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
