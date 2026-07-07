/**
 * background.js — MV3 Service Worker for Busted
 * 
 * Responsibilities:
 * - Cache scan results per tab and per session URL
 * - Auto-scan tabs on page complete (feature-flagged)
 * - Set badge (flame/amber/silent) per tab
 * - Handle on-demand scan via popup message
 * - Fetch with 45s timeout; silence on error
 */

// Per-tab cache: Map<tabId, result>
const tabCache = new Map();

// Session URL cache: Map<url, result>, capped at 50 entries (LRU)
const sessionCache = new Map();
const SESSION_CACHE_CAP = 50;

// Per-tab debounce timers: Map<tabId, timeoutId>
const debounceTimers = new Map();
const DEBOUNCE_MS = 1500;

// API base, loaded from storage at startup
let apiBase = 'http://localhost:3000';

// Load apiBase from storage on startup
chrome.storage.sync.get(['apiBase'], (result) => {
  if (result.apiBase) {
    apiBase = result.apiBase;
  }
});

// Listen for apiBase changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBase) {
    apiBase = changes.apiBase.newValue || 'http://localhost:3000';
  }
});

/**
 * Fetch result from API, handling timeout and errors gracefully.
 * @param {string} url - Product URL to scan
 * @returns {Promise<object>} - Result object with presenceTier (defaults to "silent" on error)
 */
