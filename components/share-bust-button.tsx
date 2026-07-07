"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareBustButtonProps {
  title: string;
  savingsPercent: number | null;
}

/**
 * Share affordance for a scan permalink — the "Busted Card" entry point.
 * The OG image (/api/og/scan) is already wired into the page metadata, so
 * sharing the URL anywhere that unfurls links shows the full card.
 */
export function ShareBustButton({ title, savingsPercent }: ShareBustButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const text =
      savingsPercent !== null && savingsPercent > 0
        ? `${title} — busted with ${savingsPercent}% markup on Busted`
        : `${title} — scanned on Busted`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing sensible to do
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleShare}
      className="gap-1.5 border-white/10 bg-white/[0.04] backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.07]"
    >
      {copied ? (
        <>
          <Check className="size-4 text-success" aria-hidden="true" />
          Link copied
        </>
      ) : (
        <>
          <Share2 className="size-4" aria-hidden="true" />
          Share
        </>
      )}
    </Button>
  );
}
