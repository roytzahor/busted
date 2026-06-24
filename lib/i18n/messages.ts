/**
 * Message catalog.
 *
 * Flat keys (no nesting) keyed by feature area so call sites stay obvious:
 *   t("nav.scan")             — header link
 *   t("hero.headline.busted") — hero gradient text
 *
 * Add a key here ONLY when you'd notice the English fallback shipping to
 * Hebrew users. Microcopy that's universal (numbers, brand name, currency
 * symbols) doesn't need a translation — leave it inline.
 */

import type { LocaleCode } from "@/lib/i18n/locale";

export type MessageKey =
  // Nav
  | "nav.scan"
  | "nav.monitor"
  | "nav.recent"
  | "nav.login"
  | "nav.openMenu"
  | "nav.closeMenu"
  // Currency / language pickers
  | "picker.currency.label"
  | "picker.currency.auto"
  | "picker.language.label"
  // Hero
  | "hero.tagline"
  | "hero.headline.busted"
  | "hero.headline.relief"
  | "hero.description"
  | "hero.placeholder"
  | "hero.cta.scan"
  | "hero.cta.scanning"
  | "hero.paste"
  | "hero.hint"
  | "hero.hint.supplier"
  | "hero.tryOne"
  | "hero.howItWorks"
  // Stats pills
  | "stats.avgScan"
  | "stats.detection"
  | "stats.cache"
  // Trending
  | "trending.title"
  | "trending.subtitle"
  | "trending.savePct"
  // Browse mode
  | "browse.badge"
  | "browse.bannerLead"
  | "browse.bannerTail"
  | "browse.subtext"
  | "browse.cta"
  | "browse.empty.title"
  | "browse.empty.body"
  | "browse.vibe"
  | "browse.picksShown"
  // Bulk paste
  | "bulk.tab.single"
  | "bulk.tab.bulk"
  | "bulk.placeholder"
  | "bulk.cta"
  | "bulk.detected"
  | "bulk.scanning"
  | "bulk.empty";

export type MessageDict = Record<MessageKey, string>;

const en: MessageDict = {
  "nav.scan": "Scan",
  "nav.monitor": "Monitor",
  "nav.recent": "Recent",
  "nav.login": "Log in",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",

  "picker.currency.label": "Currency",
  "picker.currency.auto": "auto",
  "picker.language.label": "Language",

  "hero.tagline": "Spot the markup",
  "hero.headline.busted": "Busted.",
  "hero.headline.relief": "Now skip the markup.",
  "hero.description":
    "Paste any product link — we'll tell you if it's dropshipped and where to buy it at the supplier price.",
  "hero.placeholder": "https://store.com/products/…",
  "hero.cta.scan": "Run Busted Scan",
  "hero.cta.scanning": "Scanning…",
  "hero.paste": "Paste",
  "hero.hint":
    "Any product link works — repeat lookups are instant thanks to 14-day caching.",
  "hero.hint.supplier":
    "This is a supplier marketplace link. Paste the retail store URL (Shopify, etc.) where you saw a markup to detect dropshipping.",
  "hero.tryOne": "Try one",
  "hero.howItWorks": "How it works",

  "stats.avgScan": "Avg scan",
  "stats.detection": "Detection",
  "stats.cache": "Cache",

  "trending.title": "Trending now",
  "trending.subtitle": "Recently scanned · live from the last {hours} hours",
  "trending.savePct": "Save {pct}%",

  "browse.badge": "Browse mode",
  "browse.bannerLead": "Browsing a collection? Here are popular",
  "browse.bannerTail": "alternatives on AliExpress",
  "browse.subtext":
    "We detected a catalog page on {store}. Pick a piece you like — direct from the source.",
  "browse.cta": "View on AliExpress",
  "browse.empty.title": "No browse candidates available right now",
  "browse.empty.body":
    "We couldn't fetch AliExpress alternatives for this collection. Try a specific product link from this store for a 1:1 supplier match.",
  "browse.vibe": "Vibe:",
  "browse.picksShown": "picks shown",

  "bulk.tab.single": "Single URL",
  "bulk.tab.bulk": "Bulk paste",
  "bulk.placeholder":
    "Paste one or more product links — we'll pull them out of your text automatically.",
  "bulk.cta": "Scan all",
  "bulk.detected": "{count} links detected",
  "bulk.scanning": "Scanning {done} of {total}…",
  "bulk.empty": "Paste product links above to scan in bulk.",
};

