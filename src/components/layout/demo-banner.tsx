"use client";

import { useEffect, useState } from "react";
import { Database, X } from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";

const STORAGE_KEY = "strong-gym:demo-banner-dismissed";

/**
 * Aviso de que el sitio corre con datos de ejemplo.
 * Desaparece solo cuando conectás Supabase (env.ts → isSupabaseConfigured).
 */
export function DemoBanner() {
  const dict = useDictionary().dict;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="relative z-40 border-b border-brand/25 bg-brand/10">
      <div className="container-x flex items-center gap-3 py-2.5">
        <Database className="size-4 shrink-0 text-brand" aria-hidden="true" />

        <p className="flex-1 text-[0.75rem] leading-snug text-mist sm:text-[0.8125rem]">
          <span className="font-semibold text-brand">{dict.demo.title}:</span> {dict.demo.text}{" "}
          <span className="hidden text-fog sm:inline">{dict.demo.hint}</span>
        </p>

        <button
          type="button"
          onClick={() => {
            setVisible(false);
            try {
              window.localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              // sin persistencia, no pasa nada
            }
          }}
          aria-label={dict.demo.dismiss}
          className="shrink-0 rounded-full p-1 text-fog transition-colors hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
