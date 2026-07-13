export interface StoreProduct {
  title: string;
  /** English translation when the original title was non-Latin script. */
  translatedTitle?: string;
  priceUsd: number;
  imageUrl: string;
  storeName: string;
}

export interface SupplierProduct {
  title: string;
  priceUsd: number;
  imageUrl: string;
  orderCount: number;
  sellerRating: number;
  shippingDays: number;
  affiliateUrl: string;
  /** Pre-selected variant label, e.g. "Black · 256 GB · US Warehouse". */
  variantLabel?: string;
  /** Total cost (variant price + shipping) when shipping cost is known. */
  totalCostUsd?: number;
  shippingCostUsd?: number;
  warehouseCountry?: string | null;
  /** True when listing has variants but no SKU matched the source variant. */
  variantWarning?: boolean;
}

export type SupplierMatchQuality = "high" | "medium" | "low" | "none";

export interface ProductComparisonResult {
  originalUrl: string;
  /** Persisted ScannedProduct.id — drives /scan/[id] permalink + click tracking. */
  scanId?: string;
  cache: "HIT" | "MISS";
  storeProduct: StoreProduct;
  supplierProduct: SupplierProduct;
  savingsUsd: number;
  savingsPercent: number;
  matchConfidence?: number;
  matchQuality?: SupplierMatchQuality;
  matchReasons?: string[];
  imageMatchScore?: number;
  imageMatchSameFunction?: boolean;
  imageMatchReasoning?: string;
  /** True when no confident match was found — link is shown as "similar product" not exact match. */
  bestEffortOnly?: boolean;
  /** Supplier network the match came from. Absent = aliexpress. */
  supplierNetwork?: "aliexpress" | "ebay" | "amazon" | "temu_aggregator";
  /** True when served from the permanent VerifiedProductMap (Gold Path). */
  verified?: boolean;
  /** How the verification was established. Present only when `verified`. */
  verifiedSource?: "user_feedback" | "auto_high_confidence";
}

export interface ScanHistoryItem {
  id: string;
  originalUrl: string;
  productTitle: string;
  storeName: string;
  storePriceUsd: number;
  supplierPriceUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  scannedAt: string;
}

export interface DashboardAnalytics {
  totalScans: number;
  activeAlerts: number;
  cumulativeSavingsUsd: number;
}

const MOCK_SUPPLIER: SupplierProduct = {
  title: "Wireless ANC Earbuds Pro — Original Factory",
  priceUsd: 8.5,
  imageUrl: "https://placehold.co/480x480/059669/ffffff/png?text=AliExpress",
  orderCount: 12400,
  sellerRating: 4.9,
  shippingDays: 12,
  affiliateUrl: "https://www.aliexpress.com/item/mock-product.html",
};

const MOCK_STORE: StoreProduct = {
  title: "Premium Noise-Cancelling Wireless Earbuds",
  priceUsd: 45.0,
  imageUrl: "https://placehold.co/480x480/dc2626/ffffff/png?text=Dropship+Store",
  storeName: "TrendVault Store",
};

export function buildMockComparison(url: string): ProductComparisonResult {
  const savingsUsd = MOCK_STORE.priceUsd - MOCK_SUPPLIER.priceUsd;
  const savingsPercent = Math.round((savingsUsd / MOCK_STORE.priceUsd) * 100);

  return {
    originalUrl: url,
    cache: "MISS",
    storeProduct: MOCK_STORE,
    supplierProduct: MOCK_SUPPLIER,
    savingsUsd,
    savingsPercent,
  };
}

export const MOCK_SCAN_HISTORY: ScanHistoryItem[] = [
  {
    id: "scan-001",
    originalUrl: "https://trendvault.example/products/anc-earbuds",
    productTitle: "Premium Noise-Cancelling Wireless Earbuds",
    storeName: "TrendVault Store",
    storePriceUsd: 45.0,
    supplierPriceUsd: 8.5,
    savingsUsd: 36.5,
    savingsPercent: 81,
    scannedAt: "2026-06-11T14:22:00.000Z",
  },
  {
    id: "scan-002",
    originalUrl: "https://luxehome.example/products/led-strip",
    productTitle: "Smart RGB LED Strip Kit 10m",
    storeName: "LuxeHome Decor",
    storePriceUsd: 39.99,
    supplierPriceUsd: 6.2,
    savingsUsd: 33.79,
    savingsPercent: 84,
    scannedAt: "2026-06-10T09:15:00.000Z",
  },
  {
    id: "scan-003",
    originalUrl: "https://fitgear.example/products/posture-corrector",
    productTitle: "Adjustable Posture Corrector Brace",
    storeName: "FitGear Pro",
    storePriceUsd: 29.95,
    supplierPriceUsd: 4.8,
    savingsUsd: 25.15,
    savingsPercent: 84,
    scannedAt: "2026-06-08T18:40:00.000Z",
  },
  {
    id: "scan-004",
    originalUrl: "https://petpal.example/products/auto-feeder",
    productTitle: "Automatic Pet Feeder 4L",
    storeName: "PetPal Shop",
    storePriceUsd: 54.0,
    supplierPriceUsd: 11.3,
    savingsUsd: 42.7,
    savingsPercent: 79,
    scannedAt: "2026-06-05T11:05:00.000Z",
  },
  {
    id: "scan-005",
    originalUrl: "https://glowskin.example/products/jade-roller",
    productTitle: "Natural Jade Face Roller Set",
    storeName: "GlowSkin Co.",
    storePriceUsd: 24.99,
    supplierPriceUsd: 3.1,
    savingsUsd: 21.89,
    savingsPercent: 88,
    scannedAt: "2026-06-01T16:30:00.000Z",
  },
];

export const MOCK_DASHBOARD_ANALYTICS: DashboardAnalytics = {
  totalScans: MOCK_SCAN_HISTORY.length,
  activeAlerts: 2,
  cumulativeSavingsUsd: MOCK_SCAN_HISTORY.reduce(
    (sum, item) => sum + item.savingsUsd,
    0,
  ),
};

export const ANALYSIS_LOADING_STEPS = [
  "Checking 7-day cache…",
  "Scraping product page…",
  "Extracting title & images…",
  "Matching AliExpress suppliers…",
  "Calculating your savings…",
] as const;
