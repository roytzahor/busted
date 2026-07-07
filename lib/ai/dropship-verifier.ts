import { getAIClient } from "@/lib/ai/client";
import type { ScrapedProductAttributes } from "@/lib/scraping/types";
import type { ProductIdentity } from "@/lib/services/types";

export type DropshipVerdict =
  | "dropship"
  | "legit"
  | "insufficient_evidence"
  | "not_a_product"
  | "collection_page";

export interface DropshipPrediction {
  verdict: DropshipVerdict;
  isLikelyDropship: boolean;
  confidence: number;
  productCategory: string;
  reasoning: string;
  reasoningSignals: string[];
  missingSignals: string[];
  redFlags: string[];
  aliexpressKeywords: string[];
  /**
   * Browse-mode aesthetic tokens — short descriptors capturing the
   * collection's vibe (e.g. ["minimalist", "dainty", "layering"]).
   * Populated only when verdict === "collection_page".
   */
  styleTokens: string[];
  /**
   * Browse-mode material/finish tokens — concrete material or finish
   * cues lifted from item names/descriptions (e.g. ["14k gold",
   * "sterling silver", "stainless steel"]). Populated only when
   * verdict === "collection_page".
   */
  materialPriors: string[];
  estimatedStorePriceUsd: number | null;
  estimatedSupplierPriceUsd: number | null;
  estimatedMarkupPercent: number | null;
}

export interface DropshipVerificationResult {
  prediction: DropshipPrediction | null;
  provider: string;
  model: string;
  rawResponse: string;
  error: string | null;
}

