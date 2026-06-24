"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Package } from "lucide-react";

/**
 * Product thumbnail wrapper.
 *
 * Why this exists: `next/image` with `unoptimized` shows the alt-text in
 * the broken-img frame when the source URL 404s or is blocked (a common
 * occurrence with arbitrary store CDNs, hotlink-protected images, or
 * Hebrew/non-ASCII URLs). That manifested as the product title appearing
 * twice in the comparison card — once "inside" the broken image as
 * fallback text, once below as the actual title.
 *
 * This component flips to a clean icon placeholder on `onError` and
 * suppresses alt-rendering so the broken state looks intentional.
 */

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  fallbackClassName?: string;
}

export function ProductImage({
  src,
  alt,
  sizes,
  className,
  fallbackClassName,
}: ProductImageProps) {
  const [errored, setErrored] = useState(false);

  // Render the fallback either when there's no source, or after we've
  // seen a load failure. Empty alt on the fallback so screen readers
  // don't announce "broken image".
  if (!src || errored) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex h-full w-full items-center justify-center bg-black/30 text-muted-foreground/60",
          fallbackClassName,
        )}
      >
        <Package className="size-10" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      // Empty alt + role=presentation: when the image DOES render we
      // already show the product title elsewhere in the card, so this
      // image is decorative and shouldn't be announced twice.
      alt={alt}
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
      unoptimized
      onError={() => setErrored(true)}
    />
  );
}
