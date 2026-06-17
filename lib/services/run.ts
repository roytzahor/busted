/**
 * Orchestrator utilities for running services with consistent timing,
 * event emission, and partial-failure handling.
 *
 * Usage:
 *   const result = await runService("scraper", "scrape", async (emit) => {
 *     emit("start", "Calling Firecrawl…");
 *     const data = await scrapeProductUrl(url);
 *     return ok(data);
 *   });
 */

import { err, ok, type Result, type ServiceEvent, type ServiceStatus } from "./types";

type EmitFn = (
  stage: string,
  message?: string,
  meta?: Record<string, unknown>,
) => void;

type ServiceFn<T> = (emit: EmitFn) => Promise<Result<T>>;

/**
 * Wrap a service call with start/end events and uncaught-error rescue.
 * The service function gets an `emit()` to push intermediate events.
 */
export async function runService<T>(
  serviceName: string,
  rootStage: string,
  fn: ServiceFn<T>,
): Promise<Result<T>> {
  const startedAt = performance.now();
  const events: ServiceEvent[] = [];

  const emit: EmitFn = (stage, message, meta) => {
    events.push({
      service: serviceName,
      stage,
      status: "ok",
      latencyMs: Math.round(performance.now() - startedAt),
      cacheStatus: "MISS",
      message,
      meta,
      at: new Date().toISOString(),
    });
  };

  try {
    const inner = await fn(emit);
    const totalMs = Math.round(performance.now() - startedAt);
    const finalStatus: ServiceStatus = inner.ok ? "ok" : "error";

    events.push({
      service: serviceName,
      stage: rootStage,
      status: finalStatus,
      latencyMs: totalMs,
      cacheStatus: "MISS",
      message: inner.ok ? "ok" : inner.error.message,
      at: new Date().toISOString(),
    });

    return { ...inner, events: [...inner.events, ...events] };
  } catch (rawErr) {
    const totalMs = Math.round(performance.now() - startedAt);
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    events.push({
      service: serviceName,
      stage: rootStage,
      status: "error",
      latencyMs: totalMs,
      cacheStatus: "MISS",
      message: `Uncaught: ${message}`,
      at: new Date().toISOString(),
    });
    return err(
      {
        code: "SERVICE_UNCAUGHT",
        message,
        recoverable: false,
        cause: rawErr,
      },
      events,
    );
  }
}

/**
 * Merge multiple service Results into a single events list. Used when the
 * orchestrator runs services in parallel and needs to combine their event
 * timelines before persisting to the scan record.
 */
export function mergeEvents(...results: Array<Result<unknown>>): ServiceEvent[] {
  const merged: ServiceEvent[] = [];
  for (const r of results) merged.push(...r.events);
  return merged;
}

/**
 * Run two services in parallel. Both must succeed for the wrapped Result
 * to be ok; if either fails the Result reports the first failure, but
 * events from both are preserved so monitoring shows the full picture.
 */
export async function runPair<A, B>(
  a: () => Promise<Result<A>>,
  b: () => Promise<Result<B>>,
): Promise<Result<[A, B]>> {
  const [ra, rb] = await Promise.all([a(), b()]);
  const events = [...ra.events, ...rb.events];
  if (!ra.ok) return err(ra.error, events);
  if (!rb.ok) return err(rb.error, events);
  return ok<[A, B]>([ra.value, rb.value], events);
}

/**
 * Like runPair but a failure in `b` is *recoverable* — the Result is still
 * ok with `[A, null]`. Used when the secondary service is best-effort
 * (e.g. candidate search can be skipped without breaking the verdict).
 */
export async function runPairRecoverable<A, B>(
  a: () => Promise<Result<A>>,
  b: () => Promise<Result<B>>,
): Promise<Result<[A, B | null]>> {
  const [ra, rb] = await Promise.all([a(), b()]);
  const events = [...ra.events, ...rb.events];
  if (!ra.ok) return err(ra.error, events);
  return ok<[A, B | null]>([ra.value, rb.ok ? rb.value : null], events);
}
