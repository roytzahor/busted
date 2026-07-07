/**
 * Content script — in-page presence pill.
 *
 * Two-stage flow:
 *   1. Detect product page (JSON-LD Product schema / og:type=product / Shopify
 *      price meta).
 *   2. Quick-lookup the URL against the backend (cache-only, free). A pill is
 *      rendered ONLY on a confident cached flame verdict with real savings —
 *      silence is the default ("smoke alarm, not weather forecast"). The v0.2
 *      generic "Bust this product" pill on every product page was removed for
 *      violating that rule; manual scans live in the toolbar popup.
 */

(function () {
  "use strict";

  // Default backend — overridden by the apiBase setting shared with the
  // popup/background (chrome.storage.sync).
  const DEFAULT_API_BASE = "https://buy-pass-silk.vercel.app";
  const PILL_ID = "busted-extension-pill";

  let apiBase = DEFAULT_API_BASE;

  function loadApiBase() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(["apiBase"], (result) => {
          if (result && result.apiBase) apiBase = result.apiBase;
          resolve();
        });
      } catch {
        resolve(); // storage unavailable — keep the default
      }
    });
  }

  function looksLikeProductPage() {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || "");
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of list) {
          if (!node) continue;
          if (node["@type"] === "Product") return true;
          if (
            Array.isArray(node["@graph"]) &&
            node["@graph"].some((g) => g && g["@type"] === "Product")
          ) {
            return true;
          }
        }
      } catch {
        /* ignore */
      }
    }

    const ogType = document
      .querySelector('meta[property="og:type"]')
      ?.getAttribute("content");
    if (ogType === "product") return true;

    if (document.querySelector('meta[property="product:price:amount"]')) {
      return true;
    }

    return false;
  }

  function buildPermalinkUrl(permalink) {
    const u = new URL(permalink, apiBase);
    u.searchParams.set("utm_source", "chrome_extension");
    return u.toString();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  function injectRichPill(lookup) {
    if (document.getElementById(PILL_ID)) return;
    const pill = document.createElement("a");
    pill.id = PILL_ID;
    pill.className = "busted-pill--rich";
    pill.href = buildPermalinkUrl(lookup.permalink);
    pill.target = "_blank";
    pill.rel = "noopener noreferrer";
    pill.setAttribute(
      "aria-label",
      `AliExpress price ${lookup.aliPriceUsd} dollars, save ${lookup.savingsPercent}%`,
    );
    pill.innerHTML =
      '<span class="busted-icon" aria-hidden="true">🔥</span>' +
      '<div class="busted-rich-text">' +
      `  <div class="busted-rich-savings">Save ${lookup.savingsPercent}%</div>` +
      `  <div class="busted-rich-price">$${escapeHtml(lookup.aliPriceUsd)} on AliExpress</div>` +
      "</div>";
    document.documentElement.appendChild(pill);
  }

  async function tryInject() {
    if (!looksLikeProductPage()) return;
    if (document.getElementById(PILL_ID)) return;

    try {
      const lookupUrl = new URL("/api/extension/quick-lookup", apiBase);
      lookupUrl.searchParams.set("url", window.location.href);
      const res = await fetch(lookupUrl.toString(), {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      if (!res.ok) return;
      const data = await res.json();
      // Flame + real savings only. Legacy backends without presenceTier
      // required an AliExpress match to return found=true, so savings>0
      // alone is an acceptable stand-in there.
      const tierOk =
        data && (data.presenceTier === "flame" || data.presenceTier === undefined);
      if (
        data &&
        data.found === true &&
        tierOk &&
        typeof data.savingsPercent === "number" &&
        data.savingsPercent > 0
      ) {
        injectRichPill(data);
      }
    } catch {
      // network failed — stay silent
    }
  }

  // Initial + retry passes for SPAs that render product schema lazily.
  void loadApiBase().then(() => {
    void tryInject();
    setTimeout(tryInject, 1500);
    setTimeout(tryInject, 3500);
  });

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(PILL_ID)?.remove();
      setTimeout(tryInject, 1000);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
