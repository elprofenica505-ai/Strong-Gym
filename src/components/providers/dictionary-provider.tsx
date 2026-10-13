"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

interface DictionaryContextValue {
  dict: Dictionary;
  locale: Locale;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

/**
 * Deja el diccionario disponible para los componentes de cliente
 * (header, formularios, horarios...) sin pasarlo por props uno por uno.
 */
export function DictionaryProvider({
  dict,
  locale,
  children,
}: DictionaryContextValue & { children: ReactNode }) {
  return (
    <DictionaryContext.Provider value={{ dict, locale }}>{children}</DictionaryContext.Provider>
  );
}

export function useDictionary(): DictionaryContextValue {
  const context = useContext(DictionaryContext);
  if (!context) throw new Error("useDictionary() tiene que usarse dentro de <DictionaryProvider>");
  return context;
}

export function useDict(): Dictionary {
  return useDictionary().dict;
}

export function useLocale(): Locale {
  return useDictionary().locale;
}
