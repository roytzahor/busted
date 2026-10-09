import { Paper, PaperFigure, PaperLabel, PaperRule } from "@/components/ui/paper";
import { Stamp } from "@/components/ui/stamp";
import { VerdictSheet } from "@/components/verdict-sheet";
import { AnalysisResults } from "@/components/analysis-results";
import type { ProductComparisonResult } from "@/lib/mock-data";
import type { DropshipPrediction } from "@/lib/ai/dropship-verifier";
import type { DropshipVerdict } from "@/lib/ai/dropship-verifier";
import { notFound } from "next/navigation";

function fakePrediction(
  verdict: DropshipVerdict,
  confidence: number,
  over: Partial<DropshipPrediction> = {},
): DropshipPrediction {
  return {
    verdict,
    isLikelyDropship: verdict === "dropship",
    confidence,
    productCategory: "jewelry",
    reasoning:
      "Generic supplier imagery, no brand history, and a price band typical of a reseller markup.",
    reasoningSignals: [
      "Product photos appear on multiple unrelated stores",
      "No manufacturer or brand registration found",
      "Shipping window of 12–18 days quoted",
    ],
    missingSignals: ["No supplier invoice", "No customs or import record"],
    redFlags: [],
    aliexpressKeywords: [],
    styleTokens: [],
    materialPriors: [],
    estimatedStorePriceUsd: 64.32,
    estimatedSupplierPriceUsd: 7.4,
    estimatedMarkupPercent: 770,
    ...over,
  };
}

/** A matched offer for the Ledger previews (spec 0004). Prices are observed:
 *  ₪238 on the store vs $7.42 on the listing, not the model's estimates. */
function fakeOffer(over: Partial<ProductComparisonResult> = {}): ProductComparisonResult {
  return {
    originalUrl: "https://imri-jewelry.co.il/products/my-baby-necklace",
    cache: "MISS",
    presenceTier: "flame",
    dropshipPrediction: fakePrediction("dropship", 0.88),
    storeProduct: {
      title: "My Baby Necklace — שרשרת עם שם הילד",
      priceUsd: 64.32,
      imageUrl: "https://placehold.co/480x480/2a2420/e8dcc4/png?text=Store",
      storeName: "imri-jewelry.co.il",
    },
    supplierProduct: {
      title: "Custom Name Necklace Stainless Steel Personalized Baby Name Pendant",
      priceUsd: 7.42,
      imageUrl: "https://placehold.co/480x480/2a2420/e8dcc4/png?text=Listing",
      affiliateUrl: "https://s.click.aliexpress.com/e/preview",
      orderCount: 2431,
      sellerRating: 4.7,
      shippingDays: 12,
    },
    savingsUsd: 56.9,
    savingsPercent: 88,
    matchQuality: "high",
    matchConfidence: 0.86,
    imageMatchScore: 0.83,
    imageMatchSameFunction: true,
    ...over,
  };
}

export const metadata = {
  title: "Design Primitives — Busted Internal",
  robots: { index: false, follow: false },
};

/**
 * Isolated preview of the Teardown design primitives (DESIGN.md phase 2).
 *
 * This repo has no Storybook, and these primitives are deliberately not wired
 * into any real screen yet — so without a harness they could only be reviewed
 * by reading the source. Renders each one against the real dark room, plus the
 * two states most likely to be wrong: paper on the film-grain background, and
 * the stamp straddling a paper edge so it lands on both grounds at once.
 *
 * Dev-only, same gate as the rest of /dev-monitor.
 */
