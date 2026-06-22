"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";

/**
 * Share a scan result.
 *
 * Builds a URL that re-opens the same scan via `?url=` (the homepage auto-runs
 * it from cache). When Web Share API is available we let the OS share sheet
 * pick the target; otherwise we copy to clipboard and show a check mark.
 *
 * The URL also carries the params needed for the dynamic OG card so any link
 * preview unfurl shows the savings hero image.
 */

interface ShareButtonProps {
  /** Persisted ScannedProduct.id — when present, we share the /scan/<id>
   *  permalink (proper OG unfurl). Otherwise we fall back to ?url=. */
  scanId?: string;
  /** The original product URL that was scanned. */
  productUrl: string;
  /** Display title — short, used in the share text and OG card. */
  title: string;
  /** Savings percent — drives the big number on the OG card. */
  savingsPercent: number | null;
  /** Store retail price in USD (optional, sharpens the OG card). */
  storeUsd?: number;
  /** AliExpress price in USD (optional). */
  aliUsd?: number;
  /** Product image URL (optional). */
  imageUrl?: string | null;
  className?: string;
}

function buildShareUrl(props: ShareButtonProps): string {
  if (typeof window === "undefined") return "";
  if (props.scanId) {
    return `${window.location.origin}/scan/${props.scanId}`;
  }
  return `${window.location.origin}/?url=${encodeURIComponent(props.productUrl)}`;
}

function buildOgPreviewUrl(props: ShareButtonProps): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams();
  params.set("title", props.title.slice(0, 80));
  if (props.savingsPercent !== null) {
    params.set("savings", String(props.savingsPercent));
  }
  if (props.storeUsd) params.set("storeUsd", String(props.storeUsd));
  if (props.aliUsd) params.set("aliUsd", String(props.aliUsd));
  if (props.imageUrl) params.set("image", props.imageUrl);
  return `${window.location.origin}/api/og/scan?${params.toString()}`;
}

export function ShareButton(props: ShareButtonProps) {
  const { title, savingsPercent, className } = props;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = buildShareUrl(props);
    const text =
      savingsPercent !== null
        ? `I just saved ${savingsPercent}% on "${title}" with Busted.`
        : `Check this out — busted by Busted.`;

    // Web Share API (mobile + Safari + Edge desktop)
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Busted", text, url });
        track("share_click", { scanId: props.scanId, props: { target: "native" } });
        return;
      } catch {
        // user dismissed — fall through to copy
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      track("share_click", { scanId: props.scanId, props: { target: "clipboard" } });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleShare}
      aria-label="Share this result"
      data-og-preview={buildOgPreviewUrl(props)}
      className={cn(
        "h-9 gap-1.5 border-white/12 bg-white/[0.04] backdrop-blur-sm transition-[border-color,background-color,box-shadow,opacity,scale] hover:border-primary/30 hover:bg-primary/8",
        className,
      )}
    >
      <span className="relative inline-flex size-3.5 shrink-0">
        <Check
          className={cn(
            "absolute inset-0 size-3.5 text-success transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            copied ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-[0.25] blur-[4px]",
          )}
          aria-hidden="true"
        />
        <Share2
          className={cn(
            "absolute inset-0 size-3.5 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            copied ? "opacity-0 scale-[0.25] blur-[4px]" : "opacity-100 scale-100 blur-0",
          )}
          aria-hidden="true"
        />
      </span>
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
