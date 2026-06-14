"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DropshipAnalysisResult } from "@/lib/analyze/map-response";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Bot,
  Package,
  ShieldAlert,
  Store,
} from "lucide-react";
import Image from "next/image";

interface DropshipAnalysisResultsProps {
  result: DropshipAnalysisResult;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function DropshipAnalysisResults({ result }: DropshipAnalysisResultsProps) {
  const { storeProduct, dropshipPrediction, cache, supplierSkipReason, sourceType } =
    result;
  const prediction = dropshipPrediction;
  const isSupplierListing = sourceType === "supplier_marketplace";

  return (
    <section
      aria-labelledby="dropship-heading"
      className="animate-in fade-in slide-in-from-bottom-6 w-full space-y-6 duration-700"
    >
      <div className="space-y-3 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          {isSupplierListing ? (
            <Badge className="bg-success/15 text-success">
              Already at supplier — you're good
            </Badge>
          ) : (
            <Badge
              className={cn(
                prediction.isLikelyDropship
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {prediction.isLikelyDropship ? "You're busted — markup detected" : "Unclear verdict"}
            </Badge>
          )}
          <Badge variant="outline">
            {Math.round(prediction.confidence * 100)}% confidence
          </Badge>
          <Badge variant="secondary">
            {cache === "HIT" ? "Cached scrape + AI" : "Fresh analysis"}
          </Badge>
        </div>

        <h2 id="dropship-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
          {isSupplierListing
            ? "Supplier listing — not a dropship scan target"
            : `Analysis — ${storeProduct.title}`}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">
          {isSupplierListing
            ? prediction.reasoning
            : "Scrape and AI verification complete. Check the Pipeline tab for timing details."}
        </p>
      </div>

      {isSupplierListing ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row">
            <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0 overflow-hidden rounded-xl border bg-background">
              <Image
                src={storeProduct.imageUrl}
                alt={storeProduct.title}
                fill
                className="object-cover"
                sizes="200px"
                unoptimized
              />
            </div>
            <div className="space-y-2">
              <p className="font-semibold">{storeProduct.title}</p>
              {storeProduct.priceUsd > 0 ? (
                <p className="text-success text-2xl font-bold tabular-nums">
                  {formatUsd(storeProduct.priceUsd)}
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
                  <Image
                    src={storeProduct.imageUrl}
                    alt={storeProduct.title}
                    fill
                    className="object-cover"
                    sizes="240px"
                    unoptimized
                  />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">{storeProduct.title}</p>
                  <p className="text-muted-foreground text-sm">
                    Sold by {storeProduct.storeName}
                  </p>
                  <p className="text-destructive text-2xl font-bold tabular-nums">
                    {formatUsd(storeProduct.priceUsd)}
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
                        {formatUsd(prediction.estimatedSupplierPriceUsd)}
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

                <Separator />

                <p className="text-sm leading-relaxed">{prediction.reasoning}</p>

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
                  Results cached 7 days — enable Bypass cache to re-scrape.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
