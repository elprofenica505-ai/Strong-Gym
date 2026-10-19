import type { ReactNode } from "react";
import { PanelNav } from "@/components/admin/panel-nav";
import { visibleModules } from "@/lib/admin/modules";
import { getCurrentUser } from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";

/**
 * Cáscara común de los módulos de gestión. Muestra sólo los módulos que el
 * rol puede usar. Cada página sigue validando el acceso por su cuenta.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const modules = visibleModules(user?.role, DEMO_MODE);
  return (
    <>
      <PanelNav modules={modules} />
      {children}
    </>
  );
}
