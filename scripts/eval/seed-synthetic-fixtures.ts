/**
 * Seed hand-authored synthetic fixtures for regression coverage.
 *
 *   npx tsx scripts/eval/seed-synthetic-fixtures.ts
 *
 * Every fixture below is fully hand-specified — product content, scrape
 * attributes, AI verdict, candidate pool, and ground-truth labels are all
 * deliberate (this satisfies the "never trust an auto-stubbed truth.json"
 * convention: nothing here is derived from a live scrape).
 *
 * Focus: classes the live corpus under-covers, where regressions hide —
 *   - dropship_subtle : semi-professional stores with no urgency gimmicks
 *   - aliexpress_itself: already-on-supplier pages (search must be skipped)
 *   - legit_brand      : more real brands (false-positive protection)
 *   - not_a_product    : non-PDP pages (search-results, blog, policy)
 */

import { saveFixture } from "@/lib/eval/fixture-store";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type {
  FixtureAiResponse,
  FixtureAliExpress,
  FixtureCategory,
  FixtureRecord,
  FixtureTruth,
} from "@/tests/eval/fixture-types";

/** A hand-authored prediction; the boilerplate fields (reasoning/styleTokens/
 *  materialPriors) are filled with defaults by synthAi so specs stay readable. */
type SynthPrediction =
  | (Partial<DropshipPrediction> &
      Pick<DropshipPrediction, "verdict" | "isLikelyDropship" | "confidence">)
  | null;

type Spec = {
  id: string;
  category: FixtureCategory;
  url: string;
  storeName: string;
  title: string;
  description: string;
  imageUrl: string | null;
  markdown: string;
  /** Raw page HTML — only needed by fixtures exercising the Tier-0
   *  app-footprint signals (they match in attribute position, HTML only). */
  html?: string;
  priceUsd: number | null;
  truth: Omit<FixtureTruth, "url" | "category" | "capturedAt">;
  ai: SynthPrediction;
  aliexpress?: FixtureAliExpress;
};

const synthAi = (prediction: SynthPrediction): FixtureAiResponse => ({
  prediction: prediction
    ? ({
        reasoning: "synthetic fixture",
        styleTokens: [],
        materialPriors: [],
        ...prediction,
      } as DropshipPrediction)
    : null,
  rawResponse: JSON.stringify({ verdict: prediction?.verdict ?? null }),
  model: "synthetic",
  provider: "synthetic",
  error: prediction ? null : "synthetic: no prediction",
});

