/**
 * Static, manually-verified mapping from generic product categories (the
 * strings our verifier emits) to AliExpress Open Platform category IDs +
 * supplier-grade keyword arms + negative filters.
 *
 * Why static: option (B) crowdsourcing and (C) per-call Gemini lookup were
 * both rejected for this layer. The category taxonomy is the load-bearing
 * filter on every search — it must be deterministic and audit-able.
 *
 * Maintenance contract:
 *   - Each entry carries `verifiedAt` (ISO date) — last time the IDs were
 *     cross-checked against AE's category tree console.
 *   - Re-verify each entry every 90 days. AliExpress occasionally re-trees
 *     subcategories without ID changes, but new family branches do appear.
 *   - When verifying, paste a known winner URL into
 *     `https://api-sg.aliexpress.com/sync` with method
 *     `aliexpress.affiliate.productdetail.get` and confirm the `first_level_category_id`
 *     and `second_level_category_id` values match what we have here.
 *
 * AE category-ID structure (for the curious): 6-9 digit integers. The first
 * 3-4 digits historically encode the L1 root family (322 = Shoes,
 * 509 = Phones, 66 = Beauty). Trailing digits sub-narrow. Some L2+ IDs are
 * 9-digit "200000xxx" / "100000xxx" blocks added after 2018.
 */

export type SortStrategy =
  | "LAST_VOLUME_DESC" // bulk-orders sort — bias toward proven dropship inventory
  | "SALE_PRICE_ASC" // raw price ladder — useful when source is ultra-cheap
  | "LAST_VOLUME_ASC"
  | "SALE_PRICE_DESC";

/**
 * Cross-axis remapping for categories where the retail-facing variant axis
 * differs from the factory-facing axis on AliExpress.
 *
 * Classic case: shower steamers are sold by *color* on the consumer store
 * ("purple", "orange") but listed by *scent* on AE ("lavender", "citrus").
 * Without a mapping the variant matcher finds zero shared dimensions and
 * falls back to `EMPTY_RESULT` — the buyer lands on a random scent.
 *
 * The matcher applies these at score time: it projects the source value
 * through the valueMap onto the toAxis so it can compare against the actual
 * AE SKU attributes.
 */
export interface AxisMapping {
  /** Canonical source-side axis (the key in `ScrapedProductVariant`). */
  fromAxis: "color" | "size" | "capacity" | "material";
  /** Factory-side AE attribute key (arbitrary lowercase string). */
  toAxis: string;
  /**
   * Lowercase source value → target value.
   * Non-matching source values are passed through unchanged on the fromAxis.
   */
  valueMap: Record<string, string>;
}

export interface CategoryVocabEntry {
  /** Canonical key (the lookup name). */
  vertical: string;
  /** Human-friendly L1 family label — for logging / debug only. */
  parentFamily: string;
  /**
   * Comma-joinable AE category IDs. We send multiple when the family spans
   * adjacent leaves (e.g. men's + women's slippers, bath salts + soap).
   * AliExpress accepts comma-separated lists in the `category_ids` param.
   */
  categoryIds: string[];
  /**
   * Multi-arm keyword queries — caller fans these out in parallel and
   * merges the candidate pools.
   */
  queries: string[];
  /**
   * Title-contains substring patterns (case-insensitive) that immediately
   * reject a candidate. Applied AFTER the API returns, BEFORE confidence
   * scoring.
   */
  negativeKeywords: string[];
  /**
   * Multiplier on the source store retail price → AE `min_sale_price`.
   * A typical dropship markup is 3–15×, so floor at 1/25 of retail.
   */
  priceFloorRatio: number;
  /**
   * Multiplier on the source store retail price → AE `max_sale_price`.
   * Ceiling at 1/1.2 of retail so we never surface re-sellers as "the supplier".
   */
  priceCeilRatio: number;
  defaultSort: SortStrategy;
  /** ISO date this entry was last manually verified against AE's console. */
  verifiedAt: string;
  /** Free-form maintenance notes — quirks discovered during verification. */
  notes?: string;
  /**
   * Optional cross-axis remappings for this vertical. Applied by the variant
   * matcher when the retail variant axis differs from the AE factory axis.
   * See `AxisMapping` for the shape and the shower-steamer entry for a usage
   * example.
   */
  variantAxisMappings?: AxisMapping[];
  /**
   * AliExpress product ID to use as a probe in the monthly category-ID
   * verification job (`npm run verify:categories` / GHA cron).
   *
   * Pick a stable, high-volume factory listing — NOT a brand-name or
   * frequently-delisted product. Find the ID in the product URL:
   *   https://www.aliexpress.com/item/<PRODUCT_ID>.html
   *
   * The verification script fetches this product via `productdetail.get`,
   * reads back `first_level_category_id` and `second_level_category_id`,
   * and asserts that at least one value appears in `categoryIds`.
   * A mismatch means AliExpress re-treed the subcategory — update `categoryIds`.
   *
   * Leave undefined to skip verification for this vertical (generates a warning).
   */
  verificationProductId?: string;
}

