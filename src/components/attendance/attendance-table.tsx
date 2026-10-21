import { fillMonths, fillWeeks, monthLabel, weekLabel, type AttendanceData } from "@/lib/attendance/summary";

const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Tabla de asistencia por semana y por mes. Sólo lectura. */
export function AttendanceTable({ data, title = "Asistencia" }: { data: AttendanceData | null; title?: string }) {
  if (!data) {
    return (
      <section id="asistencia" className="rounded-2xl border border-line bg-card p-4 scroll-mt-24">
        <h2 className="mb-2 text-lg font-bold text-ink">{title}</h2>
        <p className="text-[0.875rem] text-mist">No hay asistencia para mostrar en este momento.</p>
      </section>
    );
  }
  const weeks = fillWeeks(data.weeks, data.today, 12);
  const months = fillMonths(data.months, data.today, 12);
  const maxWeek = Math.max(1, ...weeks.map(w => w.visits));
  const maxMonth = Math.max(1, ...months.map(m => m.visits));

  return (
    <section id="asistencia" className="scroll-mt-24 flex flex-col gap-4 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-bold text-ink">{title}</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Visitas en total" value={String(data.totalVisits)} />
        <Stat label="Últimos 30 días" value={String(data.visits30Days)} />
        <Stat label="Última visita" value={data.lastVisit ? fmtDay(data.lastVisit) : "Sin visitas"} />
      </div>

      <details open className="rounded-xl border border-line/70 p-3">
        <summary className="cursor-pointer font-semibold text-ink">Por semana (últimas 12)</summary>
        <table className="mt-3 w-full text-left text-[0.875rem]">
          <thead className="text-mist"><tr><th className="py-1 font-medium">Semana</th><th className="py-1 font-medium">Visitas</th></tr></thead>
          <tbody className="text-ink">
            {weeks.map(w => (
              <tr key={w.weekStart} className="border-t border-line/60">
                <td className="py-1.5">{weekLabel(w.weekStart)}</td>
                <td className="py-1.5">
                  <span className="inline-block h-2 rounded bg-brand" style={{ width: `${(w.visits / maxWeek) * 120}px` }} aria-hidden="true" />
                  <span className="ml-2">{w.visits}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="rounded-xl border border-line/70 p-3">
        <summary className="cursor-pointer font-semibold text-ink">Por mes (últimos 12)</summary>
        <table className="mt-3 w-full text-left text-[0.875rem]">
          <thead className="text-mist"><tr><th className="py-1 font-medium">Mes</th><th className="py-1 font-medium">Visitas</th></tr></thead>
          <tbody className="text-ink">
            {months.map(m => (
              <tr key={m.month} className="border-t border-line/60">
                <td className="py-1.5">{monthLabel(m.month)}</td>
                <td className="py-1.5">
                  <span className="inline-block h-2 rounded bg-brand" style={{ width: `${(m.visits / maxMonth) * 120}px` }} aria-hidden="true" />
                  <span className="ml-2">{m.visits}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="rounded-xl border border-line/70 p-3">
        <summary className="cursor-pointer font-semibold text-ink">Días de visita (últimos 60)</summary>
        {data.days.length === 0 ? (
          <p className="mt-2 text-[0.875rem] text-mist">Sin visitas en los últimos 60 días.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2 text-[0.8125rem] text-ink">
            {data.days.map(d => <li key={d} className="rounded-full border border-line px-2.5 py-0.5">{fmtDay(d)}</li>)}
          </ul>
        )}
      </details>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[0.8125rem] text-mist">{label}</p>
      <p className="mt-1 text-[1.25rem] font-bold text-ink">{value}</p>
    </div>
  );
}
