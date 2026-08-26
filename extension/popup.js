/**
 * popup.js — UI controller for Busted popup
 * 
 * States:
 * - idle: brand row + scan button + settings
 * - scanning: pulsing indicator
 * - flame: 🔥 full bust panel
 * - amber: ⚠️ cautious panel
 * - silent: ✓ nothing to report
 */

// Get the current tab
async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * Show a state section and hide others.
 * @param {string} stateName - "idle", "scanning", "flame", "amber", "silent"
 */
function showState(stateName) {
  document.querySelectorAll('.state').forEach((el) => {
    el.classList.add('hidden');
  });
  const stateEl = document.getElementById(`state-${stateName}`);
  if (stateEl) {
    stateEl.classList.remove('hidden');
  }
}

/**
 * Format a price (USD) to a two-decimal display.
 * @param {number|null} price
 * @returns {string}
 */
function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'N/A';
  }
  return `$${price.toFixed(2)}`;
}

/**
 * Render a flame (🔥) result.
 * @param {object} result - API response
 */
function renderFlame(result) {
  showState('flame');
  showLedger();

  const { dropshipPrediction, storeProduct, aliexpressUrl, supplierMatchQuality } = result;

  // Product title
  if (storeProduct?.title) {
    document.getElementById('flame-product-title').textContent = storeProduct.title;
  }

  // Store price (struck-through red)
  const storePrice = storeProduct?.priceUsd;
  document.getElementById('flame-store-price').textContent = formatPrice(storePrice);

  // Supplier price (green)
  const supplierPrice = dropshipPrediction?.estimatedSupplierPriceUsd;
  document.getElementById('flame-supplier-price').textContent = formatPrice(supplierPrice);

  // Markup %
  const markup = dropshipPrediction?.estimatedMarkupPercent;
  if (markup !== null && markup !== undefined) {
    document.getElementById('flame-markup').textContent = `${Math.round(markup)}%`;
  }

  // Confidence
  const confidence = dropshipPrediction?.confidence;
  if (confidence !== null && confidence !== undefined) {
    document.getElementById('flame-confidence').textContent = `${Math.round(confidence * 100)}% confident`;
  }

  // CTA: Show only if aliexpressUrl exists and supplierMatchQuality is high/medium
  const ctaButton = document.getElementById('flame-cta-button');
  if (aliexpressUrl && (supplierMatchQuality === 'high' || supplierMatchQuality === 'medium')) {
    ctaButton.classList.remove('hidden');
    ctaButton.onclick = () => {
      chrome.tabs.create({ url: aliexpressUrl });
    };
  } else {
    ctaButton.classList.add('hidden');
  }
}

/**
 * Render an amber (⚠️) result.
 * @param {object} result - API response
 */
function renderAmber(result) {
  showState('amber');

  const { dropshipPrediction } = result;

  // Confidence
  const confidence = dropshipPrediction?.confidence;
  if (confidence !== null && confidence !== undefined) {
    document.getElementById('amber-confidence').textContent = `${Math.round(confidence * 100)}% confidence`;
  }

  // One-line reasoning excerpt
  const reasoningSignals = dropshipPrediction?.reasoningSignals || [];
  const excerpt = reasoningSignals.length > 0 ? reasoningSignals[0] : 'Dropship signals detected.';
  document.getElementById('amber-reasoning').textContent = excerpt;
}

/**
 * Render a silent (✓) result.
 */
function renderSilent() {
  showState('silent');
}

/**
 * The check did not complete. Says so plainly and claims nothing about the
 * page. Deliberately quieter than silent — no icon, no colour.
 */
function renderUnavailable() {
  showState('unavailable');
}

/**
 * Render result based on presenceTier.
 * @param {object} result - API response
 */
function renderResult(result) {
  // A failed check is not an all-clear. background.js returns
  // { presenceTier: 'silent', error: true } on network failure, non-200 and
  // any exception — falling through to renderSilent() there would claim the
  // page is clean on zero information, which is the one thing a smoke alarm
  // must never do.
  if (!result || result.error || !result.presenceTier) {
    renderUnavailable();
    return;
  }

  const { presenceTier } = result;

  if (presenceTier === 'flame') {
    renderFlame(result);
  } else if (presenceTier === 'amber') {
    renderAmber(result);
  } else {
    renderSilent();
  }
}

