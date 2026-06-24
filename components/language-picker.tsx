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
import { useLocale } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Languages } from "lucide-react";

export function LanguagePicker({ className }: { className?: string }) {
  const { locale, meta, catalog, setLocale, autoDetected, t } = useLocale();

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
          aria-label={`${t("picker.language.label")}: ${meta.nativeLabel}${autoDetected ? ` (${t("picker.currency.auto")})` : ""}`}
        >
          <Languages className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="hidden sm:inline">{meta.nativeLabel}</span>
          <span aria-hidden="true" className="text-sm leading-none sm:hidden">
            {meta.flag}
          </span>
          <ChevronDown className="size-3 text-muted-foreground/70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("picker.language.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {catalog.map((item) => {
          const active = item.code === locale;
          return (
            <DropdownMenuItem
              key={item.code}
              onClick={() => setLocale(item.code)}
              className={cn(
                "flex items-center justify-between gap-3 text-sm",
                active && "font-semibold",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="text-base leading-none">
                  {item.flag}
                </span>
                <span>{item.nativeLabel}</span>
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
