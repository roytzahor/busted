/**
 * Match-feedback beacon — Sprint 13 self-improving loop.
 *
 * Mirrors the lib/track.ts pattern: prefer sendBeacon, fall back to fetch
 * with keepalive. Never blocks the UI; never throws. The session ID matches
 * the one used by TelemetryEvent / AffiliateClick so we can correlate
 * across tables later.
 */

const SESSION_KEY = "busted_session_id_v1";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? "no-session";
  } catch {
    return "no-storage";
  }
}

export type FeedbackVerdict = "right" | "similar" | "wrong";

export interface FeedbackArgs {
  scanId: string;
  verdict: FeedbackVerdict;
  note?: string;
}

export function submitMatchFeedback(args: FeedbackArgs): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    scanId: args.scanId,
    verdict: args.verdict,
    note: args.note,
    sessionId: getSessionId(),
  });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/feedback", blob);
      if (ok) return;
    }
    void fetch("/api/feedback", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}
