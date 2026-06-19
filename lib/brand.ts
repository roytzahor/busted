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
  "Busted is a price-comparison and education tool. Dropship detection and AliExpress matches are AI-generated estimates — verify product identity, seller reputation, and shipping before purchasing. Not affiliated with the stores or marketplaces we link to.";
