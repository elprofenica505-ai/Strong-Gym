import { MEASURE_SITES, BMI_LABEL, GOAL_TYPES, bmi, bmiCategory, healthyWeightRange, reviewDates } from "@/lib/progress/rules";
import type { ClientProgress } from "@/lib/data/progress-queries";

type MyProgressData = Omit<ClientProgress, "clientId">;

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Progreso propio del cliente: sólo lectura. No es consejo médico. */
export function MyProgress({ data }: { data: MyProgressData | null }) {
  const latest = data?.measurements[0] ?? null;
  const height = data?.measurements.find(m => m.heightCm)?.heightCm ?? null;
  const index = latest ? bmi(latest.weightKg, height) : null;

  return (
    <section id="mi-progreso" className="flex flex-col gap-6">
      <div>
        <h2 className="text-[1.25rem] font-bold text-ink">Mi progreso</h2>
        <p className="text-[0.875rem] text-mist">Tus medidas, tu meta y tu rutina. Las registra el personal del gimnasio.</p>
      </div>

      {!latest ? (
        <div className="rounded-2xl border border-line bg-card p-6 text-[0.9375rem] text-mist">
          Todavía no hay medidas registradas para tu cuenta. Pregunta en recepción en tu próxima visita.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Peso actual" value={`${latest.weightKg} kg`} hint={`Medido el ${fmtDay(latest.measuredOn)}`} />
            <Stat label="Altura" value={height ? `${height} cm` : "Sin registrar"} hint={height ? "Último dato registrado" : "Se registra en tu siguiente medición"} />
            <Stat
              label="Índice de masa corporal (IMC)"
              value={index !== null ? index.toFixed(1) : "—"}
              hint={index !== null && height
                ? `${BMI_LABEL[bmiCategory(index)]}. Peso sano para tu altura: ${healthyWeightRange(height).join(" a ")} kg`
                : "Hace falta la altura para calcularlo"}
            />
          </div>

          <div className="rounded-2xl border border-line bg-card p-6">
            <h3 className="text-[1.0625rem] font-semibold text-ink">Últimas circunferencias</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {MEASURE_SITES.map(site => {
                const v = latest.values[site.key];
                return (
                  <div key={site.key} className="flex justify-between gap-2 border-b border-line/60 py-1 text-[0.875rem]">
                    <dt className="text-mist">{site.label}</dt>
                    <dd className="font-medium text-ink">{v !== null ? `${v} cm` : "—"}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-[0.75rem] text-mist">Un guion (—) significa que esa medida no se tomó en esa visita.</p>
          </div>

          {data?.goal && (
            <div className="rounded-2xl border border-line bg-card p-6">
              <h3 className="text-[1.0625rem] font-semibold text-ink">Mi meta</h3>
              <p className="mt-2 text-[0.9375rem] text-ink">
                {data.goal.goalType === "otra" && data.goal.otherLabel ? data.goal.otherLabel : GOAL_TYPES.find(g => g.key === data.goal?.goalType)?.label}
                {data.goal.targetWeightKg !== null && data.goal.goalType !== "mantenimiento" ? `: llegar a ${data.goal.targetWeightKg} kg` : ""}
              </p>
              <p className="mt-1 text-[0.875rem] text-mist">
                Del {fmtDay(data.goal.startsOn)} al {fmtDay(data.goal.targetDate)}. Revisión cada 3 meses
                {reviewDates(data.goal.startsOn, data.goal.targetDate).length
                  ? `: ${reviewDates(data.goal.startsOn, data.goal.targetDate).map(fmtDay).join(", ")}`
                  : ""}.
              </p>
            </div>
          )}

          {data?.routine && (
            <div className="rounded-2xl border border-line bg-card p-6">
              <h3 className="text-[1.0625rem] font-semibold text-ink">Mi rutina: {data.routine.name}</h3>
              {data.routine.days.length > 0 && (
                <p className="mt-1 text-[0.875rem] text-mist">Días: {data.routine.days.join(", ")}</p>
              )}
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.9375rem] text-ink">
                {data.routine.exercises.map((e, i) => {
                  const detail = [
                    e.series ? `${e.series} series` : null,
                    e.reps ? `${e.reps} repeticiones` : null,
                    e.descanso_s ? `${e.descanso_s} s de descanso` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={i}>
                      {e.ejercicio}
                      {detail && <span className="text-mist"> · {detail}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-card p-6">
            <h3 className="text-[1.0625rem] font-semibold text-ink">Historial de peso</h3>
            <table className="mt-3 w-full text-left text-[0.875rem]">
              <thead className="text-mist">
                <tr><th className="py-1 font-medium">Fecha</th><th className="py-1 font-medium">Peso</th></tr>
              </thead>
              <tbody className="text-ink">
                {data!.measurements.slice(0, 12).map(m => (
                  <tr key={m.measuredOn + m.weightKg} className="border-t border-line/60">
                    <td className="py-1.5">{fmtDay(m.measuredOn)}</td>
                    <td className="py-1.5">{m.weightKg} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[0.75rem] leading-relaxed text-mist">
        Esta información es para seguimiento del entrenamiento. No reemplaza la valoración de un médico o nutricionista.
      </p>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-[0.8125rem] text-mist">{label}</p>
      <p className="mt-1 text-[1.5rem] font-bold text-ink">{value}</p>
      <p className="mt-1 text-[0.75rem] text-mist">{hint}</p>
    </div>
  );
}
