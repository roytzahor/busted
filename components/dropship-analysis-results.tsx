"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMoney } from "@/components/currency-provider";
import { ProductImage } from "@/components/product-image";
import { VerdictSheet } from "@/components/verdict-sheet";
import type { DropshipAnalysisResult } from "@/lib/analyze/map-response";
import {
  AlertTriangle,
  Bot,
  Package,
  ShieldAlert,
  Store,
} from "lucide-react";

interface DropshipAnalysisResultsProps {
  result: DropshipAnalysisResult;
}

export function DropshipAnalysisResults({ result }: DropshipAnalysisResultsProps) {
  const formatMoney = useMoney();
  const {
    storeProduct,
    dropshipPrediction,
    cache,
    supplierSkipReason,
    sourceType,
    presenceTier,
  } = result;
  const prediction = dropshipPrediction;
  const isSupplierListing = sourceType === "supplier_marketplace";
  const confidencePct = Math.round(prediction.confidence * 100);

  return (
    <section
      aria-labelledby="dropship-heading"
      className="animate-in fade-in slide-in-from-bottom-2 ease-out w-full space-y-6 duration-300"
    >
      {/* A supplier listing isn't a scan target at all, so it keeps the old
          badge treatment — there is no verdict to present in a register. */}
      {isSupplierListing ? (
        <div className="space-y-3 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <Badge className="bg-success/15 text-success">
              Already at supplier — you&apos;re good
            </Badge>
            <Badge variant="secondary">
              {cache === "HIT" ? "Cached scrape + AI" : "Fresh analysis"}
            </Badge>
          </div>
          <h2 id="dropship-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
            Supplier listing — not a dropship scan target
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            {prediction.reasoning}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <VerdictSheet
            prediction={prediction}
            tier={presenceTier}
            storeName={storeProduct.storeName}
          />
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {confidencePct}% confidence ·{" "}
            {cache === "HIT" ? "cached scrape + AI" : "fresh analysis"}
          </p>
        </div>
      )}

      {isSupplierListing ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row">
            <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0 overflow-hidden rounded-xl border bg-background">
              <ProductImage
                src={storeProduct.imageUrl}
                alt={storeProduct.title}
                sizes="200px"
              />
            </div>
            <div className="space-y-2">
              <p dir="auto" className="font-semibold">{storeProduct.title}</p>
              {storeProduct.translatedTitle ? (
                <p dir="auto" className="text-muted-foreground/80 text-xs italic">
                  → {storeProduct.translatedTitle}
                </p>
              ) : null}
              {storeProduct.priceUsd > 0 ? (
                <p className="text-success text-2xl font-bold tabular-nums">
                  {formatMoney(storeProduct.priceUsd)}
                </p>
              ) : null}
              <p className="text-muted-foreground text-sm leading-relaxed">
                {prediction.reasoning}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="size-4" aria-hidden="true" />
                  Scraped Store Product
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative mx-auto aspect-square w-full max-w-[240px] overflow-hidden rounded-xl border bg-background">
                  <ProductImage
                    src={storeProduct.imageUrl}
                    alt={storeProduct.title}
                    sizes="240px"
                  />
                </div>
                <div className="space-y-1">
                  <p dir="auto" className="font-semibold">{storeProduct.title}</p>
                  {storeProduct.translatedTitle ? (
                    <p dir="auto" className="text-muted-foreground/80 text-xs italic">
                      → {storeProduct.translatedTitle}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-sm">
                    Sold by {storeProduct.storeName}
                  </p>
                  <p className="text-destructive text-2xl font-bold tabular-nums">
                    {formatMoney(storeProduct.priceUsd)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/25 bg-primary/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="size-4" aria-hidden="true" />
                  AI Verdict
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">Category</dt>
                    <dd className="font-medium">{prediction.productCategory}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">Confidence</dt>
                    <dd className="font-medium tabular-nums">
                      {Math.round(prediction.confidence * 100)}%
                    </dd>
                  </div>
                  {prediction.estimatedSupplierPriceUsd !== null ? (
                    <div>
                      <dt className="text-muted-foreground text-xs uppercase">
                        Est. supplier price
                      </dt>
                      <dd className="text-success font-medium tabular-nums">
                        {formatMoney(prediction.estimatedSupplierPriceUsd)}
                      </dd>
                    </div>
                  ) : null}
                  {prediction.estimatedMarkupPercent !== null ? (
                    <div>
                      <dt className="text-muted-foreground text-xs uppercase">
                        Est. markup
                      </dt>
                      <dd className="font-medium tabular-nums">
                        ~{Math.round(prediction.estimatedMarkupPercent)}%
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {/* Reasoning, evidence and missing signals moved to
                    <VerdictSheet> — this card is now stats + red flags only. */}
                {prediction.redFlags.length > 0 ? <Separator /> : null}

                {prediction.redFlags.length > 0 ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                      <ShieldAlert className="text-destructive size-3.5" aria-hidden="true" />
                      Red flags
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {prediction.redFlags.map((flag) => (
                        <li key={flag}>
                          <Badge variant="outline" className="text-xs">
                            {flag}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className="border-dashed bg-muted/30">
            <CardContent className="flex items-start gap-3 pt-6">
              <Package className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">AliExpress supplier search — not run</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {supplierSkipReason ??
                    "Add ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET to enable live supplier matching."}
                </p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  Results are cached for 14 days.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