/* ─── The seed table ─────────────────────────────────────────────────── */

export const CATEGORY_MAP: Record<string, CategoryVocabEntry> = {
  "phone cases": {
    vertical: "phone cases",
    parentFamily: "Phones & Telecommunications",
    // 200000142 = Mobile Phone Cases & Covers (the canonical leaf).
    // Adding 200001619 = Phone Bumpers & Protectors as adjacent catch.
    categoryIds: ["200000142", "200001619"],
    queries: [
      "TPU shockproof phone case clear",
      "silicone liquid phone case shockproof",
      "magsafe magnetic phone case clear",
      "phone case bumper TPU PC",
    ],
    negativeKeywords: [
      // Wrong product family
      "screen protector", "tempered glass", "screen guard", "privacy filter",
      "charger", "cable", "adapter", "earphone", "earbud", "airpods case",
      // Accessories that share keywords
      "stand", "holder", "mount", "tripod", "grip", "pop socket", "popsocket",
      "ring holder", "lanyard", "strap only", "phone strap",
      "cleaner", "cleaning kit", "wipes", "spray",
      // Lookalikes
      "wallet", "card holder", "purse", "crossbody",
      // Bulk / wholesale signals (we want 1, not pallets)
      "wholesale lot", "100 pcs", "50 pieces", "carton",
      // Re-listing noise
      "tiktok", "as seen on", "viral 2026",
    ],
    priceFloorRatio: 1 / 25, // $50 case → $2 min
    priceCeilRatio: 1 / 1.2, // $50 case → $41.66 max
    defaultSort: "LAST_VOLUME_DESC",
    // To populate: search AE for "TPU shockproof phone case clear", open a
    // high-volume factory listing, copy the product ID from the URL.
    verificationProductId: undefined,
    verifiedAt: "2026-06-19",
    notes:
      "200000142 is stable since pre-2020. iPhone-specific subcategories live " +
      "deeper but are too narrow to use as a default filter.",
  },

  "shower steamer": {
    vertical: "shower steamer",
    parentFamily: "Beauty & Health",
    // 200000801 = Bath Salts (closest leaf — AE doesn't have a dedicated
    // "shower steamer" node as of last verification).
    // 200000803 = Soap; some shower-steamer factories cross-list here.
    // 200000813 = Massage & Relaxation; adjacent catch.
    categoryIds: ["200000801", "200000803", "200000813"],
    queries: [
      "shower steamer aromatherapy tablets",
      "eucalyptus menthol shower steamer",
      "essential oil shower bomb tablets",
      "shower steamer",
    ],
    negativeKeywords: [
      // Wrong product family — bath bombs are for tubs not showers
      "bath bomb", "bath soak", "tub bomb", "bath fizzer",
      "soap bar", "shampoo", "conditioner", "body wash", "shower gel",
      "scrub", "exfoliant", "loofah", "sponge",
      "candle", "incense", "diffuser", "reed", "wax melt", "wax cube", "wax tart",
      "essential oil bottle", "essential oil 100ml",
      // Shower accessories (not the consumable)
      "shower head", "shower curtain", "shower hose", "shower mat",
      "shower caddy", "shower shelf",
      // Aftermarket
      "refill", "concentrate", "syrup",
      // Cube lookalikes
      "ice cube", "ice tray", "silicone mold", "molds for", "rubik", "rubiks",
      "stress ball", "stress cube",
      // Marketing fluff
      "tiktok", "viral", "as seen", "trending 2026",
    ],
    priceFloorRatio: 1 / 25,
    priceCeilRatio: 1 / 1.2,
    defaultSort: "LAST_VOLUME_DESC",
    // To populate: search AE for "shower steamer aromatherapy tablets",
    // open a high-volume listing, copy the product ID.
    verificationProductId: undefined,
    variantAxisMappings: [
      {
        fromAxis: "color",
        toAxis: "scent",
        valueMap: {
          purple:        "lavender",
          violet:        "lavender",
          lilac:         "lavender",
          blue:          "ocean",
          "light blue":  "ocean",
          teal:          "eucalyptus",
          green:         "eucalyptus",
          "light green": "mint",
          mint:          "mint",
          orange:        "citrus",
          yellow:        "citrus",
          lemon:         "citrus",
          red:           "rose",
          pink:          "rose",
          "hot pink":    "rose",
          white:         "vanilla",
          cream:         "vanilla",
          beige:         "vanilla",
          brown:         "coffee",
          "dark brown":  "coffee",
        },
      },
    ],
    verifiedAt: "2026-06-19",
    notes:
      "AE has no dedicated shower-steamer node. Factories listed under " +
      "Bath Salts (200000801) or occasionally under Soap (200000803). " +
      "Re-check quarterly — a dedicated leaf could appear. " +
      "Variant axis diverges: retail stores use color, AE factories use scent — " +
      "handled via variantAxisMappings.",
  },

  slippers: {
    vertical: "slippers",
    parentFamily: "Shoes",
    // 200000871 = Slippers (main leaf, stable for 5+ years).
    // 200000919 = Men's Slippers, 200000920 = Women's Slippers — these
    // exist as gender-narrowed children; including both removes the
    // gender-bias that the parent leaf has.
    categoryIds: ["200000871", "200000919", "200000920"],
    queries: [
      "EVA pillow slides cloud slippers",
      "plantar fasciitis EVA foam slippers arch support",
      "thick EVA foam slides non-slip TPR",
      "EVA cloud slides",
    ],
    negativeKeywords: [
      // Replacement / aftermarket parts
      "insole", "inserts", "replacement", "refill", "pad only", "cushion only",
      // Cleaning / care
      "cleaner", "spray", "shoe polish", "shoe brush", "deodoriz", "freshener",
      // Storage / accessories
      "shoe bag", "shoe rack", "travel bag", "storage bag", "shoe horn", "shoehorn",
      // Lookalikes / costume / decor
      "keychain", "miniature", "doll", "figurine", "plush", "ornament", "pendant",
      "phone case", "phone holder", "airpods case",
      // Wrong shoe families
      "boot", "boots", "sneaker", "running shoe", "high heel", "sock", "socks",
      // Marketing noise
      "trending 2026", "tiktok viral", "as seen on", "instagram famous",
      // Wholesale lots
      "wholesale lot", "bulk 10 pairs", "carton of",
    ],
    priceFloorRatio: 1 / 30, // slippers are extreme-margin products — 30× markup common
    priceCeilRatio: 1 / 1.2,
    defaultSort: "LAST_VOLUME_DESC",
    // To populate: search AE for "EVA pillow slides cloud slippers",
    // open a high-volume factory listing, copy the product ID.
    verificationProductId: undefined,
    verifiedAt: "2026-06-19",
    notes:
      "Include gender subcategories — AE's slipper-search ranking weighs " +
      "gender match heavily and the parent leaf 200000871 sometimes returns " +
      "unisex bath sandals only.",
  },

  necklace: {
    vertical: "necklace",
    parentFamily: "Jewelry & Accessories",
    // 200000226 = Necklaces & Pendants (parent leaf, stable).
    // 200002034 = Pendant Necklaces (most common dropship subcat).
    // 200002033 = Chain Necklaces.
    categoryIds: ["200000226", "200002034", "200002033"],
    queries: [
      "S925 sterling silver necklace pendant",
      "stainless steel necklace pendant gold plated",
      "925 silver chain necklace dainty",
      "cubic zirconia pendant necklace minimalist",
    ],
    negativeKeywords: [
      // Wrong jewelry families
      "earring", "earrings", "bracelet", "ring", "anklet", "brooch",
      "watch", "smartwatch",
      // Accessories / aftermarket
      "necklace holder", "necklace stand", "jewelry box", "display case",
      "polishing cloth", "cleaner", "anti tarnish",
      "extender", "clasp", "jump ring", "findings", "DIY",
      // Costume / replica giveaways
      "cosplay", "halloween", "fancy dress", "costume jewelry only",
      "kid", "kids", "child", "toy",
      // Mismatch product types
      "phone charm", "keychain", "keyring", "lanyard",
      // Bulk wholesaler signals
      "wholesale lot", "100 pcs mixed", "bulk lot",
    ],
    priceFloorRatio: 1 / 50, // jewelry has the widest markup spread (10–50×)
    priceCeilRatio: 1 / 1.2,
    defaultSort: "LAST_VOLUME_DESC",
    // To populate: search AE for "S925 sterling silver necklace pendant",
    // open a high-volume factory listing, copy the product ID.
    verificationProductId: undefined,
    verifiedAt: "2026-06-19",
    notes:
      "Most viral 'baby name necklace' / 'birthstone' dropship listings on AE " +
      "are tagged 200002034 (Pendant Necklaces). Also re-list under " +
      "'Customized Necklaces' (no stable ID) — keyword fallback covers this.",
  },

  "apparel sizes": {
    vertical: "apparel sizes",
    parentFamily: "Men's & Women's Clothing",
    // 100003109 = Women's Clothing (root)
    // 100003070 = Men's Clothing (root)
    // 200000345 = Women's T-Shirts (most-common dropship leaf)
    // 200000343 = Women's Hoodies & Sweatshirts (second-most common)
    categoryIds: ["100003109", "100003070", "200000345", "200000343"],
    queries: [
      "cotton oversized t-shirt unisex blank",
      "loose fit cotton hoodie pullover",
      "streetwear graphic tee unisex 100% cotton",
      "vintage washed t-shirt heavyweight cotton",
    ],
    negativeKeywords: [
      // Accessories / aftermarket
      "hanger", "hangers", "drying rack", "garment bag", "storage bag",
      "iron", "steamer", "lint roller", "detergent", "stain remover",
      "size chart", "measuring tape", "tailor", "sewing",
      // Wrong garment families that re-list under unisex/clothing keywords
      "swimsuit", "swimwear", "bikini", "underwear", "boxer", "panty",
      "sock", "socks", "tights", "leggings only", "pantyhose",
      "shoe", "shoes", "boot", "sneaker", "sandal",
      "hat", "cap", "scarf only", "glove", "belt",
      "bag", "backpack", "purse", "wallet",
      // Kid / pet redirects (when source is adult apparel)
      "doll clothes", "pet clothes", "dog hoodie", "cat costume",
      // Bulk / sample signals
      "wholesale lot", "10 pcs mixed sizes", "carton of",
      // Counterfeit / replica indicators
      "replica", "1:1 quality", "AAA quality",
    ],
    priceFloorRatio: 1 / 20,
    priceCeilRatio: 1 / 1.3, // apparel has tighter retail-to-supplier spread than jewelry
    defaultSort: "LAST_VOLUME_DESC",
    // To populate: search AE for "cotton oversized t-shirt unisex blank",
    // open a high-volume factory listing, copy the product ID.
    verificationProductId: undefined,
    verifiedAt: "2026-06-19",
    notes:
      "Apparel is the toughest category to disambiguate because dropship " +
      "stores often re-photograph the same generic factory shirt. The price " +
      "ceiling is tighter (1/1.3) because legitimate brand apparel and " +
      "white-label apparel overlap in the AE catalog above that band.",
  },

  // ── Sprint 12 Stage 34: five new verticals ───────────────────────────────

  "shoes": {
    vertical: "shoes",
    parentFamily: "Shoes",
    // 200000301 = Men's Shoes (catch-all); 200002032 = Women's Casual Shoes;
    // 200002033 = Athletic / Running Shoes.
    categoryIds: ["200000301", "200002032", "200002033"],
    queries: [
      "men's casual loafers wool",
      "wool slip-on shoes men",
      "merino wool everyday shoes",
      "lounger walking shoes",
    ],
    negativeKeywords: [
      "slipper", "house shoe", "indoor slipper",
      "shoelace", "lace only", "insole", "insert", "shoe horn",
      "shoe rack", "shoe box", "shoe cleaner", "polish",
      "kids", "child", "baby", "infant", "doll",
      "size guide", "shoe model", "decoration",
      "replica", "1:1 quality", "AAA quality",
      "wholesale lot", "carton of",
    ],
    priceFloorRatio: 1 / 20, // $100 shoes → $5 floor
    priceCeilRatio: 1 / 1.5, // $100 shoes → $66 ceiling (real brand premium tighter)
    defaultSort: "LAST_VOLUME_DESC",
    verificationProductId: undefined,
    verifiedAt: "2026-06-20",
    notes:
      "Shoes are a high-volume dropship category but pricing varies wildly " +
      "by sub-segment. We keep the price ceiling tight to filter out cheap " +
      "sandals when the source is a $100 casual.",
  },

  "water bottle": {
    vertical: "water bottle",
    parentFamily: "Home & Garden",
    // 200001074 = Water Bottles; 200001081 = Vacuum Flasks & Thermoses.
    categoryIds: ["200001074", "200001081"],
    queries: [
      "stainless steel water bottle insulated",
      "vacuum thermos water bottle 1L",
      "leakproof gym water bottle",
      "double wall tumbler water bottle",
    ],
    negativeKeywords: [
      "wine bottle", "spray bottle", "perfume bottle", "shampoo bottle",
      "feeding bottle", "baby bottle", "pet bottle", "dog water bottle",
      "filter only", "replacement filter", "lid only", "cap only",
      "straw only", "brush", "cleaning",
      "decoration", "sticker", "skin only",
      "wholesale lot", "carton",
    ],
    priceFloorRatio: 1 / 18, // $45 bottle → $2.50 floor
    priceCeilRatio: 1 / 1.3,
    defaultSort: "LAST_VOLUME_DESC",
    verificationProductId: undefined,
    verifiedAt: "2026-06-20",
    notes:
      "Vacuum-insulated stainless dominates the dropship segment; plastic " +
      "is a different price band entirely. The price ceiling helps keep us " +
      "off plastic listings when comparing against Owala/Stanley/etc.",
  },

  "dog harness": {
    vertical: "dog harness",
    parentFamily: "Home & Garden",
    // 200002241 = Pet Products; 200002253 = Dog Collars & Leashes.
    categoryIds: ["200002241", "200002253"],
    queries: [
      "no pull dog harness adjustable",
      "tactical dog harness vest",
      "dog harness front clip padded",
      "small dog harness no pull",
    ],
    negativeKeywords: [
      "cat harness", "rabbit harness", "horse harness", "human harness",
      "leash only", "collar only", "tag", "name tag",
      "training treat", "poop bag", "litter",
      "carrier", "crate", "kennel", "bed only",
      "shock collar", "bark collar", "training collar",
      "wholesale lot", "carton",
    ],
    priceFloorRatio: 1 / 15, // $45 harness → $3 floor
    priceCeilRatio: 1 / 1.5,
    defaultSort: "LAST_VOLUME_DESC",
    verificationProductId: undefined,
    verifiedAt: "2026-06-20",
    notes:
      "Pet category sees big size-variant divergence. We rely on the dog-" +
      "specific keywords to keep cat/rabbit harnesses out.",
  },

  "kitchen gadget": {
    vertical: "kitchen gadget",
    parentFamily: "Home & Garden",
    // 200001143 = Kitchen Tools & Gadgets (parent leaf — broad on purpose).
    categoryIds: ["200001143"],
    queries: [
      "stainless steel kitchen gadget tool",
      "kitchen utensil gadget multifunction",
      "kitchen gadget set",
      "kitchen tool peeler slicer",
    ],
    negativeKeywords: [
      "knife set", "chef knife only", "blade only", "sharpener",
      "pan only", "pot only", "pressure cooker", "rice cooker", "blender",
      "mixer", "stand mixer", "food processor",
      "apron", "towel", "cloth",
      "cleaner", "cleaning spray", "dish soap",
      "wholesale lot", "carton of", "100 pcs", "bulk", "1000",
      "tiktok", "as seen on", "viral 2026",
    ],
    priceFloorRatio: 1 / 25, // gadget markup spread is huge
    priceCeilRatio: 1 / 1.2,
    defaultSort: "LAST_VOLUME_DESC",
    verificationProductId: undefined,
    verifiedAt: "2026-06-20",
    notes:
      "Kitchen gadgets are the dropship goldmine — a $39 'magical peeler' " +
      "lists for $1.40 on AE. Wide net category; lean on tight price ceiling " +
      "to keep us off bulk pallets.",
  },

  "beauty tool": {
    vertical: "beauty tool",
    parentFamily: "Beauty & Health",
    // 200000503 = Skin Care Tools; 200001005 = Face Massagers.
    categoryIds: ["200000503", "200001005"],
    queries: [
      "facial roller jade massager",
      "gua sha stone face tool",
      "led face mask therapy",
      "microcurrent beauty device",
    ],
    negativeKeywords: [
      "makeup", "lipstick", "eyeshadow", "foundation",
      "serum", "moisturizer", "toner", "essence",
      "cleanser", "wipes", "face wash",
      "hair tool", "hair dryer", "curling iron", "straightener",
      "razor", "shaver", "epilator",
      "replacement head", "replacement battery",
      "wholesale lot", "carton",
      "tiktok", "as seen on", "viral",
    ],
    priceFloorRatio: 1 / 30, // beauty tools have 30× markup all the time
    priceCeilRatio: 1 / 1.2,
    defaultSort: "LAST_VOLUME_DESC",
    verificationProductId: undefined,
    verifiedAt: "2026-06-20",
    notes:
      "Beauty tools (rollers, gua sha, LED masks, microcurrent devices) are " +
      "the highest-margin dropship segment we've seen. 1/30 floor reflects " +
      "the spread.",
  },
};

