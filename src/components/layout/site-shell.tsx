"use client";

import { useCallback, useState, type ReactNode } from "react";
import { SideNav } from "./side-nav";
import { SiteHeader } from "./site-header";

/**
 * Estructura general del sitio: panel lateral izquierdo fijo en la
 * computadora (por eso el contenido lleva `lg:pl-64`) y oculto en el
 * celular, donde se abre con el botón de menú de la barra superior.
 */
export function SiteShell({
  banner,
  children,
  footer,
}: {
  banner?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <SideNav open={menuOpen} onClose={closeMenu} />

      <div className="flex min-h-dvh flex-col lg:pl-64">
        {banner}
        <SiteHeader onOpenMenu={openMenu} />
        <main id="contenido" className="relative flex-1">
          {children}
        </main>
        {footer}
      </div>
    </>
  );
}
