# Busted — Chrome extension (MV3)

Floating "Bust this product" pill on any product page that matches a
JSON-LD Product schema, an `og:type=product` meta, or a Shopify product
price meta tag.

## Status

**Scaffold (Sprint 11, Stage 30).** Manifest V3, vanilla JS content script,
no build step. Not in the Chrome Web Store yet — install unpacked for now.

## Install locally

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Pick the `extension/` directory in this repo
5. Visit any Shopify-style product page — a "Bust this product" pill appears
   bottom-right
6. Click the pill or the toolbar icon → opens Busted with the URL pre-filled

## How it detects product pages

Content script looks for one of:

- `<script type="application/ld+json">` with `@type` "Product" (covers Shopify,
  WooCommerce, BigCommerce, most modern carts)
- `<meta property="og:type" content="product">`
- `<meta property="product:price:amount">`

When any of those fire, we inject the pill once per pageload, with a
mutation-observer that re-checks on SPA navigation.

## Excluded hosts

The pill never shows on:

- aliexpress.com (would be silly)
- busted.app (would be silly)
- google.com, youtube.com (false positives — they have product schema for ads)

Add more in `manifest.json` → `content_scripts[0].exclude_matches`.

## Roadmap

- **v0.2:** Inline price overlay — show the comparison right on the page
- **v0.3:** Pre-cached supplier price in the pill ("Cheaper on AliExpress: $4")
- **v0.4:** Background scan + chrome.notifications for big-savings finds
- **v1.0:** Chrome Web Store publication (need a privacy policy + reviewer-
  ready listing)

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, permissions, content-script rules |
| `content.js` | Page detection + pill injection |
| `content.css` | Pill styles, locked to `z-index: 2147483647` |
| `popup.html/.css/.js` | Toolbar popup with "Bust this page" + "Open Busted" |
| `icons/` | 16/48/128 PNG icons (currently the app icon for all sizes) |
