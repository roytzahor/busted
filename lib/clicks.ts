/**
 * Affiliate-click beacon — Sprint 11 Stage 27.
 *
 * Mirrors the analytics beacon in lib/track.ts but writes to AffiliateClick
 * specifically. We split tables because they have different retention,
 * indexing, and (eventually) revenue-attribution joins.
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

function parseHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function trackAffiliateClick(args: {
  scanId?: string;
  targetUrl: string;
}): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    scanId: args.scanId,
    sessionId: getSessionId(),
    targetHost: parseHost(args.targetUrl),
    surface: "web",
  });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/clicks", blob);
      if (ok) return;
    }
    void fetch("/api/clicks", {
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
