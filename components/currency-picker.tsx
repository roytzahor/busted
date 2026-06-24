"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/components/currency-provider";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, MapPin } from "lucide-react";

export function CurrencyPicker({ className }: { className?: string }) {
  const { currency, meta, catalog, setCurrency, autoDetected, detectedCountry } =
    useCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 text-xs font-medium text-foreground/85 backdrop-blur-sm transition-colors hover:border-white/15 hover:bg-white/[0.06] sm:gap-2 sm:px-3",
            className,
          )}
          aria-label={`Currency: ${meta.label}${autoDetected ? " (auto-detected)" : ""}`}
        >
          <span aria-hidden="true" className="text-sm leading-none">
            {meta.flag}
          </span>
          <span className="tabular-nums">{meta.symbol}</span>
          <span className="hidden text-muted-foreground sm:inline">{meta.label}</span>
          <ChevronDown className="size-3 text-muted-foreground/70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Currency</span>
          {autoDetected && detectedCountry ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80"
              title={`Detected from your region (${detectedCountry})`}
            >
              <MapPin className="size-2.5" aria-hidden="true" />
              auto · {detectedCountry}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {catalog.map((item) => {
          const active = item.code === currency;
          return (
            <DropdownMenuItem
              key={item.code}
              onClick={() => setCurrency(item.code)}
              className={cn(
                "flex items-center justify-between gap-3 text-sm",
                active && "font-semibold",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="text-base leading-none">
                  {item.flag}
                </span>
                <span>{item.label}</span>
                <span className="text-muted-foreground">· {item.symbol}</span>
              </span>
              {active ? (
                <Check className="size-4 text-primary" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
