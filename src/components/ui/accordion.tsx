"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AccordionItem {
  q: string;
  a: string;
}

export function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card", className)}>
      {items.map((item, index) => {
        const isOpen = open === index;

        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03] sm:px-6 sm:py-5"
              >
                <span
                  className={cn(
                    "text-[0.9375rem] font-semibold leading-snug transition-colors sm:text-base",
                    isOpen ? "text-volt" : "text-chalk",
                  )}
                >
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    "mt-0.5 size-5 shrink-0 text-fog transition-transform duration-300",
                    isOpen && "rotate-180 text-volt",
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>

            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-[0.875rem] leading-relaxed text-fog sm:px-6 sm:pb-6">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
