export const BRAND_NAME = "Busted";

export const BRAND_HOOK_BUSTED = "They're busted.";

export const BRAND_HOOK_RELIEF = "We got you.";

export const BRAND_TAGLINE = `${BRAND_HOOK_BUSTED} ${BRAND_HOOK_RELIEF}`;

export const BRAND_DESCRIPTION =
  "Paste a retail product link — we expose the dropship markup and find you the real supplier price.";

/**
 * Short legal microcopy shown directly under the URL input on the home page.
 * Sets expectations *before* the user runs a scan: detection can produce false
 * positives, and the AliExpress match is often a similar product, not the
 * literal same SKU. Keep this one breath long.
 */
export const DISCLAIMER_SHORT =
  "Results are estimates. We may flag legit brands as dropships, and AliExpress matches are often similar items, not the exact same product.";

/**
 * Full disclaimer for the persistent footer. Covers the same ground but in
 * a more measured tone — meant to be read once, not glanced at.
 */
export const DISCLAIMER_LONG =
  "Busted is a price-comparison and education tool. Dropship detection and AliExpress matches are AI-generated estimates — verify product identity, seller reputation, and shipping before purchasing. We earn a commission when you buy through a supplier link. It does not change the verdict: the verdict is computed before the affiliate link is fetched.";

/**
 * One-line affiliate disclosure rendered inside the CTA container, directly
 * above the supplier button — never below it. The conflict has to be visible
 * at the moment of the click, not discoverable afterwards in a footer.
 */
export const AFFILIATE_DISCLOSURE =
  "We earn a commission on this link. It never affects the verdict.";

/**
 * "Why this exists" FAQ shown below the how-it-works grid in idle state.
 * Keep it skimmable; this is for the curious-but-not-sold visitor. The
 * money question is non-negotiable: a trust product that hides how it earns
 * loses the argument the moment a sceptic hovers the affiliate link.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does Busted know it’s a dropship?",
    answer:
      "We scrape the product page, then run an AI model trained to spot dropship signals: stock photography that matches AliExpress listings, generic descriptions, premium pricing on commodity items, and a handful of brand-quality heuristics. We label estimates clearly — this is a guide, not a verdict.",
  },
  {
    question: "Is comparing prices like this legal?",
    answer:
      "Yes. Comparing publicly listed prices and pointing users to a different retailer is standard consumer education — the same thing Honey, Capital One Shopping, and Google Shopping all do. We don’t bypass paywalls, scrape private data, or impersonate anyone.",
  },
  {
    question: "How does Busted make money?",
    answer:
      "Affiliate commission. When you buy through a supplier link we earn a small cut from the marketplace — you pay the same price either way. The verdict is computed before any affiliate link is fetched, so what we earn can never change what we tell you. We don’t take money from merchants, and no store can pay to change or remove its verdict.",
  },
  {
    question: "Why AliExpress specifically?",
    answer:
      "Because that’s where most dropship inventory actually ships from. AliExpress lets factories list direct, which is why the same item you saw for $40 on a Shopify boutique is $4 on AliExpress. Buying direct skips the middleman markup — that’s the entire game.",
  },
];
