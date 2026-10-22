import type { NameMaps } from "@/lib/reports/finance-report";

const ENDPOINT = "/api/admin/reportes/exportar";

const field = "mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[0.875rem] text-ink focus:border-brand focus:outline-none";
const label = "block text-[0.8125rem] font-medium text-mist";

function byName(entries: Record<string, string>): [string, string][] {
  return Object.entries(entries).sort((a, b) => a[1].localeCompare(b[1], "es"));
}

/**
 * Exportación completa con filtros. Es un formulario GET normal: sin JavaScript,
 * el navegador descarga el archivo con el rango y los filtros elegidos.
 */
export function ReportExportForm({ maps, today }: { maps: NameMaps; today: string }) {
  const methods = Object.entries(maps.methods).map(([id, m]) => [id, m.name] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], "es"));
  return (
    <form method="get" action={ENDPOINT} className="rounded-2xl border border-line bg-cloud p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Desde
          <input type="date" name="from" max={today} className={field} />
        </label>
        <label className={label}>
          Hasta
          <input type="date" name="to" max={today} className={field} />
        </label>
        <label className={label}>
          Tipo
          <select name="kind" defaultValue="all" className={field}>
            <option value="all">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Egresos</option>
          </select>
        </label>
        <label className={label}>
          Estado
          <select name="status" defaultValue="all" className={field}>
            <option value="all">Todos</option>
            <option value="completed">Completados</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Anulados</option>
          </select>
        </label>
        <label className={label}>
          Método de pago
          <select name="method" defaultValue="" className={field}>
            <option value="">Todos</option>
            {methods.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Categoría
          <select name="category" defaultValue="" className={field}>
            <option value="">Todas</option>
            {byName(maps.categories).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Cuenta
          <select name="account" defaultValue="" className={field}>
            <option value="">Todas</option>
            {byName(maps.accounts).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Cliente
          <select name="client" defaultValue="" className={field}>
            <option value="">Todos</option>
            {byName(maps.clients).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[0.8125rem] text-fog">
          Se exporta todo lo que cumple los filtros, no sólo lo que ves en pantalla. Los montos salen en córdobas con el equivalente guardado en cada movimiento.
          Las fechas usan el día de Managua.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="format" value="xlsx" className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-brand-600">
            Descargar Excel
          </button>
          <button type="submit" name="format" value="csv" className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-[0.8125rem] text-ink hover:border-fog">
            Descargar CSV
          </button>
        </div>
      </div>
    </form>
  );
}