const he: MessageDict = {
  "nav.scan": "סריקה",
  "nav.monitor": "ניטור",
  "nav.recent": "אחרונות",
  "nav.login": "התחברות",
  "nav.openMenu": "פתח תפריט",
  "nav.closeMenu": "סגור תפריט",

  "picker.currency.label": "מטבע",
  "picker.currency.auto": "אוטומטי",
  "picker.language.label": "שפה",

  "hero.tagline": "תפסו את התוספת",
  "hero.headline.busted": "נתפסתם.",
  "hero.headline.relief": "עכשיו דלגו על התוספת.",
  "hero.description":
    "הדביקו קישור למוצר — נגלה אם זה דרופשיפינג ואיפה לקנות במחיר הספק.",
  "hero.placeholder": "https://store.com/products/…",
  "hero.cta.scan": "הפעל סריקה",
  "hero.cta.scanning": "סורק…",
  "hero.paste": "הדבק",
  "hero.hint":
    "כל קישור למוצר עובד — חיפושים חוזרים מיידיים בזכות מטמון של 14 ימים.",
  "hero.hint.supplier":
    "זהו קישור לחנות ספקים. הדביקו URL של חנות קמעונאית (Shopify וכו') בה ראיתם את המחיר המנופח.",
  "hero.tryOne": "נסו אחד",
  "hero.howItWorks": "איך זה עובד",

  "stats.avgScan": "סריקה ממוצעת",
  "stats.detection": "זיהוי",
  "stats.cache": "מטמון",

  "trending.title": "פופולרי עכשיו",
  "trending.subtitle": "נסרק לאחרונה · עדכון חי מ-{hours} השעות האחרונות",
  "trending.savePct": "חיסכון {pct}%",

  "browse.badge": "מצב גלישה",
  "browse.bannerLead": "גולשים בקטלוג? הנה",
  "browse.bannerTail": "פופולריים באליאקספרס",
  "browse.subtext":
    "זיהינו עמוד קטלוג ב-{store}. בחרו פריט שמוצא חן בעיניכם — ישירות מהמקור.",
  "browse.cta": "צפו באליאקספרס",
  "browse.empty.title": "אין כרגע מועמדים לגלישה",
  "browse.empty.body":
    "לא הצלחנו למשוך חלופות מאליאקספרס לקטלוג הזה. נסו קישור ספציפי למוצר מהחנות הזו להתאמת ספק 1:1.",
  "browse.vibe": "סגנון:",
  "browse.picksShown": "פריטים מוצגים",

  "bulk.tab.single": "כתובת אחת",
  "bulk.tab.bulk": "הדבקה מרובה",
  "bulk.placeholder":
    "הדביקו קישור אחד או יותר למוצרים — נחלץ אותם מהטקסט אוטומטית.",
  "bulk.cta": "סרקו את כולם",
  "bulk.detected": "זוהו {count} קישורים",
  "bulk.scanning": "סורק {done} מתוך {total}…",
  "bulk.empty": "הדביקו קישורים למוצרים למעלה כדי לסרוק במקביל.",
};

const DICTS: Record<LocaleCode, MessageDict> = { en, he };

/**
 * Look up a message and interpolate {placeholder} tokens.
 * Falls back to the English copy when a Hebrew key is missing — never throws
 * and never returns the raw key (which would ship a `nav.foo` literal to the UI).
 */
export function translate(
  locale: LocaleCode,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[locale] ?? DICTS.en;
  const template = dict[key] ?? DICTS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

export type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;