async function fetchScanResult(url) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 45000);

  try {
    const response = await fetch(`${apiBase}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Non-200 response or status "error" → treat as silent
    if (!response.ok || response.status !== 200) {
      return { presenceTier: 'silent', error: true };
    }

    const data = await response.json();

    // If API returns status "error" or missing status, treat as silent
    if (!data.status || data.status === 'error') {
      return { presenceTier: 'silent', error: true };
    }

    // Normalize: missing presenceTier defaults to "silent"
    if (!data.presenceTier) {
      data.presenceTier = 'silent';
    }

    return data;
  } catch (err) {
    // Any error (timeout, network, parse, etc.) → silent
    clearTimeout(timeoutId);
    return { presenceTier: 'silent', error: true };
  }
}

/**
 * Set badge for a tab based on presenceTier.
 * @param {number} tabId
 * @param {string} presenceTier - "flame" | "amber" | "silent"
 */
function setBadgeForTab(tabId, presenceTier) {
  let badgeText = '';
  let badgeColor = '';

  if (presenceTier === 'flame') {
    badgeText = '🔥';
    badgeColor = '#E4572E';
  } else if (presenceTier === 'amber') {
    badgeText = '!';
    badgeColor = '#D99A2B';
  }
  // "silent" → no badge

  chrome.action.setBadgeText({ text: badgeText, tabId });
  if (badgeColor) {
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  }
}

/**
 * Clear badge and caches for a tab (e.g., on navigation or tab close).
 * @param {number} tabId
 */
function clearTabState(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
  tabCache.delete(tabId);
  const timer = debounceTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(tabId);
  }
}

/**
 * Perform a scan: fetch result, cache it, set badge.
 * @param {number} tabId
 * @param {string} url
 * @returns {Promise<object>}
 */
async function scanTab(tabId, url) {
  // Check session cache first
  if (sessionCache.has(url)) {
    const cached = sessionCache.get(url);
    tabCache.set(tabId, cached);
    setBadgeForTab(tabId, cached.presenceTier);
    return cached;
  }

  // Fetch from API
  const result = await fetchScanResult(url);

  // Cache result
  tabCache.set(tabId, result);
  sessionCache.set(url, result);

  // Enforce LRU cap on session cache
  if (sessionCache.size > SESSION_CACHE_CAP) {
    const oldestKey = sessionCache.keys().next().value;
    sessionCache.delete(oldestKey);
  }

  // Set badge
  setBadgeForTab(tabId, result.presenceTier);

  // Accrue the savings ledger on confirmed busts (idempotent per scanId)
  recordBustInLedger(result);

  return result;
}

// Savings ledger — cumulative "markup dodged" across confirmed busts.
// Persisted in chrome.storage.local (survives browser restarts).
const LEDGER_KEY = 'savingsLedger';
const LEDGER_IDS_CAP = 200;

/**
 * Record a confirmed bust into the ledger. Only flame results with a real
 * positive price delta accrue, and each scan counts exactly once.
 * @param {object} result - full-scan API response
 */
function recordBustInLedger(result) {
  if (!result || result.presenceTier !== 'flame') return;

  const storeUsd = result.storeProduct ? result.storeProduct.priceUsd : null;
  let supplierUsd = null;
  if (result.aliexpressData && typeof result.aliexpressData.priceUsd === 'number') {
    supplierUsd = result.aliexpressData.priceUsd;
  } else if (
    result.dropshipPrediction &&
    typeof result.dropshipPrediction.estimatedSupplierPriceUsd === 'number'
  ) {
    supplierUsd = result.dropshipPrediction.estimatedSupplierPriceUsd;
  }
  if (typeof storeUsd !== 'number' || supplierUsd === null) return;

  const dodged = storeUsd - supplierUsd;
  if (dodged <= 0) return;

  const id = result.scanId || result.originalUrl;
  if (!id) return;

  chrome.storage.local.get([LEDGER_KEY], (data) => {
    const ledger = data[LEDGER_KEY] || {
      totalDodgedUsd: 0,
      bustCount: 0,
      countedIds: [],
    };
    if (ledger.countedIds.includes(id)) return;
    ledger.totalDodgedUsd += dodged;
    ledger.bustCount += 1;
    ledger.countedIds.push(id);
    if (ledger.countedIds.length > LEDGER_IDS_CAP) {
      ledger.countedIds = ledger.countedIds.slice(-LEDGER_IDS_CAP);
    }
    chrome.storage.local.set({ [LEDGER_KEY]: ledger });
  });
}

/**
 * Cache-only quick-lookup: single DB read on the backend, never triggers a
 * scrape or AI call. Free enough to run on every page load — this is the
 * "instant badge" path. Returns the parsed payload or null on any failure.
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function quickLookup(url) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 5000);
  try {
    const res = await fetch(
      `${apiBase}/api/extension/quick-lookup?url=${encodeURIComponent(url)}`,
      { signal: abortController.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Passive presence flow for a loaded tab: badge from the cached verdict if
 * the backend has one; otherwise fall through to a full scan ONLY when the
 * user opted into auto-scan. Quick-lookup results live in tabCache only —
 * sessionCache is reserved for full scan results so a manual "Scan this
 * page" always runs the real pipeline.
 * @param {number} tabId
 * @param {string} url
 */
async function passiveThenMaybeScan(tabId, url) {
  if (sessionCache.has(url)) {
    const cached = sessionCache.get(url);
    tabCache.set(tabId, cached);
    setBadgeForTab(tabId, cached.presenceTier);
    return;
  }

  const quick = await quickLookup(url);
  if (quick && quick.found === true) {
    const result = {
      presenceTier: quick.presenceTier || 'silent',
      quickLookup: true,
      permalink: quick.permalink,
      savingsPercent: quick.savingsPercent,
      storeTitle: quick.storeTitle,
    };
    tabCache.set(tabId, result);
    setBadgeForTab(tabId, result.presenceTier);
    return;
  }

  chrome.storage.sync.get(['autoScan'], (result) => {
    if (!result.autoScan) {
      return;
    }
    scanTab(tabId, url).catch(() => {
      // Already handled in fetchScanResult, no need to escalate
    });
  });
}

/**
 * Check if a URL should be auto-scanned.
 * Skip: localhost, obvious non-shopping hosts, non-http(s).
 * @param {string} url
 * @returns {boolean}
 */
function shouldAutoScan(url) {
  // Only http(s)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  try {
    const u = new URL(url);
    const domain = u.hostname.toLowerCase();

    // Skip non-shopping hosts
    const skipDomains = [
      'google.',
      'youtube.',
      'github.',
      'gmail',
      'mail.',
      'docs.',
      'localhost',
      '127.0.0.1',
    ];

    for (const skip of skipDomains) {
      if (domain.includes(skip) || domain === skip) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

// Listen for tab updates: if page loads completely and auto-scan is on, scan it
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Navigation to a new URL invalidates the previous result — clear the
  // badge immediately so a stale 🔥 never lingers on an unrelated page.
  if (changeInfo.url) {
    clearTabState(tabId);
  }

  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }

  // Skip obvious non-shopping hosts, localhost, and non-http(s)
  if (!shouldAutoScan(tab.url)) {
    return;
  }

  // Debounce per tab, then run the passive quick-lookup (always) followed
  // by a full scan only if auto-scan is enabled and there was no cache hit.
  const existingTimer = debounceTimers.get(tabId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const newTimer = setTimeout(() => {
    debounceTimers.delete(tabId);
    passiveThenMaybeScan(tabId, tab.url);
  }, DEBOUNCE_MS);

  debounceTimers.set(tabId, newTimer);
});

// Listen for tab removal: clear state
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabState(tabId);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle SCAN_ACTIVE_TAB: scan the tab the popup passed. sender.tab is
  // undefined for popup messages, so tabId/url must come from the request.
  if (request.type === 'SCAN_ACTIVE_TAB') {
    if (typeof request.tabId !== 'number' || !request.url) {
      sendResponse({ presenceTier: 'silent', error: true });
      return;
    }

    scanTab(request.tabId, request.url).then((result) => {
      sendResponse(result);
    }).catch(() => {
      sendResponse({ presenceTier: 'silent', error: true });
    });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Handle GET_RESULT: return cached result for a tab
  if (request.type === 'GET_RESULT') {
    const { tabId } = request;
    const result = tabCache.get(tabId);
    sendResponse(result || { presenceTier: 'silent' });
    return;
  }
});
