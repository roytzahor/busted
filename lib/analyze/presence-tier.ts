/**
 * Presence tier — the extension badge contract (see ROADMAP.md).
 *
 * Computed server-side so the UI can never be more confident than the
 * engine: the extension renders exactly what this returns. "Silent" is the
 * default and covers every non-dropship verdict, missing predictions, and
 * errors — we never alarm on uncertainty or failure.
 */

import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";

export type PresenceTier = "flame" | "amber" | "silent";

export const FLAME_MIN_CONFIDENCE = 0.7;
export const AMBER_MIN_CONFIDENCE = 0.5;

export function computePresenceTier(
  prediction: DropshipPrediction | null | undefined,
): PresenceTier {
  if (!prediction || prediction.verdict !== "dropship") return "silent";
  if (prediction.confidence >= FLAME_MIN_CONFIDENCE) return "flame";
  if (prediction.confidence >= AMBER_MIN_CONFIDENCE) return "amber";
  return "silent";
}
