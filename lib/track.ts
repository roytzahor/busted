/**
 * Tiny first-party analytics client — Sprint 11 Stage 26.
 *
 * Sends events to `/api/track` via `navigator.sendBeacon` when available so
 * navigation away from the page doesn't drop them. Falls back to `fetch` with
 * `keepalive: true`. Never throws; never blocks the caller.
 *
 * Session ID lives in sessionStorage so it rotates per tab/window close.
 * No PII, no IP — the server doesn't log either.
 */

export type TrackEventName =
  | "page_view"
  | "scan_start"
  | "scan_complete"
  | "scan_partial"
  | "scan_error"
  | "example_click"
  | "history_click"
  | "share_click"
  | "faq_open"
  | "paste_click"
  | "permalink_view";

interface TrackArgs {
  /** Optional persisted ScannedProduct.id. */
  scanId?: string;
  /** Free-form payload (≤ 4 KB JSON). No PII. */
  props?: Record<string, unknown>;
}

const SESSION_KEY = "busted_session_id_v1";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "no-storage";
  }
}

export function track(name: TrackEventName, args: TrackArgs = {}): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    name,
    sessionId: getSessionId(),
    scanId: args.scanId,
    surface: "web",
    props: args.props,
  });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/track", blob);
      if (ok) return;
    }
    // Fallback for browsers without sendBeacon (or where it returned false).
    void fetch("/api/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {
      /* swallow — analytics must never break the app */
    });
  } catch {
    /* swallow */
  }
}
