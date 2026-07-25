import { describe, expect, it } from "vitest";
import {
  UNATTRIBUTED_SESSION_IDS,
  isAttributedSession,
} from "@/lib/api/session-attribution";

describe("isAttributedSession", () => {
  it("accepts a real session id", () => {
    expect(isAttributedSession("3f1c9a2e-7b44-4d10-9c8f-2a5e6b7c8d90")).toBe(true);
    expect(isAttributedSession("1753432800000-k3j9fq")).toBe(true);
  });

  // These are the fallbacks the client readers emit when sessionStorage is
  // unavailable. Every private-mode visitor sends the same string, so a Gold
  // Path row attributed to one of them is untraceable.
  it("rejects every placeholder the client can emit", () => {
    for (const placeholder of UNATTRIBUTED_SESSION_IDS) {
      expect(isAttributedSession(placeholder)).toBe(false);
    }
  });

  it("rejects missing, empty, and whitespace-only ids", () => {
    expect(isAttributedSession(null)).toBe(false);
    expect(isAttributedSession(undefined)).toBe(false);
    expect(isAttributedSession("")).toBe(false);
    expect(isAttributedSession("   ")).toBe(false);
  });

  it("rejects a placeholder padded with whitespace", () => {
    expect(isAttributedSession("  no-session  ")).toBe(false);
  });

  // Guards against the client's fallback strings drifting out of sync with the
  // server policy — lib/track.ts mints the id, lib/feedback.ts reads it.
  it("covers the placeholders lib/feedback.ts and lib/track.ts fall back to", () => {
    expect(UNATTRIBUTED_SESSION_IDS.has("no-session")).toBe(true);
    expect(UNATTRIBUTED_SESSION_IDS.has("no-storage")).toBe(true);
    expect(UNATTRIBUTED_SESSION_IDS.has("ssr")).toBe(true);
  });
});
