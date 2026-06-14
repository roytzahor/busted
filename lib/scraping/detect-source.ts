export type ProductSourceType = "retail_store" | "supplier_marketplace";

const SUPPLIER_MARKETPLACE_SUFFIXES = [
  "aliexpress.com",
  "aliexpress.us",
  "temu.com",
  "wish.com",
  "dhgate.com",
] as const;

export function detectProductSource(url: string): ProductSourceType {
  try {
    const hostname = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");

    const isSupplier = SUPPLIER_MARKETPLACE_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

    return isSupplier ? "supplier_marketplace" : "retail_store";
  } catch {
    return "retail_store";
  }
}

export function isSupplierMarketplaceUrl(url: string): boolean {
  return detectProductSource(url) === "supplier_marketplace";
}

export function getSupplierMarketplaceLabel(url: string): string {
  try {
    const hostname = new URL(url.trim()).hostname.toLowerCase();
    if (hostname.includes("aliexpress")) return "AliExpress";
    if (hostname.includes("temu")) return "Temu";
    if (hostname.includes("wish")) return "Wish";
    if (hostname.includes("dhgate")) return "DHgate";
    return "Supplier marketplace";
  } catch {
    return "Supplier marketplace";
  }
}