const SPECS: Spec[] = [
  // ── dropship_subtle: looks professional, no gimmicks, still dropship ──────
  {
    id: "synthetic-subtle-desk-organizer-01",
    category: "dropship_subtle",
    url: "https://theworkspace-co.com/products/bamboo-desk-organizer",
    storeName: "theworkspace-co.com",
    title: "Bamboo Desk Organizer — The Workspace Co.",
    description:
      "Handsome bamboo desk organizer with phone stand and pen slots. Sustainably sourced. Ships in 2-4 weeks.",
    imageUrl: "https://theworkspace-co.com/img/bamboo-organizer.jpg",
    priceUsd: 44,
    markdown:
      "# Bamboo Desk Organizer\n\n**$44.00**\n\nHandsome bamboo desk organizer with phone stand and pen slots. Sustainably sourced.\n\n- Natural bamboo\n- Phone + tablet slot\n- Free shipping worldwide\n\n*Estimated delivery: 2-4 weeks*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [4, 15],
        notes: "Generic bamboo organizer, $4-12 on AliExpress, retailed at $44. Subtle: no urgency timer, clean branding.",
      },
      notes: "Synthetic dropship_subtle. Professional presentation; tell is the 2-4 week ship + generic unbranded product.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.66,
      productCategory: "Desk Organizer",
      aliexpressKeywords: ["bamboo desk organizer phone stand", "wooden desk organizer pen holder"],
      reasoningSignals: [
        "2-4 week delivery window indicates overseas fulfillment",
        "Generic unbranded product with house label applied",
        "Free worldwide shipping on a low-cost bulky item",
      ],
      missingSignals: ["No manufacturer attribution", "No physical business address"],
      redFlags: ["Long overseas shipping", "House-branded generic commodity"],
      estimatedStorePriceUsd: 44,
      estimatedSupplierPriceUsd: 8,
      estimatedMarkupPercent: 450,
    },
    aliexpress: {
      keywords: "bamboo desk organizer phone stand pen holder",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006200001", title: "Bamboo Desk Organizer with Phone Stand Pen Holder Office Storage", priceUsd: 8.42, productUrl: "https://www.aliexpress.com/item/1005006200001.html", imageUrl: "https://ae01.alicdn.com/kf/bamboo-org-1.jpg", orderCount: 6200, sellerRating: 4.8, shippingDays: 15, promotionLink: null },
        { productId: "1005006200002", title: "Wooden Bamboo Desktop Organizer Pen Holder Tablet Slot", priceUsd: 6.9, productUrl: "https://www.aliexpress.com/item/1005006200002.html", imageUrl: "https://ae01.alicdn.com/kf/bamboo-org-2.jpg", orderCount: 3100, sellerRating: 4.7, shippingDays: 20, promotionLink: null },
        { productId: "1005006200003", title: "Multifunctional Bamboo Office Desk Organizer Storage Box", priceUsd: 11.5, productUrl: "https://www.aliexpress.com/item/1005006200003.html", imageUrl: "https://ae01.alicdn.com/kf/bamboo-org-3.jpg", orderCount: 1450, sellerRating: 4.9, shippingDays: 12, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-subtle-pet-hair-remover-01",
    category: "dropship_subtle",
    url: "https://furfree-home.com/products/reusable-pet-hair-remover",
    storeName: "furfree-home.com",
    title: "Reusable Pet Hair Remover Roller | FurFree",
    description:
      "Chemical-free reusable pet hair remover for couches and clothes. Self-cleaning base. 30-day guarantee.",
    imageUrl: "https://furfree-home.com/img/roller.jpg",
    priceUsd: 29.99,
    markdown:
      "# Reusable Pet Hair Remover Roller\n\n**$29.99**\n\nChemical-free reusable pet hair remover for couches, beds and clothes. Self-cleaning base — no sticky refills ever.\n\n- Reusable, no refills\n- Works on all fabrics\n- 30-day money-back guarantee\n\n*Ships within 10-18 business days*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [1, 8],
        notes: "Classic reusable lint/pet-hair roller, ~$2-5 on AliExpress, retailed at $30.",
      },
      notes: "Synthetic dropship_subtle. Viral gadget; moderate markup, no countdown timer.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.72,
      productCategory: "Pet Hair Remover",
      aliexpressKeywords: ["reusable pet hair remover roller", "self cleaning lint roller pet"],
      reasoningSignals: [
        "10-18 business day shipping indicates overseas fulfillment",
        "Well-known viral commodity gadget sold under a house brand",
        "High markup on a sub-$5 item",
      ],
      missingSignals: ["No brand history", "No warehouse info"],
      redFlags: ["Overseas shipping window", "Generic viral gadget"],
      estimatedStorePriceUsd: 29.99,
      estimatedSupplierPriceUsd: 3.5,
      estimatedMarkupPercent: 757,
    },
    aliexpress: {
      keywords: "reusable pet hair remover roller self cleaning",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006210001", title: "Reusable Pet Hair Remover Roller Self-Cleaning Lint Dog Cat Fur", priceUsd: 3.21, productUrl: "https://www.aliexpress.com/item/1005006210001.html", imageUrl: "https://ae01.alicdn.com/kf/roller-1.jpg", orderCount: 22100, sellerRating: 4.8, shippingDays: 14, promotionLink: null },
        { productId: "1005006210002", title: "Self Cleaning Pet Hair Remover Reusable Lint Roller Sofa Bed", priceUsd: 2.55, productUrl: "https://www.aliexpress.com/item/1005006210002.html", imageUrl: "https://ae01.alicdn.com/kf/roller-2.jpg", orderCount: 15400, sellerRating: 4.7, shippingDays: 16, promotionLink: null },
        { productId: "1005006210003", title: "Double Sided Pet Fur Remover Roller Washable Reusable", priceUsd: 4.8, productUrl: "https://www.aliexpress.com/item/1005006210003.html", imageUrl: "https://ae01.alicdn.com/kf/roller-3.jpg", orderCount: 8900, sellerRating: 4.9, shippingDays: 13, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-subtle-posture-cushion-01",
    category: "dropship_subtle",
    url: "https://sitwell-ergonomics.com/products/orthopedic-seat-cushion",
    storeName: "sitwell-ergonomics.com",
    title: "Orthopedic Memory Foam Seat Cushion | SitWell",
    description:
      "Ergonomic memory foam seat cushion for lower back and tailbone relief. Non-slip base. Designed for office chairs and cars.",
    imageUrl: "https://sitwell-ergonomics.com/img/cushion.jpg",
    priceUsd: 59,
    markdown:
      "# Orthopedic Memory Foam Seat Cushion\n\n**$59.00**\n\nErgonomic memory foam seat cushion for lower back and tailbone relief. Non-slip base.\n\n- Premium memory foam\n- Coccyx cutout design\n- Machine-washable cover\n\n*Delivery: 2-3 weeks*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [5, 20],
        notes: "Generic coccyx memory-foam cushion, ~$6-16 on AliExpress, retailed at $59.",
      },
      notes: "Synthetic dropship_subtle. 'Ergonomics' branding veneer over a commodity cushion.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.63,
      productCategory: "Seat Cushion",
      aliexpressKeywords: ["orthopedic memory foam seat cushion coccyx", "office chair car seat cushion"],
      reasoningSignals: [
        "2-3 week delivery indicates dropship fulfillment",
        "Generic coccyx-cutout cushion under a house brand",
        "Markup consistent with dropship economics",
      ],
      missingSignals: ["No brand track record", "No company registration"],
      redFlags: ["Long shipping window", "Commodity product, house brand"],
      estimatedStorePriceUsd: 59,
      estimatedSupplierPriceUsd: 11,
      estimatedMarkupPercent: 436,
    },
    aliexpress: {
      keywords: "orthopedic memory foam seat cushion coccyx office chair",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006220001", title: "Memory Foam Seat Cushion Orthopedic Coccyx Office Chair Car Pad", priceUsd: 11.9, productUrl: "https://www.aliexpress.com/item/1005006220001.html", imageUrl: "https://ae01.alicdn.com/kf/cushion-1.jpg", orderCount: 9800, sellerRating: 4.8, shippingDays: 15, promotionLink: null },
        { productId: "1005006220002", title: "Ergonomic Coccyx Cushion Memory Foam Tailbone Back Pain Relief", priceUsd: 8.4, productUrl: "https://www.aliexpress.com/item/1005006220002.html", imageUrl: "https://ae01.alicdn.com/kf/cushion-2.jpg", orderCount: 5200, sellerRating: 4.7, shippingDays: 18, promotionLink: null },
        { productId: "1005006220003", title: "Non-Slip Memory Foam Office Chair Seat Cushion Washable Cover", priceUsd: 15.6, productUrl: "https://www.aliexpress.com/item/1005006220003.html", imageUrl: "https://ae01.alicdn.com/kf/cushion-3.jpg", orderCount: 2700, sellerRating: 4.9, shippingDays: 12, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-subtle-he-neck-massager-01",
    category: "dropship_subtle",
    url: "https://relaxpro.co.il/products/neck-massager",
    storeName: "relaxpro.co.il",
    title: "מכשיר עיסוי צוואר חשמלי | RelaxPro",
    description:
      "מכשיר עיסוי צוואר חשמלי נטען עם חימום. שלוש עוצמות. משלוח תוך 2-3 שבועות.",
    imageUrl: "https://relaxpro.co.il/img/neck.jpg",
    priceUsd: 39.9,
    markdown:
      "# מכשיר עיסוי צוואר חשמלי\n\n**₪149.00**\n\nמכשיר עיסוי צוואר נטען עם חימום ושלוש עוצמות עיסוי.\n\n- נטען ב-USB\n- פונקציית חימום\n- משלוח חינם\n\n*אספקה: 2-3 שבועות*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [6, 20],
        notes: "Generic electric neck massager, ~$7-18 on AliExpress, retailed ₪149 (~$40). Hebrew store.",
      },
      notes: "Synthetic dropship_subtle, Hebrew (non-Latin title → tests translation keyword path).",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.68,
      productCategory: "Neck Massager",
      aliexpressKeywords: ["electric neck massager heating rechargeable", "cervical neck massager usb"],
      reasoningSignals: [
        "2-3 week delivery window indicates overseas fulfillment",
        "Generic rechargeable massager under a house brand",
        "Non-Latin storefront reselling a commodity gadget",
      ],
      missingSignals: ["No brand history", "No importer details"],
      redFlags: ["Long overseas shipping", "Commodity electronic gadget"],
      estimatedStorePriceUsd: 39.9,
      estimatedSupplierPriceUsd: 12,
      estimatedMarkupPercent: 232,
    },
    aliexpress: {
      keywords: "electric neck massager heating rechargeable cervical",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006230001", title: "Electric Neck Massager Heating Rechargeable Cervical Pain Relief", priceUsd: 12.3, productUrl: "https://www.aliexpress.com/item/1005006230001.html", imageUrl: "https://ae01.alicdn.com/kf/neck-1.jpg", orderCount: 11200, sellerRating: 4.8, shippingDays: 16, promotionLink: null },
        { productId: "1005006230002", title: "USB Rechargeable Neck Massager 3 Modes Heat Cervical Massage", priceUsd: 9.75, productUrl: "https://www.aliexpress.com/item/1005006230002.html", imageUrl: "https://ae01.alicdn.com/kf/neck-2.jpg", orderCount: 6400, sellerRating: 4.7, shippingDays: 19, promotionLink: null },
        { productId: "1005006230003", title: "Portable Electric Cervical Neck Massage Device Heating Function", priceUsd: 16.9, productUrl: "https://www.aliexpress.com/item/1005006230003.html", imageUrl: "https://ae01.alicdn.com/kf/neck-3.jpg", orderCount: 3300, sellerRating: 4.9, shippingDays: 13, promotionLink: null },
      ],
    },
  },

  // ── hard negatives: adversarial candidate pools (precision guards) ───────
  // These verify the SCORER rejects noise and still ranks the correct item
  // first — the "no wrong supplier" guarantee, tested at the scoring level.
  {
    id: "synthetic-hardneg-price-noise-01",
    category: "dropship_obvious",
    url: "https://gadgetdeal-store.com/products/mini-humidifier",
    storeName: "gadgetdeal-store.com",
    title: "Mini Portable USB Humidifier | GadgetDeal",
    description:
      "Mini portable USB desktop humidifier with LED night light. 300ml. Ships 2-3 weeks.",
    imageUrl: "https://gadgetdeal-store.com/img/humidifier.jpg",
    priceUsd: 34.99,
    markdown:
      "# Mini Portable USB Humidifier\n\n**$34.99**\n\nMini portable USB desktop humidifier with LED night light, 300ml tank.\n\n*Ships 2-3 weeks*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [3, 12],
        notes: "Pool contains the correct $5 item PLUS a price-parse-error ($9M) and an over-8x ($399) decoy. Scorer must reject the noise and pick the correct cheap item.",
      },
      notes: "Synthetic hard-negative (price noise). Guards MAX_PLAUSIBLE_SUPPLIER_PRICE + MAX_SUPPLIER_OVER_STORE_RATIO.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.8,
      productCategory: "USB Humidifier",
      aliexpressKeywords: ["mini usb humidifier led", "portable desktop humidifier 300ml"],
      reasoningSignals: [
        "2-3 week shipping indicates overseas fulfillment",
        "Generic USB gadget under a house brand",
        "High markup on a sub-$6 commodity",
      ],
      missingSignals: ["No brand history"],
      redFlags: ["Long overseas shipping", "Commodity gadget"],
      estimatedStorePriceUsd: 34.99,
      estimatedSupplierPriceUsd: 5,
      estimatedMarkupPercent: 600,
    },
    aliexpress: {
      keywords: "mini usb humidifier led portable desktop 300ml",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006300001", title: "Mini USB Humidifier LED Night Light Portable Desktop 300ml Air", priceUsd: 5.2, productUrl: "https://www.aliexpress.com/item/1005006300001.html", imageUrl: "https://ae01.alicdn.com/kf/hum-1.jpg", orderCount: 18400, sellerRating: 4.8, shippingDays: 15, promotionLink: null },
        { productId: "1005006300002", title: "Industrial Ultrasonic Humidifier Commercial Machine 20L Warehouse", priceUsd: 9184233.0, productUrl: "https://www.aliexpress.com/item/1005006300002.html", imageUrl: "https://ae01.alicdn.com/kf/hum-2.jpg", orderCount: 12, sellerRating: 4.2, shippingDays: 30, promotionLink: null },
        { productId: "1005006300003", title: "Mini Humidifier Portable Aroma Diffuser Deluxe Bundle Gift Box", priceUsd: 399.0, productUrl: "https://www.aliexpress.com/item/1005006300003.html", imageUrl: "https://ae01.alicdn.com/kf/hum-3.jpg", orderCount: 40, sellerRating: 4.9, shippingDays: 12, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-hardneg-title-distractor-01",
    category: "dropship_obvious",
    url: "https://trendypicks-shop.com/products/magnetic-phone-holder",
    storeName: "trendypicks-shop.com",
    title: "Magnetic Car Phone Holder Mount | TrendyPicks",
    description:
      "Strong magnetic car phone holder, air vent mount, 360° rotation. Fits all phones. Ships 10-20 days.",
    imageUrl: "https://trendypicks-shop.com/img/mount.jpg",
    priceUsd: 24.99,
    markdown:
      "# Magnetic Car Phone Holder Mount\n\n**$24.99**\n\nStrong magnetic car phone holder, air vent mount, 360° rotation.\n\n*Ships 10-20 days*",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.5,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [1, 8],
        notes: "Pool contains the correct magnetic car mount PLUS a high-volume unrelated distractor (phone charger). Text overlap must rank the correct mount first.",
      },
      notes: "Synthetic hard-negative (title distractor). Guards against a high-order-count unrelated item winning on trust alone.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.78,
      productCategory: "Car Phone Holder",
      aliexpressKeywords: ["magnetic car phone holder vent mount", "360 car phone mount magnetic"],
      reasoningSignals: [
        "10-20 day shipping indicates overseas fulfillment",
        "Generic car accessory under a house brand",
        "High markup on a sub-$4 commodity",
      ],
      missingSignals: ["No brand history"],
      redFlags: ["Long overseas shipping", "Commodity accessory"],
      estimatedStorePriceUsd: 24.99,
      estimatedSupplierPriceUsd: 3,
      estimatedMarkupPercent: 733,
    },
    aliexpress: {
      keywords: "magnetic car phone holder vent mount 360",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006310001", title: "Magnetic Car Phone Holder Air Vent Mount 360 Rotation Universal", priceUsd: 3.4, productUrl: "https://www.aliexpress.com/item/1005006310001.html", imageUrl: "https://ae01.alicdn.com/kf/mount-1.jpg", orderCount: 9200, sellerRating: 4.7, shippingDays: 16, promotionLink: null },
        { productId: "1005006310002", title: "65W USB C Fast Charger GaN Wall Adapter Phone Laptop", priceUsd: 8.9, productUrl: "https://www.aliexpress.com/item/1005006310002.html", imageUrl: "https://ae01.alicdn.com/kf/chg-1.jpg", orderCount: 84000, sellerRating: 4.9, shippingDays: 14, promotionLink: null },
        { productId: "1005006310003", title: "Universal Phone Ring Holder Finger Grip Stand Kickstand", priceUsd: 1.2, productUrl: "https://www.aliexpress.com/item/1005006310003.html", imageUrl: "https://ae01.alicdn.com/kf/ring-1.jpg", orderCount: 51000, sellerRating: 4.8, shippingDays: 18, promotionLink: null },
      ],
    },
  },

  // ── aliexpress_itself: already on a supplier marketplace → skip search ────
  {
    id: "synthetic-supplier-aliexpress-earbuds-01",
    category: "aliexpress_itself",
    url: "https://www.aliexpress.com/item/1005005999001.html",
    storeName: "AliExpress",
    title: "TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling",
    description:
      "TWS wireless earbuds with Bluetooth 5.3, ENC noise cancelling, 30h battery. Direct from factory store.",
    imageUrl: "https://ae01.alicdn.com/kf/earbuds-listing.jpg",
    priceUsd: 12.99,
    markdown:
      "# TWS Wireless Earbuds Bluetooth 5.3\n\n**US $12.99**\n\n4.8 ★ | 12,000+ sold\n\nTWS wireless earbuds, Bluetooth 5.3, ENC noise cancelling, 30h battery.\n\nStore: TopAudio Official Store",
    truth: {
      expectedVerdict: "legit",
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Already an AliExpress listing — the pipeline must NOT run a supplier search on top of it.",
      },
      notes: "Synthetic aliexpress_itself. detectProductSource → supplier_marketplace → rule-based 'legit', search skipped.",
    },
    ai: null, // supplier-marketplace path is rule-based; no verifier call
  },
  {
    id: "synthetic-supplier-aliexpress-phonecase-01",
    category: "aliexpress_itself",
    url: "https://www.aliexpress.com/item/1005005999002.html",
    storeName: "AliExpress",
    title: "Shockproof Clear Phone Case for iPhone 15 Pro Max",
    description:
      "Transparent shockproof phone case with camera protection for iPhone 15 series. Factory direct.",
    imageUrl: "https://ae01.alicdn.com/kf/case-listing.jpg",
    priceUsd: 2.35,
    markdown:
      "# Shockproof Clear Phone Case iPhone 15 Pro Max\n\n**US $2.35**\n\n4.9 ★ | 40,000+ sold\n\nTransparent shockproof case with camera lens protection.\n\nStore: CaseHouse Official Store",
    truth: {
      expectedVerdict: "legit",
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Already an AliExpress listing — no supplier search should run.",
      },
      notes: "Synthetic aliexpress_itself. Confirms supplier-marketplace short-circuit.",
    },
    ai: null,
  },

  // ── legit_brand: false-positive protection ───────────────────────────────
  {
    id: "synthetic-legit-allbirds-runner-01",
    category: "legit_brand",
    url: "https://www.allbirds.com/products/mens-wool-runners",
    storeName: "allbirds.com",
    title: "Men's Wool Runners — Natural Grey | Allbirds",
    description:
      "Allbirds Wool Runners made with ZQ Merino wool. Machine washable. Carbon footprint labeled. Ships in 3-5 business days from US warehouses.",
    imageUrl: "https://cdn.allbirds.com/image/wool-runner-grey.jpg",
    priceUsd: 98,
    markdown:
      "# Men's Wool Runners — Natural Grey\n\n**$98.00**\n\nOur iconic Wool Runners, made with ZQ Merino wool from certified farms.\n\n- Carbon footprint: 7.1 kg CO2e\n- Machine washable\n- B-Corp certified\n- Free 30-day returns · Ships 3-5 business days\n\nAllbirds · San Francisco, CA",
    truth: {
      expectedVerdict: "legit",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Established DTC brand with domestic fulfillment + sustainability credentials. Must NOT be flagged dropship.",
      },
      notes: "Synthetic legit_brand. FP protection: real brand, real warehouse, no dropship tells.",
    },
    ai: {
      verdict: "legit",
      isLikelyDropship: false,
      confidence: 0.9,
      productCategory: "Footwear",
      aliexpressKeywords: [],
      reasoningSignals: [
        "Established brand with verifiable identity (B-Corp, HQ address)",
        "Domestic 3-5 business day fulfillment",
        "Product-specific sustainability data (carbon footprint) not seen on dropship stores",
      ],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: 98,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },
  {
    id: "synthetic-legit-anker-charger-01",
    category: "legit_brand",
    url: "https://www.anker.com/products/a2637-nano-ii-65w",
    storeName: "anker.com",
    title: "Anker Nano II 65W USB-C Charger (711)",
    description:
      "Anker Nano II 65W GaN II fast charger. 2-year warranty. Model A2637. Ships from regional Anker warehouses in 2-4 days.",
    imageUrl: "https://cdn.anker.com/nano-ii-65w.jpg",
    priceUsd: 55.99,
    markdown:
      "# Anker Nano II 65W USB-C Charger\n\n**$55.99**\n\nGaN II tech in a pocket-size body. Model A2637.\n\n- 2-year warranty\n- ActiveShield temperature monitoring\n- Ships 2-4 business days\n\nAnker · Support: support@anker.com",
    truth: {
      expectedVerdict: "legit",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Established electronics brand with model number + warranty. Not dropship.",
      },
      notes: "Synthetic legit_brand. FP protection for a branded electronics product.",
    },
    ai: {
      verdict: "legit",
      isLikelyDropship: false,
      confidence: 0.88,
      productCategory: "Phone Charger",
      aliexpressKeywords: [],
      reasoningSignals: [
        "Named brand with specific model number (A2637)",
        "2-year warranty + support contact",
        "Regional fast fulfillment",
      ],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: 55.99,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },
  {
    id: "synthetic-legit-he-castro-shirt-01",
    category: "legit_brand",
    url: "https://www.castro.com/products/classic-oxford-shirt",
    storeName: "castro.com",
    title: "חולצת אוקספורד קלאסית | Castro",
    description:
      "חולצת אוקספורד כותנה 100%, גזרה קלאסית. מותג אופנה ישראלי מוכר עם חנויות פיזיות. איסוף מהחנות או משלוח תוך 3-5 ימים.",
    imageUrl: "https://castro.com/img/oxford-shirt.jpg",
    priceUsd: 34,
    markdown:
      "# חולצת אוקספורד קלאסית\n\n**₪129.90**\n\nחולצת אוקספורד כותנה 100%, גזרה קלאסית.\n\n- כותנה 100%\n- איסוף מהחנות\n- החזרות תוך 30 יום ברשת הסניפים\n\nCastro · רשת אופנה",
    truth: {
      expectedVerdict: "legit",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Established Israeli fashion chain with physical stores + in-store pickup. Not dropship despite Hebrew.",
      },
      notes: "Synthetic legit_brand, Hebrew. FP protection: non-Latin storefront that is a REAL brand (guards against 'Hebrew store == dropship' bias).",
    },
    ai: {
      verdict: "legit",
      isLikelyDropship: false,
      confidence: 0.85,
      productCategory: "Apparel",
      aliexpressKeywords: [],
      reasoningSignals: [
        "Established retail chain with physical store network",
        "In-store pickup + returns across branches",
        "Recognized national brand",
      ],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: 34,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },

  // ── not_a_product: non-PDP pages ─────────────────────────────────────────
  {
    id: "synthetic-not-product-search-results-01",
    category: "not_a_product",
    url: "https://shopmart.example/search?q=headphones",
    storeName: "shopmart.example",
    title: "Search results for \"headphones\"",
    description: "Showing 248 results for headphones. Filter by price, brand, rating.",
    imageUrl: null,
    markdown:
      "# Search results for \"headphones\"\n\nShowing 1-24 of 248 results\n\n- Sort by: Relevance\n- Filter: Price / Brand / Rating\n\n[Headphone A] [Headphone B] [Headphone C] …",
    priceUsd: null,
    truth: {
      expectedVerdict: "not_a_product",
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Search-results listing page, not a single product — no supplier search.",
      },
      notes: "Synthetic not_a_product. Multi-item results page with no single PDP.",
    },
    ai: {
      verdict: "not_a_product",
      isLikelyDropship: false,
      confidence: 0.9,
      productCategory: "",
      aliexpressKeywords: [],
      reasoningSignals: ["Page is a search-results listing, not a single product detail page"],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },
  {
    id: "synthetic-not-product-blog-article-01",
    category: "not_a_product",
    url: "https://gadgetblog.example/best-kitchen-gadgets-2026",
    storeName: "gadgetblog.example",
    title: "The 10 Best Kitchen Gadgets of 2026",
    description: "Our editors round up the best kitchen gadgets you can buy this year, from air fryers to smart scales.",
    imageUrl: "https://gadgetblog.example/img/hero.jpg",
    markdown:
      "# The 10 Best Kitchen Gadgets of 2026\n\nBy the Editorial Team · 12 min read\n\nWe tested dozens of gadgets this year. Here are our top picks...\n\n## 1. Air Fryer\n## 2. Smart Scale\n## 3. Immersion Blender\n\n_This article may contain affiliate links._",
    priceUsd: null,
    truth: {
      expectedVerdict: "not_a_product",
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Editorial listicle, not a product page — no supplier search.",
      },
      notes: "Synthetic not_a_product. Blog article with affiliate links but no single PDP.",
    },
    ai: {
      verdict: "not_a_product",
      isLikelyDropship: false,
      confidence: 0.88,
      productCategory: "",
      aliexpressKeywords: [],
      reasoningSignals: ["Page is an editorial article/listicle, not a product detail page"],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },

  // ── tier0: fixtures exercising the deterministic fingerprint gate ─────────
  // Two MUST fire (app footprint / shipping combo) and two MUST stay silent
  // (prose mention of app names / single weak shipping signal). The eval's
  // Tier-0 report fails the run if either negative fires.
  {
    id: "synthetic-tier0-app-footprint-01",
    category: "dropship_obvious",
    url: "https://lumina-glow.shop/products/galaxy-star-projector",
    storeName: "lumina-glow.shop",
    title: "Galaxy Star Projector — Lumina Glow",
    description:
      "Transform any room into a galaxy. LED star projector with nebula cloud effects, remote control and built-in timer.",
    imageUrl: "https://lumina-glow.shop/img/galaxy-projector.jpg",
    priceUsd: 39.99,
    markdown:
      "# Galaxy Star Projector\n\n**$39.99** ~~$79.99~~ 50% off today only!\n\nTransform any room into a galaxy. LED star projector with nebula cloud effects.\n\n- Free worldwide shipping\n- Remote control + timer\n- Not sold in stores",
    html:
      '<html><head><meta name="generator" content="Shopify"><script src="https://cdn.shopify.com/extensions/dsers-fulfillment/assets/app.js" defer></script></head><body><h1>Galaxy Star Projector</h1><p>Free worldwide shipping. 50% off today only!</p></body></html>',
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [4, 15],
        notes: "Classic galaxy projector, $6-12 on AliExpress, retailed at $40.",
      },
      notes:
        "Synthetic tier0 positive: DSers fulfillment-app script tag in HTML + template copy. Tier-0 rule A must fire (app footprint + other signal).",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.86,
      productCategory: "Galaxy Star Projector",
      aliexpressKeywords: ["galaxy star projector", "led nebula night light projector"],
      reasoningSignals: [
        "DSers dropship fulfillment app script present in page source",
        "Free worldwide shipping + 'today only' urgency template copy",
        "Well-known viral dropship gadget category",
      ],
      missingSignals: [],
      redFlags: ["Fulfillment app footprint", "Urgency template copy"],
      estimatedStorePriceUsd: 39.99,
      estimatedSupplierPriceUsd: 8,
      estimatedMarkupPercent: 400,
    },
    aliexpress: {
      keywords: "galaxy star projector led nebula night light",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006300001", title: "Galaxy Star Projector LED Nebula Night Light Remote Control Timer", priceUsd: 8.9, productUrl: "https://www.aliexpress.com/item/1005006300001.html", imageUrl: "https://ae01.alicdn.com/kf/galaxy-1.jpg", orderCount: 18700, sellerRating: 4.8, shippingDays: 14, promotionLink: null },
        { productId: "1005006300002", title: "LED Star Galaxy Projector Nebula Cloud Night Light Bedroom", priceUsd: 6.75, productUrl: "https://www.aliexpress.com/item/1005006300002.html", imageUrl: "https://ae01.alicdn.com/kf/galaxy-2.jpg", orderCount: 9400, sellerRating: 4.7, shippingDays: 17, promotionLink: null },
        { productId: "1005006300003", title: "Starry Sky Galaxy Projector Light USB Nebula Lamp Remote", priceUsd: 11.2, productUrl: "https://www.aliexpress.com/item/1005006300003.html", imageUrl: "https://ae01.alicdn.com/kf/galaxy-3.jpg", orderCount: 5300, sellerRating: 4.9, shippingDays: 12, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-tier0-shipping-combo-01",
    category: "dropship_obvious",
    url: "https://alignpro-wellness.com/products/posture-corrector-back-brace",
    storeName: "alignpro-wellness.com",
    title: "AlignPro Posture Corrector Back Brace",
    description:
      "Adjustable posture corrector back brace for men and women. Relieves back and shoulder pain. Breathable and discreet under clothes.",
    imageUrl: "https://alignpro-wellness.com/img/posture-brace.jpg",
    priceUsd: 34.95,
    markdown:
      "# AlignPro Posture Corrector Back Brace\n\n**$34.95**\n\nAdjustable posture corrector for men and women. Relieves back and shoulder pain.\n\nShipping: ships from our overseas warehouse. Please allow 10-20 business days for delivery. Tracking information may take up to 7 days to update.",
    truth: {
      expectedVerdict: "dropship",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: true,
        expectedPriceUsdBand: [3, 12],
        notes: "Generic posture corrector, $4-9 on AliExpress, retailed at $35.",
      },
      notes:
        "Synthetic tier0 positive: overseas warehouse + 10-20 day window + tracking disclaimer = 3 shipping-policy signals. Tier-0 rule C must fire.",
    },
    ai: {
      verdict: "dropship",
      isLikelyDropship: true,
      confidence: 0.82,
      productCategory: "Posture Corrector",
      aliexpressKeywords: ["posture corrector back brace", "adjustable back posture support"],
      reasoningSignals: [
        "Ships from overseas warehouse with 10-20 business day window",
        "Tracking-delay disclaimer typical of AliExpress fulfillment",
        "Generic commodity health gadget under house brand",
      ],
      missingSignals: [],
      redFlags: ["Overseas fulfillment disclosure", "Long delivery window"],
      estimatedStorePriceUsd: 34.95,
      estimatedSupplierPriceUsd: 6,
      estimatedMarkupPercent: 483,
    },
    aliexpress: {
      keywords: "posture corrector back brace adjustable",
      provider: "aliexpress_api",
      candidates: [
        { productId: "1005006310001", title: "Adjustable Posture Corrector Back Brace Shoulder Support Men Women", priceUsd: 5.6, productUrl: "https://www.aliexpress.com/item/1005006310001.html", imageUrl: "https://ae01.alicdn.com/kf/posture-1.jpg", orderCount: 25600, sellerRating: 4.7, shippingDays: 15, promotionLink: null },
        { productId: "1005006310002", title: "Back Posture Corrector Brace Adjustable Support Belt Pain Relief", priceUsd: 4.3, productUrl: "https://www.aliexpress.com/item/1005006310002.html", imageUrl: "https://ae01.alicdn.com/kf/posture-2.jpg", orderCount: 14100, sellerRating: 4.8, shippingDays: 18, promotionLink: null },
        { productId: "1005006310003", title: "Breathable Posture Corrector Upper Back Brace Clavicle Support", priceUsd: 8.15, productUrl: "https://www.aliexpress.com/item/1005006310003.html", imageUrl: "https://ae01.alicdn.com/kf/posture-3.jpg", orderCount: 7800, sellerRating: 4.9, shippingDays: 13, promotionLink: null },
      ],
    },
  },
  {
    id: "synthetic-tier0-negative-blog-01",
    category: "not_a_product",
    url: "https://ecommerce-insider.net/blog/best-dropshipping-apps-2026",
    storeName: "ecommerce-insider.net",
    title: "The 7 Best Dropshipping Apps for Shopify in 2026",
    description:
      "We compared DSers, Zendrop, Spocket, AutoDS and EPROLO on pricing, supplier quality and automation to find the best dropshipping app for your store.",
    imageUrl: "https://ecommerce-insider.net/img/apps-cover.jpg",
    priceUsd: null,
    markdown:
      "# The 7 Best Dropshipping Apps for Shopify in 2026\n\nDSers is the most popular Oberlo replacement, while Zendrop and Spocket focus on faster US fulfillment. AutoDS and EPROLO round out the automation-heavy tier. Here's how they compare on pricing and supplier quality.",
    html:
      '<html><body><article><h1>The 7 Best Dropshipping Apps for Shopify in 2026</h1><p>DSers is the most popular Oberlo replacement, while Zendrop and Spocket focus on faster US fulfillment. AutoDS and EPROLO round out the automation-heavy tier.</p></article></body></html>',
    truth: {
      expectedVerdict: "not_a_product",
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Editorial article about dropshipping apps — no supplier search.",
      },
      notes:
        "Synthetic tier0 NEGATIVE: app names appear in prose (markdown + HTML text), never in attribute position. Tier-0 MUST NOT fire — a fire here is a regression.",
    },
    ai: {
      verdict: "not_a_product",
      isLikelyDropship: false,
      confidence: 0.9,
      productCategory: "",
      aliexpressKeywords: [],
      reasoningSignals: ["Editorial listicle about dropshipping tools, not a product page"],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: null,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },
  {
    id: "synthetic-tier0-negative-legit-shipping-01",
    category: "legit_brand",
    url: "https://atlasfootwear.com/products/trail-runner-2",
    storeName: "atlasfootwear.com",
    title: "Trail Runner 2 — Atlas Footwear",
    description:
      "Our flagship trail running shoe, redesigned. Vibram outsole, recycled knit upper, made in our Portugal factory. Free returns for 60 days.",
    imageUrl: "https://atlasfootwear.com/img/trail-runner-2.jpg",
    priceUsd: 129,
    markdown:
      "# Trail Runner 2\n\n**$129.00**\n\nOur flagship trail running shoe, redesigned. Vibram outsole, recycled knit upper, made in our Portugal factory.\n\nShipping: domestic orders arrive in 2-4 days. International orders: please allow 7-10 business days for delivery.",
    truth: {
      expectedVerdict: "legit",
      confidenceMin: 0.6,
      expectedSupplier: {
        shouldFindMatch: false,
        notes: "Established brand with own factory — no supplier match expected.",
      },
      notes:
        "Synthetic tier0 NEGATIVE: exactly one shipping-policy signal (7-10 day international window) and zero template signals. Tier-0 MUST NOT fire on a single signal.",
    },
    ai: {
      verdict: "legit",
      isLikelyDropship: false,
      confidence: 0.85,
      productCategory: "Trail Running Shoe",
      aliexpressKeywords: [],
      reasoningSignals: [
        "Named factory and manufacturing origin (Portugal)",
        "Branded flagship product line with model iteration",
        "Domestic 2-4 day shipping with standard international window",
      ],
      missingSignals: [],
      redFlags: [],
      estimatedStorePriceUsd: 129,
      estimatedSupplierPriceUsd: null,
      estimatedMarkupPercent: null,
    },
  },
];

