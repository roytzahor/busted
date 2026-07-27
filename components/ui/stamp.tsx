import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Stamp — the BUSTED mark. See DESIGN.md §4.2, §5.2.
 *
 * Ink only, no fill, like a real rubber stamp. That is not just styling: the
 * stamp is positioned to straddle the edge of a sheet, so it lands on paper
 * and on the dark room at once. A filled background would have to pick one
 * ground and would be wrong against the other.
 *
 * `--stamp` red is reserved for this component and nothing else. Errors and
 * destructive actions use `--destructive`. A colour used once is a signature;
 * used twice it is just part of the palette.
 *
 * Accessibility: `aria-hidden` — the stamp is decoration that duplicates
 * information already carried as real text (the verdict and the markup
 * figure). It must never be the only place a verdict appears, which is also
 * why the verdict is never distinguished by colour alone.
 *
 * Static here by design. The landing animation (scale 1.6→1, blur 4px→0)
 * belongs to the teardown sequence in phase 4, so this primitive can be
 * verified on its own first.
 */
function Stamp({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stamp"
      aria-hidden="true"
      className={cn(
        "inline-flex items-center rounded-[3px] border-[2.5px] border-stamp px-3 py-1.5 font-mono text-[15px] font-bold tracking-[0.08em] text-stamp",
        // Mirrored in RTL or it reads as falling over. The tear itself is
        // never mirrored — a tear has no reading direction.
        "-rotate-[4deg] rtl:rotate-[4deg]",
        className,
      )}
      {...props}
    />
  )
}

export { Stamp }
