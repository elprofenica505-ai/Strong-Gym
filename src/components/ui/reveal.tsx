"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Aparece con un fade-up cuando entra en pantalla.
 * Respeta "prefers-reduced-motion" desde el CSS (globals.css).
 */
/** Suscripción vacía: el dato consultado no cambia durante la sesión. */
function subscribeNoop() {
  return () => {};
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  once = true,
}: {
  children: ReactNode;
  className?: string;
  /** Retraso en milisegundos, para escalonar tarjetas. */
  delay?: number;
  as?: ElementType;
  once?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  /* Navegadores sin IntersectionObserver muestran el contenido de una vez.
     Se consulta como dato externo, no con un efecto que cambie el estado. */
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => typeof IntersectionObserver !== "undefined",
    () => true,
  );
  const shown = visible || !supported;

  useEffect(() => {
    if (!supported) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, supported]);

  return (
    <Tag
      ref={ref}
      className={cn("reveal", shown && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
