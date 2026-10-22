import type { StaffAuditItem } from "@/lib/admin/staff";

/** Bitácora de personal. Sólo lectura: muestra quién, qué acción y qué campos, nunca sus valores. */
export function StaffAuditList({ items }: { items: StaffAuditItem[] }) {
  return (
    <section className="mt-12" aria-labelledby="staff-audit-heading">
      <h2 id="staff-audit-heading" className="text-[1.25rem] font-bold text-ink">Bitácora de personal</h2>
      <p className="mt-1 text-[0.875rem] text-mist">Últimos 100 movimientos. Se muestran los nombres de los campos, no sus valores.</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center text-[0.875rem] text-fog">
          Todavía no hay movimientos en la ficha del personal.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[36rem] text-left text-[0.875rem]">
            <thead className="bg-cloud text-[0.6875rem] font-semibold tracking-[0.12em] text-fog uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Persona</th>
                <th scope="col" className="px-4 py-3">Acción</th>
                <th scope="col" className="px-4 py-3">Detalle</th>
                <th scope="col" className="px-4 py-3">Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} className="bg-card">
                  <td className="px-4 py-3 whitespace-nowrap text-fog">{item.at}</td>
                  <td className="px-4 py-3 text-ink">{item.person}</td>
                  <td className="px-4 py-3 text-mist">{item.action}</td>
                  <td className="px-4 py-3 text-mist">{item.detail}</td>
                  <td className="px-4 py-3 text-mist">{item.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