function toRecord(spec: Spec): Omit<FixtureRecord, "id"> {
  const truth: FixtureTruth = {
    url: spec.url,
    category: spec.category,
    capturedAt: new Date().toISOString().slice(0, 10),
    ...spec.truth,
  };
  return {
    truth,
    scrape: {
      raw: {
        provider: "crawlbase",
        markdown: spec.markdown,
        ...(spec.html ? { html: spec.html } : {}),
        metadata: {
          title: spec.title,
          description: spec.description,
          ogImage: spec.imageUrl ?? undefined,
          sourceUrl: spec.url,
        },
      },
      attributes: {
        title: spec.title,
        description: spec.description,
        mainImageUrl: spec.imageUrl,
        sourceUrl: spec.url,
        provider: "crawlbase",
      },
      detectedStorePriceUsd: spec.priceUsd,
      storeName: spec.storeName,
    },
    aiResponse: synthAi(spec.ai),
    aliexpress: spec.aliexpress,
  } as unknown as Omit<FixtureRecord, "id">;
}

function main(): void {
  // --only <substr> re-seeds a subset without touching (and re-dating)
  // every other synthetic fixture on disk.
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : undefined;

  let written = 0;
  for (const spec of SPECS) {
    if (only && !spec.id.includes(only)) continue;
    saveFixture(spec.id, toRecord(spec));
    console.log(`  ✓ ${spec.id} [${spec.category}]`);
    written += 1;
  }
  console.log(`\nSeeded ${written} synthetic fixtures.`);
}

main();
