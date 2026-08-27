/**
 * Normalizes a raw `DropshipPrediction.verdict` into the `ExpectedVerdict`
 * vocabulary that `truth.json` speaks.
 *
 * **This lives here, shared, on purpose.** It used to be a private helper in
 * `scripts/eval/run-fixtures.ts` while `scripts/eval/model-benchmark.ts`
 * compared raw verdicts directly. The two harnesses then disagreed: a
 * collection page of a legitimate brand scored 51/51 in one and reported a
 * high-confidence "regression" in the other. Any new harness must import this
 * rather than re-implement the mapping.
 *
 * `ExpectedVerdict` is deliberately narrower than `DropshipPrediction`:
 * `collection_page` is an internal routing verdict (it sends the query down
 * the browse path), not a claim about the store. A catalog page belongs to a
 * real shop, so it maps to `legit` — the dropship determination has to come
 * from an individual PDP.
 */
import type { ExpectedVerdict } from "@/tests/eval/fixture-types";

export function deriveVerdict(
  prediction: { isLikelyDropship: boolean; confidence: number; verdict?: string } | null,
  attributes: { title: string; description: string; mainImageUrl: string | null },
): ExpectedVerdict {
  if (!prediction) return "insufficient_evidence";

  if (prediction.verdict === "not_a_product") return "not_a_product";
  if (prediction.verdict === "collection_page") return "legit";

  const attrCount =
    Number(attributes.title.length > 0) +
    Number(attributes.description.length > 50) +
    Number(attributes.mainImageUrl !== null);

  if (attrCount < 2) return "not_a_product";
  if (prediction.confidence < 0.4) return "insufficient_evidence";
  return prediction.isLikelyDropship ? "dropship" : "legit";
}