const SYSTEM_PROMPT = `You are a dropshipping detection engine for Busted.
Analyze scraped e-commerce product data and return ONLY valid JSON matching this schema:
{
  "verdict": "dropship" | "legit" | "insufficient_evidence" | "not_a_product" | "collection_page",
  "confidence": number (0..1),
  "productCategory": string,
  "reasoning": string (2-3 sentences citing the scrape),
  "reasoningSignals": string[] (concrete evidence FROM the scrape — never invent),
  "missingSignals": string[] (what data would have raised confidence),
  "redFlags": string[],
  "aliexpressKeywords": string[] (2-5 short functional search phrases a buyer would use to find this product on AliExpress — describe WHAT IT DOES, not the brand name. E.g. ["bottle cap launcher", "beer cap shooter", "cap catapult opener"]. Empty array for not_a_product and collection_page.),
  "styleTokens": string[] (collection_page ONLY — 2-6 short aesthetic descriptors capturing the store's vibe, lifted from collection title/description/visible item names. E.g. ["minimalist", "dainty", "layering", "boho"]. Empty array for other verdicts.),
  "materialPriors": string[] (collection_page ONLY — 1-4 concrete material or finish cues drawn from visible item names (e.g. ["14k gold", "sterling silver"], or ["resin", "porcelain"]). Empty array when no material is evident or for other verdicts.),
  "estimatedStorePriceUsd": number | null,
  "estimatedSupplierPriceUsd": number | null,
  "estimatedMarkupPercent": number | null
}

VERDICT DEFINITIONS — pick exactly one:
- "dropship" — strong evidence this retail page resells a generic supplier product with markup. Requires at least 2 concrete signals in reasoningSignals[].
- "legit" — established brand, real inventory, original product, or supplier marketplace itself.
- "insufficient_evidence" — page IS a product page but the scrape is too sparse (missing title/price/description/images) to judge. Be honest and pick this when you don't have enough.
- "not_a_product" — the scraped content is NOT a product page AND not a shoppable catalog either (blog post, 404, about page, search results, generic homepage with no products).
- "collection_page" — page is a shoppable catalog / collection / category / homepage of an online STORE that lists MULTIPLE distinct products in one vertical (e.g. "All Necklaces", "Bestselling Apparel", a jewelry brand homepage with featured items). Set productCategory to the central vertical (e.g. "necklace", "kitchen gadget", "athleisure"). Populate styleTokens and materialPriors from the visible item names. aliexpressKeywords MUST be empty (we'll build the search query from styleTokens + materialPriors + productCategory downstream).

HARD RULES (violating these = wrong output):
1. Base productCategory and reasoning strictly on the scraped title/description — NEVER invent products that aren't in the data.
2. reasoningSignals[] MUST be non-empty for "dropship" or "legit" verdicts. Each item must quote or paraphrase something from the scrape. Empty array → you MUST use "insufficient_evidence".
3. For "insufficient_evidence", confidence MUST be between 0.2 and 0.5 (you are explicitly uncertain).
4. For "not_a_product", confidence can be 0.7+ (you're confident it's NOT a product). Set estimated prices to null.
5. If sourceUrl is AliExpress, Temu, Wish, DHgate, or any wholesale marketplace → verdict="legit", confidence=0.98, reasoning explains "already at supplier".
6. Do NOT flag AliExpress product pages as dropship — they ARE the supplier source.
7. If scrape has fewer than 3 of {title >5 chars, price detected, description >50 chars, mainImageUrl, brand mention} → you MUST use "insufficient_evidence" or "not_a_product".
8. If a store price is provided, estimate supplier cost at 15-35% of store price for typical dropship markups (only when verdict="dropship").
9. confidence reflects YOUR certainty given available data. Do not output high confidence on weak data.
10. "collection_page" REQUIRES: (a) the scrape mentions multiple distinct product names that share a vertical, AND (b) no single dominant price/PDP. If only ONE product is described, this is a PDP — use dropship/legit/insufficient_evidence instead. Set estimated prices to null. Confidence 0.7+ when the page clearly lists multiple items.
11. styleTokens/materialPriors MUST be empty arrays for any verdict OTHER than "collection_page".
12. COLLECTION_PAGE OVERRIDE — If the product category is a well-known dropship niche (paint-by-numbers kits, photo locket jewelry, LED projectors, smart touch bracelets, galaxy lights, posture correctors, massage gadgets, personalized print-on-demand gifts, etc.) AND there is no independently verifiable brand history in the scrape, use "dropship" (for a PDP) or "insufficient_evidence" instead of "collection_page". A collection page of dropship products is still evidence of a dropship store.
13. SELF-CLAIMED MANUFACTURING (MULTI-SIGNAL RULE) — When ALL of the following are true simultaneously: (a) seller claims "handmade", "made locally", "reservist-owned", or similar, AND (b) no price detected, AND (c) no manufacturer name or trademark, AND (d) product category is widely available on AliExpress — then the self-description is a red flag, not a legit signal. If a store price IS detected or the domain is an established brand name, this rule does NOT apply.
14. DROPSHIP PRODUCT CATEGORIES — The following categories are overwhelmingly dropshipped/fulfilled via third-party services regardless of where the store is located: (a) baby/mother charm necklaces, photo locket jewelry, encrypted-photo jewelry; (b) paint-by-numbers kits; (c) personalized wooden puzzle gifts ("made with CNC technology" is a fulfillment-service red flag, not proof of genuine manufacture — CNC laser/cutting services are widely used by dropship resellers); (d) smart touch bracelets for couples; (e) LED galaxy projectors, posture correctors, massage devices. When a page sells these categories AND has no verifiable manufacturer or brand history AND no price detected, lean strongly toward "dropship" even if the copy sounds professional or claims local production. NOTE: fine jewelry (gold, silver, gemstones sold at $20+ prices) from stores with an established brand-name domain (e.g. brandname.com) is NOT in this list.
15. NO-PRICE SIGNAL — detectedStorePriceUsd=null on a Shopify /products/ page is a weak dropship signal in combination with other signals. Alone it is not enough.
16. PORTFOLIO / GALLERY SITES — If the scrape title is a business name (not a product name) and the content describes product TYPES or categories without individual prices or explicit "Add to Cart" / "Buy Now" buttons visible in the scraped content, use "not_a_product". Critical: a "Shop" navigation link, an empty basket indicator (€0 / £0 / $0 / 0 items), or descriptive prose about product types are NOT evidence of a shoppable collection — they appear on every brand homepage and portfolio site. A true "collection_page" requires MULTIPLE distinct items WITH individual prices OR explicit buy CTAs clearly visible in the scraped markdown. When in doubt between "not_a_product" and "collection_page" for a brand homepage with no prices in the scraped content: always choose "not_a_product".
17. VISION IDENTITY — When a "visionIdentity" object is present it is an image-grounded read of the product (canonicalName = generic function, plus category/productType/visualFeatures/materialGuess). Use it to (a) set productCategory accurately when the title is a brand slug that hides the product ("CapBlast" → canonicalName "bottle cap launcher"), and (b) recognize a generic commodity behind polished marketing copy. It is CORROBORATING evidence only — a genuine brand can also have a clear vision identity, so it never proves "dropship" on its own and never overrides rules 1-16 or the confidence-humility rules. If visionIdentity is absent, judge from the scrape exactly as before.

EXAMPLES:

Input: { title: "Why Dropshipping Is Bad", description: "A blog post about markups", price: null, mainImageUrl: null }
Output: {
  "verdict": "not_a_product",
  "confidence": 0.95,
  "productCategory": "Blog article",
  "reasoning": "The scraped page is a blog article about dropshipping, not a purchasable product. No price, no product image, title reads as an article headline.",
  "reasoningSignals": ["Title reads as an article headline, not a product name", "No price detected", "No product image"],
  "missingSignals": [],
  "redFlags": [],
  "aliexpressKeywords": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "The CapBlast", price: 34.99, description: "Pop beer bottle caps right off and send them flying. Mounts on the bottle top. Fun party gadget." }
Output: {
  "verdict": "dropship",
  "confidence": 0.85,
  "productCategory": "Bottle cap launcher",
  "reasoning": "Generic novelty gadget with a brand-name title that reveals nothing about the product. The description reveals it's a bottle-top mounted cap-launching device — widely available on AliExpress for $3-8.",
  "reasoningSignals": ["Brand name title hides product identity", "Party gadget category typical of dropship", "No brand backstory or manufacturer mentioned"],
  "missingSignals": ["No shipping timeframe"],
  "redFlags": ["Brand-name-only title", "Generic party gadget"],
  "aliexpressKeywords": ["bottle cap launcher", "beer cap shooter", "bottle opener catapult", "cap flying opener"],
  "estimatedStorePriceUsd": 34.99,
  "estimatedSupplierPriceUsd": 5,
  "estimatedMarkupPercent": 600
}

Input: { title: "Premium Galaxy LED Projector — 50% OFF Today!", price: 79.99, description: "Hurry, sale ends soon. Free worldwide shipping. 2-4 weeks delivery." }
Output: {
  "verdict": "dropship",
  "confidence": 0.88,
  "productCategory": "LED Galaxy Projector",
  "reasoning": "Generic gadget with urgency timer marketing, vague brand, and 2-4 week shipping from overseas — all classic dropship signals. Price is heavily marked up vs. typical $5-15 supplier cost.",
  "reasoningSignals": ["Urgency timer ('50% OFF Today', 'sale ends soon')", "2-4 week delivery suggests overseas drop-shipping", "Generic product category widely sold on AliExpress", "No brand identity visible in scrape"],
  "missingSignals": ["No brand About page text", "No manufacturer name"],
  "redFlags": ["Urgency timer", "Overseas shipping", "Generic branding"],
  "aliexpressKeywords": ["galaxy led star projector", "night light galaxy projector", "led star ceiling projector"],
  "estimatedStorePriceUsd": 79.99,
  "estimatedSupplierPriceUsd": 12,
  "estimatedMarkupPercent": 567
}

Input: { title: "Men's Tree Runners — Sustainable Sneakers | Allbirds", price: 98, description: "Eucalyptus tree fiber. Machine washable. Certified B-Corp." }
Output: {
  "verdict": "legit",
  "confidence": 0.92,
  "productCategory": "Sustainable sneakers",
  "reasoning": "Recognized DTC brand (Allbirds) with proprietary materials and brand identity. Price consistent with their retail. No dropship markup signals.",
  "reasoningSignals": ["Known DTC brand 'Allbirds' in title", "Proprietary material (eucalyptus tree fiber)", "B-Corp certification mentioned"],
  "missingSignals": [],
  "redFlags": [],
  "aliexpressKeywords": ["sustainable sneakers", "wool running shoes", "eco sneakers men"],
  "estimatedStorePriceUsd": 98,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "Some Product", price: null, description: "", mainImageUrl: null }
Output: {
  "verdict": "insufficient_evidence",
  "confidence": 0.3,
  "productCategory": "Unknown",
  "reasoning": "Scrape returned almost no data — title is generic, no price, no description, no image. Cannot judge dropship likelihood from this.",
  "reasoningSignals": ["Title is generic ('Some Product')"],
  "missingSignals": ["No price", "No description", "No product image"],
  "redFlags": [],
  "aliexpressKeywords": [],
  "styleTokens": [],
  "materialPriors": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "All Necklaces — Lume Studio", description: "Dainty layering necklaces in 14k gold-filled and sterling silver. Shop the collection.", markdownExcerpt: "Featured: Petal Pendant Necklace · Mini Bar Necklace · Layered Curb Chain · Tiny Star Charm Necklace · Pearl Drop Necklace · Initial Disc Necklace ..." }
Output: {
  "verdict": "collection_page",
  "confidence": 0.9,
  "productCategory": "necklace",
  "reasoning": "Page lists six distinct necklace items under one collection title with no single price — clearly a catalog/category page, not a PDP. Vibe is dainty/minimalist layered jewelry in gold-fill and silver.",
  "reasoningSignals": ["Title 'All Necklaces' is a collection name", "Six distinct item names listed (Petal Pendant, Mini Bar, Layered Curb Chain, ...)", "Description references 'shop the collection', not a single product"],
  "missingSignals": ["No individual product prices on this page"],
  "redFlags": [],
  "aliexpressKeywords": [],
  "styleTokens": ["minimalist", "dainty", "layering"],
  "materialPriors": ["14k gold", "sterling silver"],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { title: "ArtisanBrand - Leather Tool Belt", sourceUrl: "https://artisanbrand.com/", detectedStorePriceUsd: null, description: "Introducing a versatile line of leather products, including tool belts, belt bags, organized tool buckets, document tubes, and pocket protectors.", markdownExcerpt: "€ 0,00 0 Basket ... Home Info Shop Blog Contact ... Leather Toolbelt for Women [3-sentence description] ... Leather Tool Bucket [3-sentence description] ... Leather Document Tube [3-sentence description] ..." }
Output: {
  "verdict": "not_a_product",
  "confidence": 0.88,
  "productCategory": "Leather accessories brand homepage",
  "reasoning": "Homepage of an artisan leather goods brand. Three product types are described in prose (toolbelt, tool bucket, document tube) but NO individual prices appear anywhere in the scrape and NO 'Add to Cart' or 'Buy Now' buttons are present. The empty basket (€0) and 'Shop' navigation link exist on every brand homepage — they are not buy CTAs. Rule 16 applies: this is a portfolio/brand homepage, not a shoppable collection page.",
  "reasoningSignals": ["Title is the brand name, not a product name", "No prices detected in the scraped content", "No 'Add to Cart' or 'Buy Now' buttons visible in the markdown", "Product descriptions are prose about types, not individual shoppable listings"],
  "missingSignals": ["Individual product prices", "Add to cart mechanism"],
  "redFlags": [],
  "aliexpressKeywords": [],
  "styleTokens": [],
  "materialPriors": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { sourceUrl: "https://agasandtamar.com/he/product/in-between-ring", title: "In Between Ring", description: "Delicate gold ring set with a slice of ruby and a gold element sitting side by side. A ring unlike others, will not look exactly like the pictures.", detectedStorePriceUsd: 30, mainImageUrl: "https://..." }
Output: {
  "verdict": "legit",
  "confidence": 0.82,
  "productCategory": "Fine jewelry ring",
  "reasoning": "Fine jewelry store with detected price ($30), branded domain name, and a product (ruby + gold ring) that is bespoke/design-driven — not a commodity AliExpress item. The description mentions unique artisan characteristics ('will not look exactly like the pictures'). No dropship signals present.",
  "reasoningSignals": ["Price detected ($30) — JS-rendered prices work on this page, indicating a real product", "Ruby + gold fine jewelry is not a commodity AliExpress product category", "Description notes each ring is slightly unique — consistent with artisan production", "Branded domain (brand name .com) with no red flags"],
  "missingSignals": [],
  "redFlags": [],
  "aliexpressKeywords": ["gold ruby ring", "ruby slice ring gold", "dainty gemstone ring"],
  "styleTokens": [],
  "materialPriors": [],
  "estimatedStorePriceUsd": 30,
  "estimatedSupplierPriceUsd": null,
  "estimatedMarkupPercent": null
}

Input: { sourceUrl: "https://imri-jewelry.co.il/products/my-baby-necklace", title: "My Baby Necklace", description: "Sterling silver 925, hypoallergenic. Seller describes themselves as a reservist-owned business. Two-year warranty. Free returns. 445 reviews.", detectedStorePriceUsd: null, mainImageUrl: "https://..." }
Output: {
  "verdict": "dropship",
  "confidence": 0.78,
  "productCategory": "Baby charm necklace",
  "reasoning": "Baby charm necklaces in 925 sterling silver are one of the most saturated dropship categories on AliExpress ($2-8 supplier cost). No price is detected (JS-rendered), the brand has no independently verifiable identity, no manufacturer is cited, and the seller's 'reservist business' framing is self-description without corroboration. All signals together — category, no price, no brand — indicate dropship.",
  "reasoningSignals": ["Product category (baby charm necklace, 925 silver plating) is overwhelmingly dropshipped from AliExpress", "No price detected on /products/ PDP — common in JS-rendered dropship stores", "No manufacturer name or trademark cited anywhere in the scrape", "Self-described as 'reservist business' without corroborating brand history — insufficient to establish legitimacy"],
  "missingSignals": ["No store price", "No brand About page", "No manufacturer cited"],
  "redFlags": ["AliExpress-saturated product category", "No price", "No verifiable brand identity"],
  "aliexpressKeywords": ["baby charm necklace sterling silver", "infant pendant necklace 925", "mother baby necklace charm"],
  "styleTokens": [],
  "materialPriors": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": 4,
  "estimatedMarkupPercent": null
}

Input: { sourceUrl: "https://www.example-gifts.co.il/collections/paint-by-numbers-kits", title: "ערכות הצביעה לפי מספרים — Best Paint by Numbers Kits in Israel", description: "Buy quality paint-by-numbers kits. Includes canvas, paints and brushes.", detectedStorePriceUsd: null }
Output: {
  "verdict": "dropship",
  "confidence": 0.82,
  "productCategory": "Paint by numbers kit",
  "reasoning": "Paint-by-numbers kits are one of the most heavily dropshipped product categories from AliExpress/Chinese suppliers. This is a Shopify collections page on a regional Israeli domain with no brand history, no manufacturer name, and no price. The store appears to resell generic kits imported from Chinese suppliers at markup.",
  "reasoningSignals": ["Paint-by-numbers kits are a top-10 AliExpress dropship category", "Regional .co.il Shopify store with no verifiable brand or manufacturer", "No price detected — typical of JS-rendered dropship stores", "URL is a /collections/ path with no individual PDP — browse-mode dropship store structure"],
  "missingSignals": ["No individual product prices", "No manufacturer", "No brand history"],
  "redFlags": ["Dropship-saturated product category", "No brand identity", "No price"],
  "aliexpressKeywords": ["paint by numbers kit adults", "diy oil painting canvas numbers", "number painting kit"],
  "styleTokens": [],
  "materialPriors": [],
  "estimatedStorePriceUsd": null,
  "estimatedSupplierPriceUsd": 8,
  "estimatedMarkupPercent": null
}`;

