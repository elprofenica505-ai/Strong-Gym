"use client";

import { useSyncExternalStore } from "react";
import { Database, X } from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";

/* No usar el prefijo «strong-gym:demo-»: la limpieza de almacenamiento
   demo legado del AppProvider borra esas claves en cada carga y el
   cierre del aviso nunca persistía tras recargar. */
const STORAGE_KEY = "strong-gym:ui:demo-banner-dismissed";

/* El aviso vive en localStorage, que no existe en el servidor.
   useSyncExternalStore lee ese dato del navegador sin un efecto que
   provoque renders en cascada (regla react-hooks/set-state-in-effect). */
const listeners = new Set<() => void>();
/* Si el navegador bloquea el almacenamiento, el cierre vale para esta visita. */
let dismissedInMemory = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readVisible(): boolean {
  if (dismissedInMemory) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

/** En el servidor no hay localStorage: se oculta hasta hidratar. */
const serverVisible = () => false;

function dismiss() {
  dismissedInMemory = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sin persistencia, el cierre vale hasta recargar
  }
  for (const onChange of listeners) onChange();
}

/**
 * Aviso de que el sitio corre con datos de ejemplo.
 * Sólo se monta en demostración local explícita de lectura, nunca en producción.
 */
export function DemoBanner() {
  const dict = useDictionary().dict;
  const visible = useSyncExternalStore(subscribe, readVisible, serverVisible);

  if (!visible) return null;

  return (
    <div className="relative z-40 border-b border-brand/25 bg-brand/10">
      <div className="container-x flex items-center gap-3 py-2.5">
        <Database className="size-4 shrink-0 text-brand" aria-hidden="true" />

        <p className="flex-1 text-[0.75rem] leading-snug text-mist sm:text-[0.8125rem]">
          <span className="font-semibold text-brand-300">{dict.demo.title}:</span> {dict.demo.text}{" "}
          <span className="hidden text-fog sm:inline">{dict.demo.hint}</span>
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label={dict.demo.dismiss}
          className="shrink-0 rounded-full p-1 text-fog transition-colors hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
