"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Dumbbell,
  LayoutDashboard,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { LinkPending } from "@/components/ui/link-pending";
import { activeModuleId, type PanelModule } from "@/lib/admin/modules";
import { cn } from "@/lib/utils";

const ICONS = {
  inicio: LayoutDashboard,
  clientes: Users,
  finanzas: Wallet,
  operacion: CalendarCheck,
  administracion: Settings2,
  entrenador: Dumbbell,
} as const;

/**
 * Navegación de módulos del panel de gestión. Se oculta al imprimir.
 * Recibe los módulos ya filtrados por rol desde el servidor.
 */
export function PanelNav({ modules }: { modules: PanelModule[] }) {
  const { locale } = useDictionary();
  const pathname = usePathname() ?? "";
  const localePrefix = `/${locale}`;
  const relative = pathname.startsWith(localePrefix)
    ? pathname.slice(localePrefix.length) || "/"
    : pathname;

  if (modules.length === 0) return null;

  const activeId = activeModuleId(relative, modules);
  const active = modules.find((m) => m.id === activeId) ?? null;

  return (
    <div className="print:hidden border-b border-line bg-paper">
      <div className="container-x">
        <nav aria-label="Módulos del panel" className="grid grid-cols-3 gap-1.5 py-2 sm:flex sm:flex-wrap sm:gap-1">
          {modules.map((m) => {
            const Icon = ICONS[m.id];
            const isActive = m.id === activeId;
            return (
              <Link
                key={m.id}
                href={`${localePrefix}${m.href}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center text-[0.6875rem] leading-tight font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3.5 sm:text-[0.8125rem]",
                  isActive
                    ? "bg-brand text-onbrand"
                    : "text-mist hover:bg-cloud hover:text-ink",
                )}
              >
                <Icon className="size-5 shrink-0 sm:size-4" aria-hidden="true" />
                <span className="break-words">{m.label}</span>
                <LinkPending label={`Abriendo ${m.label}…`} />
              </Link>
            );
          })}
        </nav>

        {active && active.children.length > 0 ? (
          <nav
            aria-label={`Secciones de ${active.label}`}
            className="flex flex-wrap gap-2 border-t border-line/60 py-2"
          >
            {active.children.map((child) => {
              const isChildActive =
                relative === child.href || relative.startsWith(child.href + "/");
              return (
                <Link
                  key={child.id}
                  href={`${localePrefix}${child.href}`}
                  aria-current={isChildActive ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors",
                    isChildActive
                      ? "border-brand bg-brand/10 text-brand-300"
                      : "border-line text-fog hover:border-brand/40 hover:text-ink",
                  )}
                >
                  {child.label}
                  <LinkPending label={`Abriendo ${child.label}…`} />
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

