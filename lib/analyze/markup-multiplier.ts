/**
 * Format a store/supplier price ratio as the "×N" figure — shared by the
 * verdict sheet's headline figure + BUSTED stamp (components/verdict-sheet.tsx)
 * and the landing ledger's row figure (components/landing-ledger.tsx), so the
 * threshold and format can't drift between the two places it's shown.
 */
export function formatMultiplier(ratio: number): string | null {
  // Below ~1.5x the number is not the story and a huge "×1.2" overstates it.
  if (!Number.isFinite(ratio) || ratio < 1.5) return null;
  return `×${ratio.toFixed(1)}`;
}
