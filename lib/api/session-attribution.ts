/**
 * Session attribution policy for write paths whose effects outlive the request.
 *
 * The client mints an anonymous session UUID into sessionStorage (see
 * `getSessionId()` in lib/track.ts — the only writer; lib/feedback.ts,
 * lib/clicks.ts and lib/error-reporter.ts read it). When storage is unavailable
 * those readers fall back to a fixed placeholder string instead of an id.
 *
 * Those placeholders are shared constants, not identities: every private-mode
 * visitor sends the same one. Anything that records a durable, user-attributed
 * claim must therefore reject them rather than persisting a row nobody can be
 * traced back to.
 *
 * Scope note: this is an attribution check, NOT an authentication check. A
 * caller crafting raw requests can supply any string, so it must always be
 * paired with rate limiting, and it is not sufficient on its own to stop a
 * determined attacker.
 */

/** Placeholders the client readers emit when no real session id is available. */
export const UNATTRIBUTED_SESSION_IDS: ReadonlySet<string> = new Set([
  "no-session",
  "no-storage",
  "ssr",
]);

/**
 * True when `sessionId` identifies a specific browser session and can therefore
 * back a durable claim.
 */
export function isAttributedSession(sessionId: string | null | undefined): boolean {
  if (typeof sessionId !== "string") return false;
  const trimmed = sessionId.trim();
  if (trimmed.length === 0) return false;
  return !UNATTRIBUTED_SESSION_IDS.has(trimmed);
}