/* ─── Resolver ───────────────────────────────────────────────────────── */

/**
 * Synonym lookup — maps free-form `productCategory` strings emitted by the
 * verdict step to the canonical vertical key in CATEGORY_MAP.
 *
 * Keep this list tight. Adding too many synonyms turns the resolver into a
 * fuzzy classifier and we lose deterministic routing.
 */
const VERTICAL_SYNONYMS: Array<{ patterns: RegExp[]; vertical: string }> = [
  {
    patterns: [/phone case/i, /mobile case/i, /smartphone case/i, /iphone case/i, /android case/i],
    vertical: "phone cases",
  },
  {
    patterns: [/shower steamer/i, /shower tablet/i, /aroma tablet/i, /aromatherapy shower/i, /shower bomb/i],
    vertical: "shower steamer",
  },
  {
    patterns: [/slipper/i, /slides?$/i, /pillow slide/i, /cloud slide/i, /house shoe/i, /home shoe/i],
    vertical: "slippers",
  },
  {
    patterns: [/necklace/i, /pendant/i, /chain.*neck/i, /choker/i],
    vertical: "necklace",
  },
  {
    patterns: [
      /t-?shirt/i,
      /\bshirt\b/i,
      /hoodie/i,
      /sweatshirt/i,
      /apparel/i,
      /clothing/i,
      /\btee\b/i,
      /pullover/i,
      /sweater/i,
      /jacket/i,
      /pants/i,
      /trousers/i,
      /dress\b/i,
    ],
    vertical: "apparel sizes",
  },
  // ── Sprint 12 Stage 34 synonyms ──────────────────────────────────────────
  {
    // "shoes" — covers loungers, loafers, sneakers, runners. Excluded if it
    // matches the slippers synonyms above (those run first).
    patterns: [
      /\bshoes?\b/i,
      /lounger/i,
      /sneaker/i,
      /trainer/i,
      /loafer/i,
      /runner/i,
      /\bboot\b/i,
    ],
    vertical: "shoes",
  },
  {
    patterns: [
      /water bottle/i,
      /tumbler/i,
      /thermos/i,
      /vacuum flask/i,
      /insulated bottle/i,
      /hydration flask/i,
    ],
    vertical: "water bottle",
  },
  {
    patterns: [
      /dog harness/i,
      /pet harness/i,
      /no-?pull harness/i,
      /dog leash/i,
      /pet vest/i,
      /dog collar/i,
    ],
    vertical: "dog harness",
  },
  {
    patterns: [
      /kitchen gadget/i,
      /kitchen tool/i,
      /kitchen utensil/i,
      /peeler/i,
      /\bgrater\b/i,
      /slicer/i,
      /chopper/i,
      /scraper/i,
    ],
    vertical: "kitchen gadget",
  },
  {
    patterns: [
      /beauty tool/i,
      /facial roller/i,
      /face roller/i,
      /jade roller/i,
      /gua sha/i,
      /led mask/i,
      /microcurrent/i,
      /face massager/i,
      /derma roller/i,
    ],
    vertical: "beauty tool",
  },
];