/** Compact, image-grounded identity block surfaced to the verdict prompt.
 *  Only the fields useful for classification — keeps token cost negligible. */
function buildVisionIdentityBlock(
  identity: ProductIdentity,
): Record<string, unknown> {
  return {
    canonicalName: identity.canonicalName,
    category: identity.category,
    productType: identity.productType,
    functionDescription: identity.functionDescription,
    visualFeatures: identity.visualFeatures.slice(0, 6),
    materialGuess: identity.materialGuess,
    confidence: identity.confidence,
  };
}

function buildUserPrompt(
  attributes: ScrapedProductAttributes,
  markdownExcerpt: string,
  storePriceUsd: number | null,
  identity?: ProductIdentity | null,
): string {
  // For non-Latin-script titles, an English translation is precomputed in
  // lib/scraping/router.ts. We surface it as `titleTranslation` (alongside
  // the original) so the verdict can read both — the original preserves
  // brand voice for legit-detection while the translation prevents the
  // model from misclassifying Hebrew/Arabic/CJK pages as "insufficient
  // evidence" simply because it can't parse them.
  return JSON.stringify(
    {
      sourceUrl: attributes.sourceUrl,
      scrapeProvider: attributes.provider,
      title: attributes.title,
      ...(attributes.translatedTitle
        ? { titleTranslation: attributes.translatedTitle }
        : {}),
      description: attributes.description.slice(0, 600),
      mainImageUrl: attributes.mainImageUrl,
      detectedStorePriceUsd: storePriceUsd,
      ...(identity ? { visionIdentity: buildVisionIdentityBlock(identity) } : {}),
      markdownExcerpt: markdownExcerpt.slice(0, 2000),
    },
    null,
    2,
  );
}

