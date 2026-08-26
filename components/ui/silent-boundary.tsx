import type { ReactNode } from "react";
import type { PresenceTier } from "@/lib/analyze/presence-tier";

interface SilentBoundaryProps {
  /** Server-computed tier. Never re-derive this from a confidence number. */
  tier: PresenceTier;
  /**
   * The decorated presentation — cards, figures, prices, colour. Mounted only
   * when the tier has earned it.
   */
  children: ReactNode;
  /**
   * What `silent` is allowed to render instead: one muted line, or nothing.
   * Anything passed here must stay in the silent register — no card, no
   * figure, no tier colour.
   */
  quiet?: ReactNode;
}

/**
 * Structural enforcement of the `silent` half of the presence contract.
 *
 * DESIGN.md §5.4 says the silent state gets no paper, no card, no figure and
 * no colour, and §14 says the answer to "make the silent state look more
 * designed" is no. Both were already written down — and the results view
 * still rendered a confidence percentage, a product card, a red price and a
 * fire-bordered verdict panel on every tier, because the gate was a prop that
 * four components simply never consulted.
 *
 * A prop is a request. This is a boundary: on `silent`, `children` are not
 * rendered at all, so a decorated subtree cannot reach the screen by being
 * forgotten. Adding a new card below a verdict is now safe by construction —
 * put it inside the boundary and the silent case stays silent.
 *
 * Deliberately not a runtime type-check on child element types: React cannot
 * see through a component that renders a <Card> internally, so an allowlist
 * would give false confidence. Not mounting the subtree is the real guarantee.
 */
export function SilentBoundary({ tier, children, quiet }: SilentBoundaryProps) {
  if (tier === "silent") {
    return quiet ? <>{quiet}</> : null;
  }

  return <>{children}</>;
}
