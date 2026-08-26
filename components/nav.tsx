"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { CurrencyPicker } from "@/components/currency-picker";
import { LanguagePicker } from "@/components/language-picker";
import { useT } from "@/components/locale-provider";
import { RecentScans } from "@/components/recent-scans";
import { cn } from "@/lib/utils";
import { Activity, Flame, Menu, Search, X } from "lucide-react";

type NavLink = {
  href: string;
  labelKey: "nav.scan" | "nav.monitor";
  icon: typeof Search;
};

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: "/", labelKey: "nav.scan", icon: Search },
  { href: "/monitoring", labelKey: "nav.monitor", icon: Activity },
];

export function Nav() {
  const pathname = usePathname();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-background/60 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-[max(1rem,env(safe-area-inset-left))] sm:h-16 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label={`${BRAND_NAME} home`}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-amber-500/80 shadow-md shadow-primary/30">
            <Flame className="size-4 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg">
            {BRAND_NAME}
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main navigation"
        >
          {NAV_LINKS.map(({ href, labelKey, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguagePicker />
          <CurrencyPicker />
          <RecentScans />
          <Button
            variant="ghost"
            size="icon"
            className="size-10 md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          >
            {mobileOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          id="mobile-nav"
          className="animate-in slide-in-from-top-2 ease-out border-t px-4 py-3 duration-200 md:hidden"
          aria-label="Mobile navigation"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map(({ href, labelKey, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