export default async function DesignPrimitivesPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string; only?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  // `?dir=rtl` previews every primitive in RTL (DESIGN §10.2: verify both
  // directions); `?only=offers` isolates the Ledger offer for screenshots.
  const { dir, only } = await searchParams;

  if (only === "offers") {
    return (
      <div dir={dir === "rtl" ? "rtl" : "ltr"} className="mx-auto max-w-3xl space-y-16 px-4 py-12 sm:px-6">
        <OfferPreviews />
      </div>
    );
  }

  return (
    <div dir={dir === "rtl" ? "rtl" : "ltr"} className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          DESIGN.md · phase 2
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Primitives</h1>
        <p className="text-sm text-muted-foreground">
          Not wired into any screen. Check the paper reads as opaque stock
          against the grain, and that the stamp holds on both grounds.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Paper · torn (what the store charges)
        </h2>
        {/* Copy is deliberately accusatory rather than clerical. "Retail
            listing / scraped" is invoice language and was half of why the
            surface read as bureaucratic — the tear fixed the shape, this
            fixes the voice. */}
        <Paper torn className="max-w-sm">
          <PaperLabel>
            <span>what they charge</span>
            <span>imri-jewelry.co.il</span>
          </PaperLabel>
          <PaperFigure>₪238.00</PaperFigure>
        </Paper>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Paper · source, with stamp on the edge
        </h2>
        {/* relative + the stamp's negative offsets are what put it half on
            paper and half on the room — the case the ink-only fill exists for. */}
        <div className="relative max-w-sm">
          <Paper>
            <PaperLabel>
              <span>what it actually costs</span>
              <span>image-verified</span>
            </PaperLabel>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-paper-muted">
                Custom Photo Necklace
              </span>
              <PaperFigure className="text-paper-money">₪27.40</PaperFigure>
            </div>
            <p className="font-mono text-[11px] text-paper-muted">
              4.8 ★ · 2,431 orders · 12–18d
            </p>
            <PaperRule />
            <p className="text-sm">
              קנו במקור — חסכו <bdi className="font-mono">₪210.60</bdi>
            </p>
          </Paper>
          <Stamp className="absolute -bottom-4 end-[-12px]">
            BUSTED ×8.7
          </Stamp>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          RTL — stamp must lean the other way
        </h2>
        <div dir="rtl" className="relative max-w-sm">
          <Paper>
            <PaperLabel>
              <span>רישום קמעונאי</span>
              <span>נסרק</span>
            </PaperLabel>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-paper-muted">
                imri-jewelry.co.il
              </span>
              <PaperFigure>₪238.00</PaperFigure>
            </div>
          </Paper>
          <Stamp className="absolute -bottom-4 end-[-12px]">
            BUSTED ×8.7
          </Stamp>
        </div>
      </section>

      {/* The four registers side by side. The point of seeing them together is
          the DROP in intensity: if silent doesn't look deliberately quiet next
          to flame, the tier system is decorative and the restraint that makes
          the loud state credible isn't actually being bought. */}
      <section className="space-y-8">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          VerdictSheet · all four registers
        </h2>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-muted-foreground">
            flame — dropship, 0.88
          </p>
          <VerdictSheet
            prediction={fakePrediction("dropship", 0.88)}
            tier="flame"
            storeName="imri-jewelry.co.il"
          />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-muted-foreground">
            amber — dropship, 0.58
          </p>
          <VerdictSheet
            prediction={fakePrediction("dropship", 0.58)}
            tier="amber"
            storeName="remora.co.il"
          />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-muted-foreground">
            silent + legit — must read as an all-clear, NOT an apology
          </p>
          <VerdictSheet
            prediction={fakePrediction("legit", 0.82, {
              reasoning: "Established brand selling its own product.",
              missingSignals: [],
            })}
            tier="silent"
            storeName="Vivify"
          />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-muted-foreground">
            silent + insufficient_evidence — same tier, different sentence
          </p>
          <VerdictSheet
            prediction={fakePrediction("insufficient_evidence", 0.35)}
            tier="silent"
            storeName="mxm02.co.il"
          />
        </div>
      </section>

      <OfferPreviews />

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Stamp alone · on the room
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <Stamp>BUSTED ×8.7</Stamp>
          <Stamp>BUSTED ×3.1</Stamp>
          <Stamp>BUSTED ×12.0</Stamp>
        </div>
      </section>
    </div>
  );
}

/**
 * The Ledger offer (spec 0004) in the four shapes that read differently:
 * a confirmed match at flame (listing on paper), a likely match at flame
 * (listing in the room, uncertainty as prose), amber (ghost bar, no stamp),
 * and a best-effort closest match (no bar — a different product's price is
 * not a measurement).
 */
function OfferPreviews() {
  const shapes: [string, ProductComparisonResult][] = [
    ["flame · confirmed same product", fakeOffer()],
    ["flame · likely match (no image confirmation)", fakeOffer({ imageMatchScore: undefined, imageMatchSameFunction: undefined, matchQuality: "medium", matchConfidence: 0.58 })],
    ["amber · likely match", fakeOffer({ presenceTier: "amber", dropshipPrediction: fakePrediction("dropship", 0.58), imageMatchScore: undefined, imageMatchSameFunction: undefined })],
    ["flame · closest match (best-effort)", fakeOffer({ bestEffortOnly: true, matchQuality: "low", matchConfidence: 0.31, imageMatchScore: undefined, imageMatchSameFunction: undefined })],
  ];
  return (
    <section className="space-y-16">
      <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        Ledger offer · spec 0004
      </h2>
      {shapes.map(([label, offer]) => (
        <div key={label} data-preview={label} className="space-y-3">
          <p className="font-mono text-[10px] text-muted-foreground">{label}</p>
          <AnalysisResults result={offer} />
        </div>
      ))}
    </section>
  );
}