/**
 * In-memory miss counter. Resets on cold start — purpose is to surface
 * coverage gaps in Vercel function logs, not to persist across deploys.
 * Call `getCategoryMissCounts()` from debug endpoints to inspect.
 */
const _categoryMisses = new Map<string, number>();

/** Returns a snapshot of productCategory strings that had no vocab entry. */
export function getCategoryMissCounts(): Record<string, number> {
  return Object.fromEntries(_categoryMisses);
}

/**
 * Resolve a category vocab entry from a free-form productCategory string.
 * Returns null when no synonym matches — caller should fall back to title-
 * derived keywords + no category filter.
 *
 * Emits a `[category-map]` warning on every miss so production logs surface
 * coverage gaps without any extra instrumentation.
 */
export function resolveCategoryVocab(
  productCategory: string | null | undefined,
): CategoryVocabEntry | null {
  if (!productCategory) return null;
  const input = productCategory.trim();
  if (!input) return null;

  // Direct lookup first (case-insensitive)
  const directKey = input.toLowerCase();
  if (CATEGORY_MAP[directKey]) return CATEGORY_MAP[directKey];

  // Synonym scan
  for (const { patterns, vertical } of VERTICAL_SYNONYMS) {
    if (patterns.some((p) => p.test(input))) {
      const entry = CATEGORY_MAP[vertical];
      if (entry) return entry;
    }
  }

  // Miss — log and track.
  const prev = _categoryMisses.get(input) ?? 0;
  _categoryMisses.set(input, prev + 1);
  console.warn(
    `[category-map] No vocab entry for "${input}" (miss #${prev + 1}). ` +
    `Search will run without category filter, price band, or negative keywords. ` +
    `Add this vertical to CATEGORY_MAP to improve precision. ` +
    `Supported: ${listSupportedVerticals().join(", ")}.`,
  );

  return null;
}

/**
 * Convenience accessor — list all verified vertical keys. Useful for logging
 * and for surfacing coverage gaps when a new dropship vertical appears in
 * production traffic.
 */
export function listSupportedVerticals(): string[] {
  return Object.keys(CATEGORY_MAP);
}

/**
 * Filter candidates by a vertical's negative keywords. Applied AFTER the
 * AliExpress API returns, BEFORE confidence scoring — strips the obvious
 * noise (replacement parts, accessories, wrong-category lookalikes) before
 * we burn Gemini Vision tokens scoring them.
 */
export function filterByNegativeKeywords<T extends { title: string }>(
  candidates: T[],
  negativeKeywords: string[],
): T[] {
  const lowered = negativeKeywords.map((k) => k.toLowerCase());
  return candidates.filter((c) => {
    const lowerTitle = c.title.toLowerCase();
    return !lowered.some((neg) => lowerTitle.includes(neg));
  });
}
