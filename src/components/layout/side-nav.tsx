"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Dumbbell,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Tag,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { ButtonLink } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import { Logo } from "./logo";

type NavId = "home" | "schedule" | "classes" | "plans" | "team" | "contact" | "account";

/** Secciones del inicio y a qué opción del panel pertenecen. */
const SECTION_TO_NAV: { id: string; nav: NavId }[] = [
  { id: "por-que", nav: "classes" },
  { id: "clases", nav: "classes" },
  { id: "boxeo", nav: "classes" },
  { id: "suplementos", nav: "classes" },
  { id: "planes", nav: "plans" },
  { id: "equipo", nav: "team" },
  { id: "contacto", nav: "contact" },
];

export function SideNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dict, locale } = useDictionary();
  const { user, signOut, toast, hydrated } = useApp();
  const pathname = usePathname();
  const [sectionNav, setSectionNav] = useState<NavId>("home");

  const isHome = pathname === `/${locale}`;

  /* Al cambiar de pantalla se cierra el panel (en el celular) y
     se reinicia la sección activa del inicio. */
  useEffect(() => {
    onClose();
    setSectionNav("home");
  }, [pathname, onClose]);

  /* Scroll-spy del inicio: marca en rojo la sección que se está viendo. */
  useEffect(() => {
    if (!isHome) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const match = SECTION_TO_NAV.find((s) => s.id === entry.target.id);
          if (match) setSectionNav(match.nav);
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );

    for (const { id } of SECTION_TO_NAV) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [isHome, pathname]);

  /* Bloquear el scroll de fondo con el panel abierto en el celular. */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  const active: NavId | null = pathname.startsWith(`/${locale}/horarios`)
    ? "schedule"
    : pathname.startsWith(`/${locale}/mi-cuenta`)
      ? "account"
      : isHome
        ? sectionNav
        : null;

  const links: { id: NavId; href: string; label: string; Icon: typeof Home }[] = [
    { id: "home", href: `/${locale}`, label: dict.nav.home, Icon: Home },
    { id: "schedule", href: `/${locale}/horarios`, label: dict.nav.schedule, Icon: CalendarDays },
    { id: "classes", href: `/${locale}#clases`, label: dict.nav.classes, Icon: Dumbbell },
    { id: "plans", href: `/${locale}#planes`, label: dict.nav.plans, Icon: Tag },
    { id: "team", href: `/${locale}#equipo`, label: dict.nav.coaches, Icon: Users },
    { id: "contact", href: `/${locale}#contacto`, label: dict.nav.contact, Icon: Mail },
    { id: "account", href: `/${locale}/mi-cuenta`, label: dict.nav.account, Icon: UserRound },
  ];

  const nav = (
    <>
      <div className="flex h-16 items-center justify-between px-5 sm:h-18 lg:h-20">
        <Logo locale={locale} name={dict.nav.home} tone="dark" />
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.nav.close}
          className="grid size-10 place-items-center rounded-full border border-line bg-card text-ink lg:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4" aria-label={dict.nav.menu}>
        {links.map(({ id, href, label, Icon }) => {
          const isActive = active === id;
          return (
            <Link
              key={id}
              href={href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-[0.9375rem] font-medium transition-colors",
                isActive
                  ? "bg-brand/10 text-brand-300"
                  : "text-mist hover:bg-cloud hover:text-ink",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
              {isActive ? (
                <span className="ml-auto h-5 w-1 rounded-full bg-brand" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}

        {user && (user.role === "admin" || user.role === "staff") ? (
          <Link
            href={`/${locale}/panel`}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-[0.9375rem] font-medium transition-colors",
              pathname.startsWith(`/${locale}/panel`)
                ? "bg-brand/10 text-brand-300"
                : "text-mist hover:bg-cloud hover:text-ink",
            )}
          >
            <LayoutDashboard className="size-5 shrink-0" aria-hidden="true" />
            {dict.nav.admin}
          </Link>
        ) : null}
      </nav>

      {/* Usuario / ingreso, al pie del panel */}
      <div className="border-t border-line p-4">
        {!hydrated ? (
          <div className="h-14 animate-pulse rounded-xl border border-line bg-card" aria-hidden="true" />
        ) : user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 px-1">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-[0.75rem] font-bold text-onbrand">
                {initials(user.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-semibold text-ink">{user.fullName}</p>
                <p className="truncate text-[0.75rem] text-fog">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void signOut();
                toast(dict.nav.logout, "info");
                onClose();
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-card text-[0.875rem] font-semibold text-mist transition-colors hover:border-brand/40 hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {dict.nav.logout}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ButtonLink href={`/${locale}/ingresar`} variant="dark" size="md" onClick={onClose}>
              {dict.nav.login}
            </ButtonLink>
            <ButtonLink href={`/${locale}/registro`} variant="outline" size="md" onClick={onClose}>
              {dict.nav.register}
            </ButtonLink>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Escritorio: fijo a la izquierda, siempre visible */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-line bg-paper lg:flex">
        {nav}
      </aside>

      {/* Celular: oculto, se abre con el botón de menú */}
      <div
        className={cn("fixed inset-0 z-[60] lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={onClose}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-full max-w-xs flex-col bg-paper shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav}
        </aside>
      </div>
    </>
  );
}
