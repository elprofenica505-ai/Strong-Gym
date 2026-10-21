"use client";
import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ACTIVITY,
  DISCLAIMER_ACCEPT_ES,
  DISCLAIMER_ES,
  DISCLAIMER_TITLE,
  GOALS,
  SOURCES_ES,
  type Exercise,
  type MealSlot,
  type RoutineDay,
} from "@/lib/nutrition/plan";

type Results = {
  imc: number;
  imcCategory: string;
  bmr: number;
  get: number;
  kcal: number;
  floorApplied: boolean;
  targetWeightKg: number;
  weeksEstimate: number;
  weeklyRateKg: number;
  weeklyExercise: { aerobicMin: number; strengthDays: number };
  macros: { proteinG: number; fatG: number; carbsG: number };
};
type Plan = {
  goal: string;
  inputs: Inputs;
  results: Results;
  meal_plan: MealSlot[];
  routine: RoutineDay[];
  guide: string[];
  source: "cliente" | "entrenador";
  edited_by_staff: boolean;
  updated_at: string;
  submitted_at: string | null;
};
type Payload = {
  client_id: string;
  client_name: string;
  plan: Plan | null;
  can_edit: boolean;
  can_self_calculate: boolean;
  trainer_tools_enabled?: boolean;
};
type Inputs = {
  sex: "f" | "m";
  age: number;
  weightKg: number;
  heightCm: number;
  activity: number;
  goal: string;
};
type Form = { sex: string; age: string; weightKg: string; heightCm: string; activity: string; goal: string };

const input = "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const button = "rounded-full border border-line px-4 py-2 text-[0.875rem] text-ink hover:border-brand disabled:opacity-50";
const primary = "rounded-full bg-brand px-5 py-2.5 text-[0.9rem] font-semibold text-ink disabled:opacity-50";
const goalLabel = (k: string) => GOALS.find((g) => g.key === k)?.label ?? k;
const formFrom = (i: Inputs | null): Form => ({
  sex: i?.sex ?? "f",
  age: String(i?.age ?? 30),
  weightKg: i ? String(i.weightKg) : "",
  heightCm: i ? String(i.heightCm) : "",
  activity: String(i?.activity ?? 3),
  goal: i?.goal ?? "mantener",
});

/**
 * Calculadora y reporte nutricional y de ejercicio, en un solo flujo.
 * - Cliente (mode "client"): calcula en Mi cuenta y ve el reporte. No edita.
 * - Personal (mode "staff"): calcula, ve el reporte y, si tiene permiso, edita.
 * - Administrador: además cambia el permiso del entrenador por cliente.
 */
