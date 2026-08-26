import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisResults } from "@/components/analysis-results";
import { BrowseAnalysisResults } from "@/components/browse-analysis-results";
import { DropshipAnalysisResults } from "@/components/dropship-analysis-results";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/share-button";
import { loadScanById } from "@/lib/cache/lookup-by-id";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { ArrowLeft, Search } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Permanent home for a single scan result.
 *
 * Server-rendered; data sourced from the cached ScannedProduct row. The OG
 * card is built dynamically from the same data so social unfurlers can cache
 * the right preview forever.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadScanById(id);
  if (!loaded) {
    return {
      title: `Scan not found — ${BRAND_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const cmp = loaded.comparison?.comparison;
  const title =
    cmp?.storeProduct.title ?? loaded.response.storeProduct.title ?? "Scan";
  const savings = cmp?.savingsPercent ?? null;
  const headline =
    savings !== null
      ? `${title} — saved ${savings}% on ${BRAND_NAME}`
      : `${title} — ${BRAND_NAME}`;

  const ogParams = new URLSearchParams();
  ogParams.set("title", title.slice(0, 80));
  if (savings !== null) ogParams.set("savings", String(savings));
  if (cmp?.storeProduct.priceUsd) {
    ogParams.set("storeUsd", String(cmp.storeProduct.priceUsd));
  }
  if (cmp?.supplierProduct.priceUsd) {
    ogParams.set("aliUsd", String(cmp.supplierProduct.priceUsd));
  }
  if (cmp?.storeProduct.imageUrl) {
    ogParams.set("image", cmp.storeProduct.imageUrl);
  }

  return {
    title: headline,
    description: `${title} — see the original supplier price and skip the markup.`,
    openGraph: {
      title: headline,
      description: BRAND_TAGLINE,
      type: "article",
      images: [
        {
          url: `/api/og/scan?${ogParams.toString()}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: headline,
      description: BRAND_TAGLINE,
      images: [`/api/og/scan?${ogParams.toString()}`],
    },
  };
}

export default async function ScanPermalinkPage({ params }: PageProps) {
  const { id } = await params;
  const loaded = await loadScanById(id);

  if (!loaded || !loaded.comparison) {
    notFound();
  }

  const { comparison, dropshipAnalysis, browse, debug } = loaded.comparison;

  return (
    <div className="relative">
      {/* Ambient blobs removed — the shared film grain on body::after is the
          background now, so this still matches the homepage. See DESIGN.md. */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:pt-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Home
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ShareButton
              scanId={loaded.scanId}
              productUrl={loaded.originalUrl}
              title={
                comparison?.storeProduct.title ??
                loaded.response.storeProduct.title
              }
              savingsPercent={comparison?.savingsPercent ?? null}
              storeUsd={comparison?.storeProduct.priceUsd}
              aliUsd={comparison?.supplierProduct.priceUsd}
              imageUrl={comparison?.storeProduct.imageUrl}
            />
            <Button
              asChild
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
            >
              <Link
                href={`/?url=${encodeURIComponent(loaded.originalUrl)}&forceRefresh=1`}
              >
                <Search className="size-4" aria-hidden="true" />
                Re-scan
              </Link>
            </Button>
          </div>
        </div>

        {browse ? (
          <div className="mb-4">
            <BrowseAnalysisResults result={browse} />
          </div>
        ) : null}

        {dropshipAnalysis ? (
          <div className="mb-4">
            <DropshipAnalysisResults result={dropshipAnalysis} />
          </div>
        ) : null}

        {comparison ? (
          <AnalysisResults result={comparison} />
        ) : !browse && !dropshipAnalysis ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
            Nothing to display for this scan.
          </p>
        ) : null}

        <p className="mt-10 text-center text-xs text-muted-foreground/60">
          Scanned {new Date(loaded.lastScrapedAt).toLocaleString()} ·{" "}
          <Link
            href={`/?url=${encodeURIComponent(loaded.originalUrl)}`}
            className="underline-offset-4 hover:underline"
          >
            Open original
          </Link>
          {debug ? " · debug captured" : null}
        </p>
      </div>
    </div>
  );
}
