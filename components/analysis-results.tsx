"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ProductComparisonResult } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ExternalLink,
  Package,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import Image from "next/image";

interface AnalysisResultsProps {
  result: ProductComparisonResult;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatOrders(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k+ orders`;
  }
  return `${count}+ orders`;
}

export function AnalysisResults({ result }: AnalysisResultsProps) {
  const { storeProduct, supplierProduct, savingsUsd, savingsPercent, cache } =
    result;

  return (
    <section
      aria-labelledby="comparison-heading"
      className="animate-in fade-in slide-in-from-bottom-6 w-full duration-700"
    >
      <div className="mb-6 space-y-3 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <Badge variant="secondary" className="bg-success/10 text-success">
            Save {savingsPercent}%
          </Badge>
          <Badge variant="outline">
            {cache === "HIT" ? "Cached result" : "Fresh analysis"}
          </Badge>
        </div>
        <h2
          id="comparison-heading"
          className="text-xl font-bold tracking-tight sm:text-2xl"
        >
          {formatUsd(storeProduct.priceUsd)} vs {formatUsd(supplierProduct.priceUsd)}
          <span className="text-success">
            {" "}
            — Save {savingsPercent}%
          </span>
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">
          You could save{" "}
          <strong className="text-foreground">{formatUsd(savingsUsd)}</strong>{" "}
          by buying from the original supplier.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base font-semibold sm:text-lg">
            Price Comparison
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid md:grid-cols-[1fr_auto_1fr]">
            <ProductColumn
              variant="store"
              label="Overpriced Store Product"
              title={storeProduct.title}
              price={storeProduct.priceUsd}
              imageUrl={storeProduct.imageUrl}
              storeName={storeProduct.storeName}
            />

            <div className="relative flex items-center justify-center py-4 md:flex-col md:px-4 md:py-8">
              <Separator className="absolute inset-x-4 top-1/2 md:hidden" />
              <Separator
                orientation="vertical"
                className="absolute inset-y-4 left-1/2 hidden md:block"
              />
              <div className="bg-background text-muted-foreground relative z-10 flex size-10 items-center justify-center rounded-full border text-xs font-bold uppercase tracking-wider">
                vs
              </div>
            </div>

            <ProductColumn
              variant="supplier"
              label="Original AliExpress Supplier"
              title={supplierProduct.title}
              price={supplierProduct.priceUsd}
              imageUrl={supplierProduct.imageUrl}
              orderCount={supplierProduct.orderCount}
              sellerRating={supplierProduct.sellerRating}
              shippingDays={supplierProduct.shippingDays}
            />
          </div>

          <div className="border-t bg-success/5 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Ready to skip the markup?</p>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  Verified supplier with {formatOrders(supplierProduct.orderCount)}{" "}
                  and {supplierProduct.sellerRating}★ rating.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="bg-success text-success-foreground hover:bg-success/90 h-11 w-full sm:w-auto sm:min-w-[260px]"
              >
                <a
                  href={supplierProduct.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buy Original on AliExpress &amp; Save
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

interface ProductColumnProps {
  variant: "store" | "supplier";
  label: string;
  title: string;
  price: number;
  imageUrl: string;
  storeName?: string;
  orderCount?: number;
  sellerRating?: number;
  shippingDays?: number;
}

function ProductColumn({
  variant,
  label,
  title,
  price,
  imageUrl,
  storeName,
  orderCount,
  sellerRating,
  shippingDays,
}: ProductColumnProps) {
  const isStore = variant === "store";

  return (
    <article
      className={cn(
        "flex flex-col gap-4 p-4 sm:p-6",
        isStore ? "bg-destructive/5" : "bg-success/5",
      )}
    >
      <div className="flex items-center gap-2">
        {isStore ? (
          <ArrowDownRight
            className="text-destructive size-4 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck
            className="text-success size-4 shrink-0"
            aria-hidden="true"
          />
        )}
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          {label}
        </h3>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-xl border bg-background shadow-sm sm:max-w-none">
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 280px, 50vw"
          unoptimized
        />
      </div>

      <div className="space-y-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
          {title}
        </p>
        {storeName ? (
          <p className="text-muted-foreground text-xs">Sold by {storeName}</p>
        ) : null}
        <p
          className={cn(
            "text-2xl font-bold tabular-nums sm:text-3xl",
            isStore ? "text-destructive" : "text-success",
          )}
        >
          {formatUsd(price)}
        </p>
      </div>

      {!isStore && orderCount !== undefined && sellerRating !== undefined ? (
        <ul className="flex flex-wrap gap-2" aria-label="Supplier trust metrics">
          <li>
            <Badge variant="secondary" className="gap-1">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {sellerRating} rating
            </Badge>
          </li>
          <li>
            <Badge variant="secondary" className="gap-1">
              <Package className="size-3" aria-hidden="true" />
              {formatOrders(orderCount)}
            </Badge>
          </li>
          {shippingDays !== undefined ? (
            <li>
              <Badge variant="secondary" className="gap-1">
                <Truck className="size-3" aria-hidden="true" />
                ~{shippingDays} day shipping
              </Badge>
            </li>
          ) : null}
        </ul>
      ) : null}

      {isStore ? (
        <Badge variant="destructive" className="w-fit">
          Dropship markup detected
        </Badge>
      ) : (
        <Badge className="bg-success text-success-foreground hover:bg-success w-fit">
          Verified original supplier — we got you
        </Badge>
      )}
    </article>
  );
}
