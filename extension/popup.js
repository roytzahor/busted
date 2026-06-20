// Popup script — runs in the extension's own page context.
// Reads the active tab URL when the user clicks "Bust this page" and
// opens busted.app with that URL pre-loaded so the scan auto-runs.

const BUSTED_URL = "https://buy-pass-silk.vercel.app/";

document.getElementById("bust-current").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const u = new URL(BUSTED_URL);
    u.searchParams.set("url", tab.url);
    u.searchParams.set("utm_source", "chrome_extension_popup");
    chrome.tabs.create({ url: u.toString() });
    window.close();
  } catch (err) {
    console.error("[busted-popup] failed", err);
  }
});
