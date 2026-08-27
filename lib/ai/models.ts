/**
 * Central model registry — the single source of truth for every LLM model id.
 *
 * No module may hardcode a model id of its own. Add a new accessor here and an
 * env var below instead, so a model can be rolled forward from `.env` without
 * a code change.
 *
 * **Every accessor reads `process.env` at CALL time, never at import time.**
 * `scripts/eval/model-benchmark.ts` mutates `process.env.GOOGLE_AI_MODEL` after
 * module imports have already run, so a module-level `const` would capture a
 * stale value and silently benchmark the wrong model. Do not "optimize" these
 * functions into constants.
 *
 * The literals below are last-resort floors, used only when the env var is
 * unset. Keep them on ids verified live against the API — a retired id here
 * 404s the whole chain, which is exactly what `gemini-2.0-flash` did. Prefer a
 * stable long-lived id as the floor and put the newest model in `.env`.
 */

/** Primary reasoning model. Verdicts, image matching, product identity. */
export function flashModel(): string {
  return process.env.GOOGLE_AI_MODEL ?? "gemini-2.5-flash";
}

/**
 * Cheap, fast model for mechanical transforms where reasoning quality is not
 * load-bearing (translation, normalization). ~6x cheaper on output tokens.
 * Never use this for a verdict, a match decision, or anything whose output
 * gates the pipeline — see `docs` in CLAUDE.md on the sameFunction guard.
 */
export function liteModel(): string {
  return process.env.GOOGLE_AI_MODEL_LITE ?? "gemini-2.5-flash-lite";
}

/** Multimodal vision reads (image → structured description). */
export function visionModel(): string {
  return process.env.GOOGLE_AI_VISION_MODEL ?? flashModel();
}

/**
 * Image *generation* model (the nano-banana family). Distinct from the vision
 * (image-reading) model — see `visionModel()`.
 *
 * The lite model is the floor on measured value-per-cost, but ONLY because
 * `preprocess-image.ts` now asks for `responseModalities: ["IMAGE"]`. Measured
 * 2026-08-26, 15 attempts per cell on a real fixture:
 *
 *   dual-task TEXT+IMAGE   lite 8/15 images returned · full 15/15
 *   IMAGE-only (current)   lite 15/15               · full 15/15
 *
 * So lite is the model the old dual-task prompt punished hardest. If anyone
 * ever re-merges generation and analysis into one call, this floor becomes a
 * 53%-reliable model and must move back to gemini-3.1-flash-image.
 *
 * At IMAGE-only, lite costs $0.0336/image vs $0.067 and runs ~2.8x faster
 * (p50 3.0s vs 8.5s), with cleanup quality indistinguishable to the pipeline's
 * own reviewer across 3 fixtures x 3 runs (lite 7/7/7 everywhere; full scored
 * one 5). Prices verified live against ai.google.dev/gemini-api/docs/pricing —
 * the earlier in-repo figures were stale by 1.5-2.5x.
 *
 * gemini-2.5-flash-image additionally rejects `imageConfig.imageSize: "512"`
 * with a 400, which the 3.x family accepts.
 *
 * No image model has a `-latest` alias — this family must be pinned.
 */
export function imageModel(): string {
  return process.env.GOOGLE_AI_IMAGE_MODEL ?? "gemini-3.1-flash-lite-image";
}

/**
 * Embedding model for the pgvector index.
 *
 * Changing this ORPHANS every stored embedding: `lib/index/embeddings.ts`
 * filters rows by `WHERE "model" = <this>`, so old vectors stop matching and
 * the index silently returns nothing until re-ingested with
 * `npm run index:ingest`.
 */
export function embeddingModel(): string {
  return process.env.GOOGLE_AI_EMBEDDING_MODEL ?? "gemini-embedding-001";
}

/**
 * Ordered fallback chain for the Google provider.
 *
 * ORDER IS LOAD-BEARING: exhaust the full models before the lite one. With
 * GOOGLE_AI_MODEL="gemini-flash-latest" the primary is deduped against the head
 * of this list, so listing lite second collapsed the full-model slot and a
 * SINGLE 429/404/503 or MAX_TOKENS truncation served a production verdict from
 * a lite model — which `liteModel()` above explicitly forbids ("never use this
 * for a verdict, a match decision, or anything whose output gates the
 * pipeline"). Lite stays last as an availability floor, not a second choice.
 *
 * Override with a comma-separated `GOOGLE_AI_MODEL_FALLBACK_CHAIN`. The
 * configured primary is prepended and de-duplicated, so this need only list
 * the fallbacks.
 */
export function googleModelFallbackChain(): string[] {
  const raw = process.env.GOOGLE_AI_MODEL_FALLBACK_CHAIN;
  const configured = raw
    ? raw.split(",").map((m) => m.trim()).filter(Boolean)
    : ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];
  return Array.from(new Set([flashModel(), ...configured]));
}

/** Non-Google providers. Unused while AI_PROVIDER=google, kept configurable. */
export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
}

export function openaiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}
