"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  User as UserIcon,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { ButtonLink } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

export function SiteHeader() {
  const { dict, locale } = useDictionary();
  const { user, signOut, toast, hydrated } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  /* Sombra/desenfoque cuando el usuario baja */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Cerrar el menú al cambiar de página y bloquear el scroll de fondo */
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: `/${locale}`, label: dict.nav.home, match: "exact" as const },
    { href: `/${locale}/horarios`, label: dict.nav.schedule, match: "prefix" as const },
    { href: `/${locale}#clases`, label: dict.nav.classes, match: "none" as const },
    { href: `/${locale}#planes`, label: dict.nav.plans, match: "none" as const },
    { href: `/${locale}#profes`, label: dict.nav.coaches, match: "none" as const },
    { href: `/${locale}#contacto`, label: dict.nav.contact, match: "none" as const },
  ];

  function isActive(link: (typeof links)[number]) {
    if (link.match === "none") return false;
    if (link.match === "exact") return pathname === link.href;
    return pathname.startsWith(link.href);
  }

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-line/80 bg-void/95 backdrop-blur-xl"
            : "border-b border-transparent",
        )}
      >
        <div className="container-x">
          <div className="flex h-16 items-center justify-between gap-3 sm:h-18 lg:h-20">
            <Logo locale={locale} name={dict.nav.home} />

            {/* Navegación de escritorio */}
            <nav className="hidden items-center gap-0.5 lg:flex" aria-label={dict.nav.menu}>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                    isActive(link)
                      ? "text-volt"
                      : "text-mist hover:bg-white/5 hover:text-chalk",
                  )}
                >
                  {link.label}
                  {isActive(link) ? (
                    <span className="absolute inset-x-3.5 -bottom-0.5 h-px bg-volt" aria-hidden="true" />
                  ) : null}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <LanguageSwitcher locale={locale} label={dict.nav.language} />
              </div>

              {!hydrated ? (
                <span
                  className="hidden h-10 w-28 animate-pulse rounded-full border border-line bg-card lg:block"
                  aria-hidden="true"
                />
              ) : user ? (
                <div className="relative hidden lg:block">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 transition-colors hover:border-white/25"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-volt text-[0.6875rem] font-bold text-ink">
                      {initials(user.fullName)}
                    </span>
                    <span className="max-w-24 truncate text-[0.8125rem] font-medium text-chalk">
                      {user.fullName.split(" ")[0]}
                    </span>
                  </button>

                  {accountOpen ? (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setAccountOpen(false)}
                        aria-label={dict.nav.close}
                      />
                      <div
                        role="menu"
                        className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-2xl"
                      >
                        <div className="px-3 py-2">
                          <p className="truncate text-[0.8125rem] font-semibold text-chalk">
                            {user.fullName}
                          </p>
                          <p className="truncate text-[0.75rem] text-fog">{user.email}</p>
                        </div>
                        <div className="my-1 h-px bg-line" />
                        <Link
                          href={`/${locale}/mi-cuenta`}
                          role="menuitem"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] text-mist transition-colors hover:bg-white/5 hover:text-chalk"
                        >
                          <UserIcon className="size-4" aria-hidden="true" />
                          {dict.nav.account}
                        </Link>
                        {user.role === "admin" || user.role === "staff" ? (
                          <Link
                            href={`/${locale}/panel`}
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] text-mist transition-colors hover:bg-white/5 hover:text-chalk"
                          >
                            <LayoutDashboard className="size-4" aria-hidden="true" />
                            {dict.nav.admin}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            void signOut();
                            toast(dict.nav.logout, "info");
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.8125rem] text-mist transition-colors hover:bg-white/5 hover:text-chalk"
                        >
                          <LogOut className="size-4" aria-hidden="true" />
                          {dict.nav.logout}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <ButtonLink
                  href={`/${locale}/ingresar`}
                  variant="ghost"
                  size="sm"
                  className="hidden lg:inline-flex"
                >
                  {dict.nav.login}
                </ButtonLink>
              )}

              <ButtonLink
                href={`/${locale}/horarios`}
                size="sm"
                className="hidden sm:inline-flex"
              >
                <CalendarCheck className="size-4" aria-hidden="true" />
                {dict.cta.book}
              </ButtonLink>

              {/* Botón del menú móvil */}
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={dict.nav.menu}
                className="grid size-10 place-items-center rounded-full border border-line bg-card text-chalk transition-colors hover:border-white/25 lg:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Menú móvil a pantalla completa */}
      <div
        className={cn(
          "fixed inset-0 z-[60] lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-void/95 backdrop-blur-xl transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />

        <div
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-line bg-coal transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between px-5 sm:h-18">
            <Logo locale={locale} name={dict.nav.home} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={dict.nav.close}
              className="grid size-10 place-items-center rounded-full border border-line bg-card text-chalk"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {!hydrated ? (
              <div className="mb-5 h-16 animate-pulse rounded-2xl border border-line bg-card" />
            ) : user ? (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-volt text-[0.75rem] font-bold text-ink">
                  {initials(user.fullName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-semibold text-chalk">
                    {user.fullName}
                  </p>
                  <p className="truncate text-[0.75rem] text-fog">{user.email}</p>
                </div>
              </div>
            ) : null}

            <nav className="flex flex-col gap-1" aria-label={dict.nav.menu}>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium transition-colors",
                    isActive(link)
                      ? "bg-volt/10 text-volt"
                      : "text-mist hover:bg-white/5 hover:text-chalk",
                  )}
                >
                  {link.label}
                </Link>
              ))}

              {user ? (
                <>
                  <Link
                    href={`/${locale}/mi-cuenta`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-mist transition-colors hover:bg-white/5 hover:text-chalk"
                  >
                    <UserIcon className="size-4.5" aria-hidden="true" />
                    {dict.nav.account}
                  </Link>
                  {user.role === "admin" || user.role === "staff" ? (
                    <Link
                      href={`/${locale}/panel`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-mist transition-colors hover:bg-white/5 hover:text-chalk"
                    >
                      <LayoutDashboard className="size-4.5" aria-hidden="true" />
                      {dict.nav.admin}
                    </Link>
                  ) : null}
                </>
              ) : null}
            </nav>

            <div className="mt-6">
              <LanguageSwitcher locale={locale} label={dict.nav.language} variant="menu" />
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <ButtonLink href={`/${locale}/horarios`} size="lg" onClick={() => setOpen(false)}>
                <CalendarCheck className="size-4.5" aria-hidden="true" />
                {dict.cta.book}
              </ButtonLink>

              {!hydrated ? (
                <div className="h-13 animate-pulse rounded-full border border-line bg-card" />
              ) : user ? (
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                    setOpen(false);
                  }}
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-line bg-card text-[0.9375rem] font-semibold text-mist transition-colors hover:border-white/25 hover:text-chalk"
                >
                  <LogOut className="size-4.5" aria-hidden="true" />
                  {dict.nav.logout}
                </button>
              ) : (
                <>
                  <ButtonLink
                    href={`/${locale}/ingresar`}
                    variant="dark"
                    size="lg"
                    onClick={() => setOpen(false)}
                  >
                    {dict.nav.login}
                  </ButtonLink>
                  <ButtonLink
                    href={`/${locale}/registro`}
                    variant="outline"
                    size="lg"
                    onClick={() => setOpen(false)}
                  >
                    {dict.nav.register}
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