/**
 * Load the current tab's URL and either get cached result or scan.
 */
async function initializePopup() {
  const tab = await getCurrentTab();
  if (!tab || !tab.url) {
    showState('idle');
    return;
  }

  // Try to get cached result. Quick-lookup results carry a tier but no
  // dropshipPrediction — the badge already shows the tier, so the popup
  // stays idle and offers a full scan instead of a half-empty bust panel.
  const message = { type: 'GET_RESULT', tabId: tab.id };
  chrome.runtime.sendMessage(message, (cachedResult) => {
    if (
      cachedResult &&
      cachedResult.presenceTier &&
      cachedResult.presenceTier !== 'silent' &&
      !cachedResult.quickLookup
    ) {
      // We have a cached full-scan result; render it
      renderResult(cachedResult);
    } else {
      // No cached result; show idle state for user to trigger scan
      showState('idle');
    }
  });
}

// ===== Event listeners =====

// Load auto-scan setting on popup open
chrome.storage.sync.get(['autoScan'], (result) => {
  const toggle = document.getElementById('auto-scan-toggle');
  if (toggle) {
    toggle.checked = result.autoScan || false;
  }
});

// Auto-scan toggle: save to storage
document.getElementById('auto-scan-toggle').addEventListener('change', (e) => {
  chrome.storage.sync.set({ autoScan: e.target.checked });
});

// Settings toggle: expand/collapse settings panel
document.getElementById('settings-toggle').addEventListener('click', () => {
  const expanded = document.getElementById('settings-expanded');
  expanded.classList.toggle('hidden');
});

// Load apiBase on popup open
chrome.storage.sync.get(['apiBase'], (result) => {
  const input = document.getElementById('api-base-input');
  if (input) {
    input.value = result.apiBase || 'http://localhost:3000';
  }
});

// Save apiBase
document.getElementById('save-api-button').addEventListener('click', () => {
  const input = document.getElementById('api-base-input');
  const value = input.value.trim() || 'http://localhost:3000';
  chrome.storage.sync.set({ apiBase: value }, () => {
    // Visual feedback: briefly highlight the button
    const button = document.getElementById('save-api-button');
    button.textContent = '✓ Saved';
    setTimeout(() => {
      button.textContent = 'Save';
    }, 1500);
  });
});

// Scan button: on click, show scanning state and request scan
document.getElementById('scan-button').addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab || !tab.url) {
    showState('idle');
    return;
  }

  showState('scanning');

  // Send message to background to scan. The popup must pass tabId + url
  // explicitly — sender.tab is only populated for content-script messages,
  // never for popup messages.
  chrome.runtime.sendMessage(
    { type: 'SCAN_ACTIVE_TAB', tabId: tab.id, url: tab.url },
    (result) => {
      // renderResult owns the error/missing-tier branch — a scan that never
      // came back is "unavailable", not "nothing to report".
      renderResult(result);
    }
  );
});

// Savings ledger — loss-aversion framing: "almost paid", not "saved"
// The text is prepared on open, but revealed only by renderFlame(). On a
// silent or unavailable page a savings figure would be the loudest thing on
// screen — money shouting over an all-clear is the inversion the tier system
// exists to prevent.
chrome.storage.local.get(['savingsLedger'], (data) => {
  const ledger = data.savingsLedger;
  if (!ledger || !ledger.bustCount) return;
  const el = document.getElementById('ledger-line');
  if (!el) return;
  const busts = ledger.bustCount === 1 ? 'bust' : 'busts';
  el.textContent = `You've dodged $${ledger.totalDodgedUsd.toFixed(2)} in markup across ${ledger.bustCount} ${busts}.`;
  el.dataset.ready = 'true';
  // chrome.storage.local.get is async, and on a cached flame result
  // renderFlame() can win this race — so the reveal has to be able to happen
  // from whichever side finishes last. Without this the ledger silently never
  // appears on exactly the fastest (and most common) path.
  if (ledgerRequested) el.classList.remove('hidden');
});

/** Set once renderFlame() has asked for the ledger. See the race note above. */
let ledgerRequested = false;

/** Reveal the cumulative ledger. Flame only. */
function showLedger() {
  ledgerRequested = true;
  const el = document.getElementById('ledger-line');
  if (el && el.dataset.ready === 'true') {
    el.classList.remove('hidden');
  }
}

// Initialize on popup open
initializePopup();
