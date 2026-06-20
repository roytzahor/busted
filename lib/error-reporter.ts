/**
 * Client-side error reporter — Sprint 11 Stage 29.
 *
 * Fires `window.error` and `unhandledrejection` events to `/api/errors`. Has
 * a tiny in-memory rate-limit so a runaway exception loop can't flood the
 * server. Never throws; failures are silent.
 *
 * Public surface:
 *   - `reportClientError(payload)` — called by route + global error boundaries
 *   - `installGlobalErrorReporting()` — wires window listeners (call once)
 */

const SESSION_KEY = "busted_session_id_v1";
const MAX_PER_SESSION = 25;
const STACK_TRACE_CAP = 4 * 1024;

let installCount = 0;
const inflightSession = new Set<string>();
let counter = 0;

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? "no-session";
  } catch {
    return "no-storage";
  }
}

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

function dedupeKey(message: string, stack?: string): string {
  const firstFrame = stack?.split("\n", 2)[1]?.trim() ?? "";
  return `${message}::${firstFrame}`;
}

export interface ReportPayload {
  message: string;
  stack?: string;
  source?: string;
  digest?: string;
}

export function reportClientError(payload: ReportPayload): void {
  if (typeof window === "undefined") return;
  if (counter >= MAX_PER_SESSION) return;

  const key = dedupeKey(payload.message, payload.stack);
  if (inflightSession.has(key)) return;
  inflightSession.add(key);
  counter += 1;

  const body = JSON.stringify({
    message: payload.message.slice(0, 500),
    stack: truncate(payload.stack, STACK_TRACE_CAP),
    url: typeof location !== "undefined" ? location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    sessionId: getSessionId(),
    source: payload.source,
    digest: payload.digest,
  });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/errors", blob)) return;
    }
    void fetch("/api/errors", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}

export function installGlobalErrorReporting(): void {
  if (typeof window === "undefined") return;
  if (installCount > 0) return;
  installCount += 1;

  window.addEventListener("error", (e) => {
    reportClientError({
      message: e.message,
      stack: e.error?.stack,
      source: "window_error",
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    reportClientError({
      message:
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : "Unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
      source: "unhandled_rejection",
    });
  });
}
