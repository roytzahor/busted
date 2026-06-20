/**
 * Content script — Sprint 12 Stage 36.
 *
 * Two-stage pill:
 *   1. Detect product page (JSON-LD Product schema / og:type=product / Shopify
 *      price meta).
 *   2. Quick-lookup the URL against busted.app. If we've previously scanned
 *      it, render a rich pill showing the supplier price + savings %.
 *      Otherwise render the v0.1 generic "Bust this product" pill.
 */

(function () {
  "use strict";

  // Single source of truth — keep in sync with extension/popup.js and the
  // README. If you fork the extension, change this only.
  const BUSTED_URL = "https://buy-pass-silk.vercel.app/";
  const QUICK_LOOKUP_URL =
    "https://buy-pass-silk.vercel.app/api/extension/quick-lookup";
  const PILL_ID = "busted-extension-pill";

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

  function buildBustedUrl(extra) {
    const u = new URL(BUSTED_URL);
    u.searchParams.set("url", window.location.href);
    u.searchParams.set("utm_source", "chrome_extension");
    if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }

  function buildPermalinkUrl(permalink) {
    const u = new URL(permalink, BUSTED_URL);
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

  function injectGenericPill() {
    if (document.getElementById(PILL_ID)) return;
    const pill = document.createElement("a");
    pill.id = PILL_ID;
    pill.className = "busted-pill--generic";
    pill.href = buildBustedUrl();
    pill.target = "_blank";
    pill.rel = "noopener noreferrer";
    pill.setAttribute("aria-label", "Bust this product on Busted");
    pill.innerHTML =
      '<span class="busted-icon" aria-hidden="true">🔥</span>' +
      '<span class="busted-label">Bust this product</span>';
    document.documentElement.appendChild(pill);
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

    // Optimistically show the generic pill while we check the cache. If we
    // get a hit, we'll swap it for the rich variant.
    injectGenericPill();

    try {
      const lookupUrl = new URL(QUICK_LOOKUP_URL);
      lookupUrl.searchParams.set("url", window.location.href);
      const res = await fetch(lookupUrl.toString(), {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (
        data &&
        data.found === true &&
        typeof data.savingsPercent === "number" &&
        data.savingsPercent > 0
      ) {
        document.getElementById(PILL_ID)?.remove();
        injectRichPill(data);
      }
    } catch {
      // network failed — keep the generic pill
    }
  }

  // Initial + retry passes for SPAs that render product schema lazily.
  void tryInject();
  setTimeout(tryInject, 1500);
  setTimeout(tryInject, 3500);

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(PILL_ID)?.remove();
      setTimeout(tryInject, 1000);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
