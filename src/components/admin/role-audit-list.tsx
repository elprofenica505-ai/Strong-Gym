import { ClipboardList } from "lucide-react";
import type { RoleAuditItem } from "@/lib/admin/role-audit";

/** Últimos cambios de rol. Sólo lectura: cada cambio ya quedó registrado en la base. */
export function RoleAuditList({ items }: { items: RoleAuditItem[] }) {
  return (
    <section aria-labelledby="bitacora-titulo" className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
          <ClipboardList className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="bitacora-titulo" className="text-xl font-bold">Bitácora de roles</h2>
          <p className="text-sm text-fog">Últimos 100 cambios. Sólo lectura.</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fog">
          Todavía no hay cambios de rol registrados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-fog">
              <tr>
                <th scope="col" className="p-2 font-medium">Fecha</th>
                <th scope="col" className="p-2 font-medium">Persona</th>
                <th scope="col" className="p-2 font-medium">Cambio</th>
                <th scope="col" className="p-2 font-medium">Hecho por</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="p-2 whitespace-nowrap">{i.at}</td>
                  <td className="p-2">{i.person}</td>
                  <td className="p-2">{i.from} → {i.to}</td>
                  <td className="p-2">{i.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