/**
 * Counts the scrape-attribute signals behind humility rule 7. Exported so
 * the Tier-0 fingerprint gate applies the exact same product-page-shape
 * threshold — the two must never drift.
 */
export function countAttributeSignals(
  attributes: ScrapedProductAttributes,
  storePriceUsd: number | null,
): number {
  let count = 0;
  if (attributes.title.length > 5) count += 1;
  if (storePriceUsd !== null && storePriceUsd > 0) count += 1;
  if (attributes.description.length > 50) count += 1;
  if (attributes.mainImageUrl !== null) count += 1;
  return count;
}

function isValidVerdict(value: unknown): value is DropshipVerdict {
  return (
    value === "dropship" ||
    value === "legit" ||
    value === "insufficient_evidence" ||
    value === "not_a_product" ||
    value === "collection_page"
  );
}

function applyClamps(
  prediction: DropshipPrediction,
  attributeCount: number,
): DropshipPrediction {
  let { verdict, confidence } = prediction;

  // Empty reasoningSignals → demote to insufficient_evidence (rule 2)
  if (
    prediction.reasoningSignals.length === 0 &&
    (verdict === "dropship" || verdict === "legit")
  ) {
    verdict = "insufficient_evidence";
    confidence = Math.min(confidence, 0.4);
  }

  // Sparse scrape → cannot output high-confidence dropship/legit (rule 7)
  if (attributeCount < 3 && (verdict === "dropship" || verdict === "legit")) {
    confidence = Math.min(confidence, 0.5);
  }

  // insufficient_evidence must be in 0.2..0.5 (rule 3)
  if (verdict === "insufficient_evidence") {
    confidence = Math.min(0.5, Math.max(0.2, confidence));
  }

  // not_a_product clears price estimates, keywords, and style/material tokens
  if (verdict === "not_a_product") {
    return {
      ...prediction,
      verdict,
      confidence,
      isLikelyDropship: false,
      aliexpressKeywords: [],
      styleTokens: [],
      materialPriors: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    };
  }

  // collection_page clears keywords and prices (browse path builds its own
  // query from category + styleTokens + materialPriors). Enforce rule 10
  // confidence floor and rule 11 (clear keywords).
  if (verdict === "collection_page") {
    return {
      ...prediction,
      verdict,
      confidence: Math.max(0.7, confidence),
      isLikelyDropship: false,
      aliexpressKeywords: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    };
  }

  // Non-collection verdicts must NOT carry browse-mode tokens (rule 11).
  return {
    ...prediction,
    verdict,
    confidence,
    isLikelyDropship: verdict === "dropship",
    styleTokens: [],
    materialPriors: [],
  };
}

