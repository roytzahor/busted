# Busted Chrome Extension

**Smoke alarm, not weather forecast.** Real-time dropship markup detection for e-commerce.

## What it does

The Busted extension analyzes product pages and alerts you when it detects dropship products with extreme markups. It talks to a Next.js backend API to:

1. Scrape the page and extract product attributes
2. Run AI-powered dropship likelihood scoring
3. Search AliExpress for the same product from the supplier
4. Compute the markup % (store price vs. supplier cost)
5. Verify the match via image AI (optional)

## Installation

### Load Unpacked (Development)

1. In Chrome, go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension/` directory from this repository
5. The extension appears in your toolbar

### Setup the API

The extension defaults to `http://localhost:3000`. To start the backend:

```bash
cd /Users/tzahore/github/busted
npm run dev
```

The backend must be running for scans to work. You can change the API base URL in the extension popup's settings.

## How to use

1. **Click the Busted icon** in your toolbar to open the popup
2. **Click "Scan this page"** to analyze the current product page
3. The extension will show one of three states:

   - **🔥 Busted** (flame badge): Extreme markup detected. Shows store price (struck-through), supplier price, markup %, and a link to the source on AliExpress
   - **⚠️ Dropship signals detected** (amber badge): Some indicators suggest dropship; confidence is lower. No supplier link shown
   - **✓ Nothing to report** (no badge): Clean page, no concerns

## Tier Mapping

| Tier | Badge | Appearance | UI |
|------|-------|-----------|-----|
| **flame** | 🔥 | Red/orange (#E4572E) | Full bust panel with prices & CTA |
| **amber** | ! | Amber (#D99A2B) | Cautious panel, no supplier link |
| **silent** | (none) | — | "Nothing to report" state |

The server is the source of truth for tiers. The extension never escalates a tier client-side.

## Settings

### Auto-scan (off by default)

When enabled, the extension automatically scans product pages when you navigate to them. Auto-scan:

- Respects the 10 requests/min rate limit
- Skips obvious non-shopping hosts (Google, YouTube, GitHub, etc.)
- Debounces rapidly repeated scans
- Uses cached results when available

**Disabled by default** to respect the backend's rate limit. Enable only if your backend has sufficient capacity.

### API Base URL

Default: `http://localhost:3000`

If your backend runs on a different host/port, update this in the popup settings.

**Non-localhost backends:** `host_permissions` in `manifest.json` only covers
`http://localhost/*` (any port). If you point `apiBase` at a deployed HTTPS
origin, add that origin (e.g. `"https://your-app.vercel.app/*"`) to
`host_permissions` and reload the extension — otherwise the fetch is
CORS-blocked. The permission is deliberately narrow; never restore `https://*/*`.

## Error Handling

The extension follows a **silence-on-error** philosophy:

- Network timeout, non-200 response, missing `presenceTier`, or any fetch failure → treated as **silent** (no badge)
- Never shows error alarms in the badge; popup may show a muted "couldn't scan" note
- This prevents false alarms when the backend is slow or unreachable

## Technical Details

### Files

- `manifest.json` — Manifest V3 config
- `background.js` — Service worker; caches results, handles auto-scan, sets badges
- `popup.html` — UI structure
- `popup.js` — State management and API communication
- `popup.css` — Dark glass aesthetic
- `content.js` / `content.css` — v0.2 in-page overlay (predates the popup): calls the
  deployed backend's `/api/extension/quick-lookup` directly for an instant
  store-level hint. Standalone — no messaging with popup/background.
- `icons/` — toolbar + store icons

### Caching

- **Per-tab cache**: In-memory; cleared when tab closes or navigates
- **Session cache**: ~50 most-recent URL results; persists during the session
- **Auto-scan**: Checks session cache before fetching from API

### Design

- **Dark glass aesthetic**: Deep warm dark background (#17120D) with frosted glass cards
- **Cinematic**: Gradients, soft shadows, respect for `prefers-reduced-motion`
- **Responsive**: Works at the minimum 340px popup width

## Rate Limiting

The backend is rate-limited to **10 requests/min per IP**. Each scan takes 10–30 seconds. Plan accordingly.

## Development

### Troubleshooting

**Extension won't load**: Check that `manifest.json` is valid (run `node -e "require('./extension/manifest.json')"` to verify JSON)

**Scans fail with "nothing to report"**: Check that the backend is running on the configured API base URL. Open DevTools for the popup (right-click → Inspect) and check the Network tab.

**Auto-scan not triggering**: Verify "Auto-scan enabled" is toggled in the popup settings, and the current page passes the shopping-domain heuristic.

### Modifying the extension

All code is vanilla JavaScript with no build step. Edit the files directly and reload:

1. Make your changes
2. Go to `chrome://extensions/`
3. Click the reload icon on the Busted card

## License

Same as the parent Busted repository.