export function NutritionCalculator({
  mode,
  clientId,
  isAdmin = false,
}: {
  mode: "client" | "staff";
  clientId?: string;
  isAdmin?: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>(formFrom(null));
  const [editing, setEditing] = useState(false);
  const [meals, setMeals] = useState<MealSlot[]>([]);
  const [routine, setRoutine] = useState<RoutineDay[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const query = mode === "staff" && clientId ? `?client=${encodeURIComponent(clientId)}` : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nutrition${query}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo cargar.");
      const d = body.data as Payload | null;
      setData(d);
      setMeals(d?.plan?.meal_plan ?? []);
      setRoutine(d?.plan?.routine ?? []);
      setForm(formFrom(d?.plan?.inputs ?? null));
      setError(d ? null : "No encontramos tu ficha de cliente. Pedile al administrador que la cree.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: unknown, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "No se pudo guardar. Recargá la página antes de repetir." });
        return false;
      }
      setMessage({ ok: true, text: okText });
      await load();
      return true;
    } catch {
      setMessage({ ok: false, text: "No se pudo guardar. Revisá la conexión y recargá antes de repetir." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="rounded-xl border border-line p-4 text-fog">{error}</p>;
  if (!data) return <p className="text-fog">Cargando calculadora…</p>;

  const plan = data.plan;
  const canCalc = mode === "client" ? data.can_self_calculate : data.can_edit;
  const locked = mode === "client" && !!plan && !data.can_self_calculate;

  const inputsFromForm = (): Inputs => ({
    sex: form.sex === "m" ? "m" : "f",
    age: Number(form.age),
    weightKg: Number(form.weightKg.replace(",", ".")),
    heightCm: Number(form.heightCm.replace(",", ".")),
    activity: Number(form.activity),
    goal: form.goal,
  });

  const calculate = async (e: FormEvent) => {
    e.preventDefault();
    const inputs = inputsFromForm();
    const ok =
      mode === "client"
        ? await post({ action: "self", inputs, acceptDisclaimer: true }, "Listo: calculamos tu plan.")
        : await post({ action: "save", client: data.client_id, inputs }, "Plan calculado y guardado.");
    if (ok) setShowForm(false);
  };

  // Recalcular empieza con el formulario vacío (sin datos del cálculo anterior) y sin aceptación marcada.
  const startRecalc = () => {
    setForm({ sex: "f", age: "", weightKg: "", heightCm: "", activity: "3", goal: "mantener" });
    setAccepted(false);
    setShowForm(true);
  };

  const submitToGym = async () => {
    await post({ action: "submit" }, "Registro guardado en el gimnasio. La meta, la rutina y el peso ya aparecen en la ficha del cliente.");
  };

  const registeredAt = plan?.submitted_at
    ? new Date(plan.submitted_at).toLocaleDateString("es-NI", { timeZone: "America/Managua" })
    : null;

  const saveEdits = async () => {
    if (!plan) return;
    const ok = await post(
      { action: "save", client: data.client_id, inputs: plan.inputs, mealPlan: meals, routine },
      "Cambios guardados.",
    );
    if (ok) setEditing(false);
  };

  const setTrainerTool = (value: boolean) => {
    void post({ action: "tools", client: data.client_id, trainer: value }, "Permiso actualizado.");
  };

  return (
    <div className="grid gap-5">
      <div role="note" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-[0.875rem] leading-relaxed text-ink">
        <strong className="block">{DISCLAIMER_TITLE}</strong>
        <span>{DISCLAIMER_ES}</span>
      </div>

      {message && (
        <p role="status" className={message.ok ? "text-brand-300" : "text-red-300"}>
          {message.text}
        </p>
      )}

      {locked && (
        <p className="rounded-xl border border-line p-4 text-[0.9rem] text-fog">
          Tu entrenador ajustó tu plan. Para recalcularlo, pedile que lo haga o que lo habilite. Mientras tanto, este es tu plan vigente.
        </p>
      )}

      {canCalc && (!plan || showForm) && (
        <form onSubmit={calculate} className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
          <h3 className="text-[1.05rem] font-semibold sm:col-span-2">
            {plan ? "Recalcular" : "Calculá tu plan"}
          </h3>
          <label className="grid gap-1 text-[0.85rem]">
            Nombre
            <input className={input} value={data.client_name} disabled />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Sexo
            <select className={input} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="f">Mujer</option>
              <option value="m">Hombre</option>
            </select>
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Edad (años)
            <input className={input} inputMode="numeric" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Peso (kg)
            <input className={input} inputMode="decimal" required value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Altura (cm)
            <input className={input} inputMode="decimal" required value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Nivel de actividad
            <select className={input} value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}>
              {ACTIVITY.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[0.85rem] sm:col-span-2">
            Objetivo
            <select className={input} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
              {GOALS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </label>
          {mode === "client" && (
            <label className="flex items-start gap-3 text-[0.875rem] sm:col-span-2">
              <input type="checkbox" className="mt-1" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>{DISCLAIMER_ACCEPT_ES}</span>
            </label>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className={primary} disabled={busy || (mode === "client" && !accepted)}>{plan ? "Recalcular y reemplazar" : "Calcular mi plan"}</button>
            {plan && <button type="button" className={button} onClick={() => setShowForm(false)}>Cancelar</button>}
          </div>
          {plan && <p className="text-[0.85rem] text-fog sm:col-span-2">Recalcular reemplaza el plan y la rutina anteriores.</p>}
        </form>
      )}

      {!plan && !canCalc && <p className="text-fog">Todavía no hay un plan calculado.</p>}

      {plan && (
        <section className="grid gap-6 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[1.15rem] font-semibold">Reporte de {data.client_name}</h3>
            <span className="text-[0.8rem] text-fog">
              Objetivo: {goalLabel(plan.goal)} · Calculado {new Date(plan.updated_at).toLocaleDateString("es-NI")} ·{" "}
              {plan.source === "entrenador" ? "ajustado por el entrenador" : "calculado por el cliente"}
            </span>
          </div>

          {mode === "staff" && (
            <p className="text-[0.85rem] text-fog">
              {registeredAt
                ? `Registrado en el gimnasio el ${registeredAt}; su peso y altura ya están en la ficha.`
                : "Pendiente de registro: el cliente todavía no guardó este cálculo en el gimnasio."}
            </p>
          )}

          <div className="grid gap-2">
            <h4 className="font-semibold">1. Resultados</h4>
            <div className="grid grid-cols-2 gap-3 text-[0.9rem] sm:grid-cols-4">
              <Stat label="IMC" value={`${plan.results.imc} (${plan.results.imcCategory})`} />
              <Stat label="Metabolismo basal" value={`${plan.results.bmr} kcal`} />
              <Stat label="Gasto diario" value={`${plan.results.get} kcal`} />
              <Stat label="Calorías para tu objetivo" value={`${plan.results.kcal} kcal`} />
              <Stat label="Peso objetivo" value={`${plan.results.targetWeightKg} kg`} />
              <Stat label="Tiempo estimado" value={plan.results.weeksEstimate > 0 ? `${plan.results.weeksEstimate} semanas (≈ ${plan.results.weeklyRateKg} kg/sem)` : "Sin cambio de peso"} />
            </div>
            <p className="text-[0.8rem] text-fog">
              Peso actual: {plan.inputs.weightKg} kg · Altura: {plan.inputs.heightCm} cm · Edad: {plan.inputs.age} años.
              {plan.results.floorApplied ? " Se usó el mínimo de seguridad de calorías." : ""}
            </p>
          </div>

          <div className="grid gap-3">
            <h4 className="font-semibold">2. Tabla nutricional diaria</h4>
            <div className="overflow-x-auto rounded-lg border border-line/60">
              <table className="w-full min-w-[560px] text-left text-[0.875rem]">
                <thead className="border-b border-line text-fog">
                  <tr>
                    <th className="p-2">Comida</th>
                    <th className="p-2 text-right">Calorías</th>
                    <th className="p-2 text-right">Proteína</th>
                    <th className="p-2 text-right">Carbohidratos</th>
                    <th className="p-2 text-right">Grasa</th>
                    <th className="p-2">Sugerencia</th>
                  </tr>
                </thead>
                <tbody>
                  {(editing ? meals : plan.meal_plan).map((m, i) => (
                    <tr key={m.id} className="border-b border-line/40 align-top">
                      <td className="p-2 font-semibold">{m.title}</td>
                      <td className="p-2 text-right">{m.kcal} kcal</td>
                      <td className="p-2 text-right">{m.proteinG} g</td>
                      <td className="p-2 text-right">{m.carbsG} g</td>
                      <td className="p-2 text-right">{m.fatG} g</td>
                      <td className="p-2">
                        {editing ? (
                          <textarea
                            className={input}
                            rows={2}
                            value={m.text}
                            onChange={(e) => setMeals(meals.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                          />
                        ) : (
                          <span className="text-fog">{m.text}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right">{plan.results.kcal} kcal</td>
                    <td className="p-2 text-right">{plan.results.macros.proteinG} g</td>
                    <td className="p-2 text-right">{plan.results.macros.carbsG} g</td>
                    <td className="p-2 text-right">{plan.results.macros.fatG} g</td>
                    <td className="p-2" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-1">
              <span className="font-semibold">Guía nutricional</span>
              <ul className="list-disc pl-5 text-[0.9rem] text-fog">
                {plan.guide.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3">
            <h4 className="font-semibold">3. Tabla de ejercicio semanal</h4>
            <p className="text-[0.9rem] text-fog">
              Actividad aeróbica: <strong className="text-ink">{plan.results.weeklyExercise.aerobicMin} min por semana</strong>{" "}
              (OMS: 150 a 300 min de intensidad moderada). Fuerza:{" "}
              <strong className="text-ink">{plan.results.weeklyExercise.strengthDays} días por semana</strong> (OMS: 2 o más días).
            </p>
            <div className="overflow-x-auto rounded-lg border border-line/60">
              <table className="w-full min-w-[640px] text-left text-[0.875rem]">
                <thead className="border-b border-line text-fog">
                  <tr>
                    <th className="p-2">Día</th>
                    <th className="p-2">Enfoque</th>
                    <th className="p-2">Ejercicio</th>
                    <th className="p-2">Series</th>
                    <th className="p-2">Repeticiones o tiempo</th>
                    <th className="p-2">Descanso</th>
                    {editing && <th className="p-2" />}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? routine : plan.routine).flatMap((d, di) =>
                    d.exercises.map((ex, ei) => (
                      <tr key={`${d.day}-${ei}`} className="border-b border-line/40 align-top">
                        <td className="p-2 font-semibold">{ei === 0 ? d.day : ""}</td>
                        <td className="p-2 text-fog">{ei === 0 ? d.focus : ""}</td>
                        {editing ? (
                          <>
                            <td className="p-2"><input className={input} aria-label="Ejercicio" value={ex.name} onChange={(e) => updateEx(setRoutine, routine, di, ei, { name: e.target.value })} /></td>
                            <td className="p-2"><input className={input} aria-label="Series" inputMode="numeric" value={ex.sets} onChange={(e) => updateEx(setRoutine, routine, di, ei, { sets: Number(e.target.value) || 0 })} /></td>
                            <td className="p-2"><input className={input} aria-label="Repeticiones" value={ex.reps} onChange={(e) => updateEx(setRoutine, routine, di, ei, { reps: e.target.value })} /></td>
                            <td className="p-2"><input className={input} aria-label="Descanso en segundos" inputMode="numeric" value={ex.restSec} onChange={(e) => updateEx(setRoutine, routine, di, ei, { restSec: Number(e.target.value) || 0 })} /></td>
                            <td className="p-2"><button type="button" className={button} onClick={() => removeEx(setRoutine, routine, di, ei)}>Quitar</button></td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">{ex.name}</td>
                            <td className="p-2">{ex.sets}</td>
                            <td className="p-2">{ex.reps}</td>
                            <td className="p-2">{ex.restSec ? `${ex.restSec} s` : "—"}</td>
                          </>
                        )}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {editing && (
              <button type="button" className={`${button} justify-self-start`} onClick={() => addDay(setRoutine, routine)}>
                + Agregar día de fuerza
              </button>
            )}
          </div>

          <div className="grid gap-1">
            <span className="font-semibold">Fuentes</span>
            <ul className="list-disc pl-5 text-[0.8rem] text-fog">
              {SOURCES_ES.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
          </div>

          {mode === "client" && (
            <div className="grid gap-2 rounded-lg border border-line p-4 text-[0.9rem]">
              {registeredAt ? (
                <p className="text-ink">Registrado en el gimnasio el {registeredAt}. Si recalculás, tendrás que registrarlo de nuevo.</p>
              ) : (
                <p className="text-fog">
                  Este cálculo todavía no está registrado en el gimnasio. Guardalo para que tu entrenador y la administración vean tu peso y altura actualizados.
                </p>
              )}
              <button type="button" className={`${primary} justify-self-start`} onClick={() => void submitToGym()} disabled={busy || !!plan.submitted_at}>
                Guardar registro en gimnasio
              </button>
            </div>
          )}

          {(canCalc || data.can_edit) && (
            <div className="flex flex-wrap gap-3">
              {mode === "staff" && data.can_edit && !editing && (
                <button type="button" className={primary} onClick={() => { setEditing(true); setMeals(plan.meal_plan); setRoutine(plan.routine); }}>Editar plan y rutina</button>
              )}
              {canCalc && !editing && (
                <button type="button" className={button} onClick={startRecalc}>Recalcular con nuevos datos</button>
              )}
              {editing && (
                <>
                  <button type="button" className={primary} onClick={() => void saveEdits()} disabled={busy}>Guardar cambios</button>
                  <button type="button" className={button} onClick={() => { setEditing(false); setMeals(plan.meal_plan); setRoutine(plan.routine); }}>Cancelar</button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {mode === "staff" && isAdmin && (
        <section className="grid gap-3 rounded-xl border border-line p-5">
          <h3 className="font-semibold">Permiso del entrenador asignado</h3>
          <label className="flex items-center gap-3 text-[0.9rem]">
            <input type="checkbox" checked={!!data.trainer_tools_enabled} onChange={(e) => setTrainerTool(e.target.checked)} disabled={busy} />
            El entrenador puede calcular y editar el plan de este cliente
          </label>
        </section>
      )}
    </div>
  );
}

type Setter<T> = Dispatch<SetStateAction<T[]>>;
function updateEx(set: Setter<RoutineDay>, days: RoutineDay[], di: number, ei: number, patch: Partial<Exercise>) {
  set(days.map((d, i) => (i !== di ? d : { ...d, exercises: d.exercises.map((x, j) => (j === ei ? { ...x, ...patch } : x)) })));
}
function removeEx(set: Setter<RoutineDay>, days: RoutineDay[], di: number, ei: number) {
  set(days.map((d, i) => (i !== di ? d : { ...d, exercises: d.exercises.filter((_, j) => j !== ei) })));
}
function addDay(set: Setter<RoutineDay>, days: RoutineDay[]) {
  set([...days, { day: `Fuerza ${days.length + 1}`, focus: "Nuevo enfoque", exercises: [{ name: "Nuevo ejercicio", sets: 3, reps: "10", restSec: 60 }] }]);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 p-3">
      <div className="text-[0.75rem] text-fog">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}