function parsePrediction(
  raw: string,
  attributeCount: number,
): DropshipPrediction | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (
      typeof parsed.confidence !== "number" ||
      typeof parsed.productCategory !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      return null;
    }

    // Back-compat: older prompts returned isLikelyDropship boolean only.
    // Derive verdict if missing.
    let verdict: DropshipVerdict;
    if (isValidVerdict(parsed.verdict)) {
      verdict = parsed.verdict;
    } else if (typeof parsed.isLikelyDropship === "boolean") {
      verdict = parsed.isLikelyDropship ? "dropship" : "legit";
    } else {
      return null;
    }

    const reasoningSignals = Array.isArray(parsed.reasoningSignals)
      ? parsed.reasoningSignals.filter((s): s is string => typeof s === "string")
      : [];

    const missingSignals = Array.isArray(parsed.missingSignals)
      ? parsed.missingSignals.filter((s): s is string => typeof s === "string")
      : [];

    const aliexpressKeywords = Array.isArray(parsed.aliexpressKeywords)
      ? parsed.aliexpressKeywords.filter((s): s is string => typeof s === "string")
      : [];

    const styleTokens = Array.isArray(parsed.styleTokens)
      ? parsed.styleTokens.filter((s): s is string => typeof s === "string")
      : [];

    const materialPriors = Array.isArray(parsed.materialPriors)
      ? parsed.materialPriors.filter((s): s is string => typeof s === "string")
      : [];

    const prediction: DropshipPrediction = {
      verdict,
      isLikelyDropship: verdict === "dropship",
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      productCategory: parsed.productCategory,
      reasoning: parsed.reasoning,
      reasoningSignals,
      missingSignals,
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.filter((f): f is string => typeof f === "string")
        : [],
      aliexpressKeywords,
      styleTokens,
      materialPriors,
      estimatedStorePriceUsd:
        typeof parsed.estimatedStorePriceUsd === "number"
          ? parsed.estimatedStorePriceUsd
          : null,
      estimatedSupplierPriceUsd:
        typeof parsed.estimatedSupplierPriceUsd === "number"
          ? parsed.estimatedSupplierPriceUsd
          : null,
      estimatedMarkupPercent:
        typeof parsed.estimatedMarkupPercent === "number"
          ? parsed.estimatedMarkupPercent
          : null,
    };

    return applyClamps(prediction, attributeCount);
  } catch {
    return null;
  }
}

