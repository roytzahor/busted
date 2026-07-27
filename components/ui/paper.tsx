import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Paper — the evidence surface. See DESIGN.md §4.1.
 *
 * The site's hierarchy is "is it on paper?": anything stating a fact we stand
 * behind (price teardown, evidence list, supplier card, scan receipt) sits on
 * paper; everything else stays in the dark room. That is what lets the
 * `silent` presence tier render as bare text with no paper and read as
 * deliberate restraint rather than an unstyled state.
 *
 * Opaque on purpose — never glass. The hard edge and real drop shadow are the
 * whole point: it should look like something you could pick up.
 *
 * Paper sets its own foreground, so contents must not assume `--foreground`.
 * Use `text-paper-muted` for secondary text, not `text-muted-foreground`.
 */
const PAPER_SHADOW =
  "shadow-[0_1px_1px_oklch(0_0_0/0.28),0_8px_18px_-6px_oklch(0_0_0/0.42),0_24px_48px_-18px_oklch(0_0_0/0.5)]"

function Paper({
  className,
  torn = false,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * Rip the bottom edge off. Reserve it for sheets that carry the teardown —
   * a page where everything is torn is just a texture, and the effect costs a
   * `filter: drop-shadow` (see `.paper-torn`). Overrides the box shadow.
   */
  torn?: boolean
}) {
  return (
    <div
      data-slot="paper"
      data-torn={torn || undefined}
      className={cn(
        // 2px, not a card radius: rounded reads as "app", square reads as
        // "document". Nested elements stay effectively square — concentric
        // radius (outer = inner + padding) bottoms out here.
        "paper-fibre flex flex-col gap-3 rounded-[2px] bg-paper p-5 text-paper-ink",
        torn ? "paper-torn" : PAPER_SHADOW,
        className,
      )}
      {...props}
    />
  )
}

/**
 * The small uppercase mono line at the top of a sheet — a form field label,
 * not a heading. Lays out as `<what this is>` … `<provenance>`, e.g.
 * "Retail listing" / "scraped".
 */
function PaperLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="paper-label"
      className={cn(
        "flex items-baseline justify-between gap-3 font-mono text-[10px] tracking-[0.14em] text-paper-muted uppercase",
        className,
      )}
      {...props}
    />
  )
}

/** Hairline divider inside a sheet. Never a full border — paper is ruled. */
function PaperRule({ className, ...props }: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="paper-rule"
      className={cn("border-0 border-t border-paper-rule", className)}
      {...props}
    />
  )
}

/**
 * Evidence figure — a price, ratio or count.
 *
 * Mono and tabular by inheritance from `body`, and wrapped in `<bdi>`: in an
 * RTL page an unisolated "₪238.00" renders with the symbol on the wrong side.
 * The inbound twin of this bug is why lib/scraping/extract-price.ts has to
 * tolerate U+200E/U+200F around scraped prices — we must not reproduce it on
 * the way out. See DESIGN.md §6.
 */
function PaperFigure({ className, ...props }: React.ComponentProps<"bdi">) {
  return (
    <bdi
      data-slot="paper-figure"
      className={cn(
        "font-mono text-3xl font-semibold tracking-[-0.02em]",
        className,
      )}
      {...props}
    />
  )
}

export { Paper, PaperLabel, PaperRule, PaperFigure }
