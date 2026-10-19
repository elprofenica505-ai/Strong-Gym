import { UserCog } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  trainer: "Entrenador",
  cashier: "Caja",
  admin: "Administración",
};

/**
 * Lista de personal, separada de Clientes. Sólo nombre y rol: el personal no tiene
 * ficha de cliente, no aparece en búsquedas y no tiene pase ni reservas.
 */
export function StaffDirectory({ staff }: { staff: { id: string; fullName: string; role: string }[] }) {
  return (
    <section aria-labelledby="personal-titulo" className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
            <UserCog className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="personal-titulo" className="text-xl font-bold">Personal</h2>
            <p className="text-sm text-fog">Cuentas del equipo. No son clientes.</p>
          </div>
        </div>
        <p className="text-sm text-fog">{staff.length} {staff.length === 1 ? "persona" : "personas"}</p>
      </div>
      {staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fog">
          Todavía no hay personal con rol asignado.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
              <span className="truncate font-semibold text-ink">{p.fullName || "Sin nombre"}</span>
              <span className="shrink-0 rounded-full bg-cloud px-2.5 py-1 text-[0.6875rem] font-semibold text-mist">
                {ROLE_LABEL[p.role] ?? p.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