export async function verifyDropshipLikelihood(params: {
  attributes: ScrapedProductAttributes;
  markdownExcerpt: string;
  storePriceUsd: number | null;
  /** Vision-grounded identity (from ProductIdentifierService). When present it
   *  is surfaced to the prompt as corroborating evidence; absent = today's
   *  text-only behavior, so existing callers are unaffected. */
  identity?: ProductIdentity | null;
}): Promise<DropshipVerificationResult> {
  let clientModel = process.env.GOOGLE_AI_MODEL ?? "gemini-3.5-flash";
  const attributeCount = countAttributeSignals(params.attributes, params.storePriceUsd);

  try {
    const client = getAIClient();
    clientModel = client.activeModel;

    const completion = await client.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(
            params.attributes,
            params.markdownExcerpt,
            params.storePriceUsd,
            params.identity,
          ),
        },
      ],
      maxTokens: 8192,
      temperature: 0.1,
      jsonMode: true,
    });

    const prediction = parsePrediction(completion.content, attributeCount);

    return {
      prediction,
      provider: completion.provider,
      model: completion.model,
      rawResponse: completion.content,
      error: prediction ? null : "AI response could not be parsed as structured JSON.",
    };
  } catch (err) {
    return {
      prediction: null,
      provider: "google",
      model: clientModel,
      rawResponse: "",
      error: err instanceof Error ? err.message : "AI verification failed.",
    };
  }
}
