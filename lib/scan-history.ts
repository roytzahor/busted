/**
 * Anonymous scan history — localStorage-backed.
 *
 * Each completed scan is appended so the user can flip back to recent results
 * without re-pasting URLs. Capped at 25 to keep storage cost trivial; eviction
 * is FIFO (oldest dropped).
 *
 * No backend write — this is intentionally private to the device. When auth
 * lands in a future sprint we'll mirror this to ScannedProduct → SearchHistory.
 */

const STORAGE_KEY = "busted_scan_history_v1";
const MAX_ENTRIES = 25;

export interface ScanHistoryEntry {
  id: string;
  url: string;
  title: string;
  imageUrl: string | null;
  savingsPercent: number | null;
  completedAt: string; // ISO timestamp
}

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export function getHistory(): ScanHistoryEntry[] {
  const w = safeWindow();
  if (!w) return [];
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Mild shape check — anything malformed is dropped.
    return (parsed as ScanHistoryEntry[]).filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.url === "string" &&
        typeof e.completedAt === "string",
    );
  } catch {
    return [];
  }
}

export function appendScan(entry: Omit<ScanHistoryEntry, "id" | "completedAt">): void {
  const w = safeWindow();
  if (!w) return;
  const existing = getHistory();
  // De-dupe by URL — newest wins.
  const filtered = existing.filter((e) => e.url !== entry.url);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next: ScanHistoryEntry[] = [
    { ...entry, id, completedAt: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_ENTRIES);
  try {
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Same-tab listeners need a manual signal — storage event only fires for other tabs.
    w.dispatchEvent(new CustomEvent("busted:history-updated"));
  } catch {
    /* quota exceeded or storage unavailable */
  }
}

export function clearHistory(): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.localStorage.removeItem(STORAGE_KEY);
    w.dispatchEvent(new CustomEvent("busted:history-updated"));
  } catch {
    /* no-op */
  }
}
