"use client";

import { FAQ_ITEMS } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * "Why this exists" FAQ — three short items.
 *
 * Native <details> would also work but we want a single open at a time and
 * smoother animations, so we control state. Each item is keyboard-operable
 * via the button.
 */

export function ValuePropFaq({ className }: { className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      aria-label="Why Busted exists"
      className={cn("mx-auto max-w-2xl", className)}
    >
      <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
        Why this exists
      </p>
      <ul className="space-y-2.5">
        {FAQ_ITEMS.map((item, idx) => {
          const open = idx === openIndex;
          return (
            <li
              key={item.question}
              className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-white/12"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : idx)}
                aria-expanded={open}
                aria-controls={`faq-panel-${idx}`}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="text-sm font-semibold sm:text-base">
                  {item.question}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                    open && "rotate-180 text-primary",
                  )}
                  aria-hidden="true"
                />
              </button>
              <div
                id={`faq-panel-${idx}`}
                role="region"
                aria-hidden={!open}
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
