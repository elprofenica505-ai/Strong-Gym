import { ReloadButton } from "@/components/ui/reload-button";

/** Seguro para SSR: sin detalles SQL ni información personal. */
export function DataUnavailable({
  locale,
  code,
}: {
  locale: string;
  code: string;
}) {
  const es = locale !== "en";
  return (
    <div
      role="alert"
      className="my-6 rounded-2xl border border-alert/40 bg-card p-5 text-sm text-mist"
    >
      <h2 className="font-semibold text-ink">
        {es
          ? "No pudimos confirmar estos datos"
          : "We could not verify this data"}
      </h2>
      <p className="my-3">
        {es
          ? "No significa que no haya registros ni que existan cupos disponibles. Reintentá la consulta; no se enviará ninguna operación."
          : "This does not mean there are no records or that spots are available. Retry the query; no operation will be submitted."}
      </p>
      <p className="mb-3 break-all font-mono text-xs text-fog">{code}</p>
      <ReloadButton label={es ? "Reintentar consulta" : "Retry query"} />
    </div>
  );
}
