/**
 * Content script — injected into every non-excluded page.
 *
 * Heuristics for "this is a product page":
 *   1. There's an application/ld+json block with @type === "Product"
 *   2. Or there's a Shopify <meta property="product:price:amount">
 *   3. Or there's an og:type of "product"
 *
 * When any of those fire, we inject a floating "Bust this" pill in the
 * bottom-right corner. Clicking it opens https://busted.app/?url=<location>
 * with utm_source so we can attribute traffic.
 */

(function () {
  "use strict";

  const BUSTED_URL = "https://buy-pass-silk.vercel.app/";
  const PILL_ID = "busted-extension-pill";

  function looksLikeProductPage() {
    // 1. JSON-LD Product schema
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
            node["@graph"].some((g) => g["@type"] === "Product")
          ) {
            return true;
          }
        }
      } catch {
        /* ignore malformed JSON-LD */
      }
    }

    // 2. og:type product
    const ogType = document
      .querySelector('meta[property="og:type"]')
      ?.getAttribute("content");
    if (ogType === "product") return true;

    // 3. Shopify-style product price meta
    if (document.querySelector('meta[property="product:price:amount"]')) {
      return true;
    }

    return false;
  }

  function buildBustedUrl() {
    const u = new URL(BUSTED_URL);
    u.searchParams.set("url", window.location.href);
    u.searchParams.set("utm_source", "chrome_extension");
    return u.toString();
  }

  function injectPill() {
    if (document.getElementById(PILL_ID)) return;

    const pill = document.createElement("a");
    pill.id = PILL_ID;
    pill.href = buildBustedUrl();
    pill.target = "_blank";
    pill.rel = "noopener noreferrer";
    pill.setAttribute("aria-label", "Bust this product on Busted");
    pill.innerHTML =
      '<span class="busted-icon" aria-hidden="true">🔥</span>' +
      '<span class="busted-label">Bust this product</span>';

    document.documentElement.appendChild(pill);
  }

  // Some sites render product schema after first paint (SPA navigation).
  function tryInject() {
    if (looksLikeProductPage()) injectPill();
  }

  tryInject();
  setTimeout(tryInject, 1500);
  setTimeout(tryInject, 3500);

  // Watch for SPA navigation (URL changes without a full page load).
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(PILL_ID)?.remove();
      setTimeout(tryInject, 1000);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
