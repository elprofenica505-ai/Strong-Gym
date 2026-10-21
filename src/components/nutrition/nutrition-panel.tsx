"use client";
import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ACTIVITY,
  DISCLAIMER_ES,
  GOALS,
  type Exercise,
  type MealSlot,
  type RoutineDay,
} from "@/lib/nutrition/plan";

type Plan = {
  goal: string;
  inputs: Record<string, unknown>;
  results: {
    bmr: number;
    tdee: number;
    kcal: number;
    floorApplied: boolean;
    bmi: number;
    macros: { proteinG: number; fatG: number; carbsG: number };
  };
  meal_plan: MealSlot[];
  routine: RoutineDay[];
  updated_at: string;
};
type Payload = {
  client_id: string;
  plan: Plan | null;
  can_edit: boolean;
  trainer_tools_enabled?: boolean;
  cashier_tools_enabled?: boolean;
};

const input = "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const button = "rounded-full border border-line px-4 py-2 text-[0.875rem] text-ink hover:border-brand disabled:opacity-50";
const primary = "rounded-full bg-brand px-5 py-2.5 text-[0.9rem] font-semibold text-ink disabled:opacity-50";

const emptyForm = { sex: "f", age: "30", weightKg: "", heightCm: "", activity: "3", goal: "mantener" };

/**
 * Herramienta de dieta y rutina. El aviso se muestra siempre.
 * Staff con permiso edita; el cliente sólo lee su propio plan.
 * Sólo el administrador ve y cambia los interruptores por cliente.
 */
export function NutritionPanel({
  clientId,
  isAdmin = false,
  isStaff,
}: {
  clientId: string | null;
  isAdmin?: boolean;
  isStaff: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [meals, setMeals] = useState<MealSlot[]>([]);
  const [routine, setRoutine] = useState<RoutineDay[]>([]);
  const [editing, setEditing] = useState(false);
  const [recalc, setRecalc] = useState(false);

  const query = clientId ? `?client=${encodeURIComponent(clientId)}` : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nutrition${query}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo cargar.");
      const d = body.data as Payload | null;
      setData(d);
      setMeals(d?.plan?.meal_plan ?? []);
      setRoutine(d?.plan?.routine ?? []);
      setError(null);
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
        setMessage(body.error ?? "No se pudo guardar.");
        return false;
      }
      setMessage(okText);
      await load();
      return true;
    } catch {
      setMessage("No se pudo guardar. Revisá la conexión y recargá antes de repetir.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="rounded-xl border border-line p-4 text-fog">{error}</p>;
  if (!data) return <p className="text-fog">Cargando herramienta…</p>;

  const canEdit = data.can_edit && !!clientId;
  const plan = data.plan;

  const submitCalc = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) return;
    const inputs = {
      sex: form.sex,
      age: Number(form.age),
      weightKg: Number(form.weightKg.replace(",", ".")),
      heightCm: Number(form.heightCm.replace(",", ".")),
      activity: Number(form.activity),
      goal: form.goal,
    };
    const ok = await post({ action: "save", client: clientId, inputs }, "Plan calculado y guardado.");
    if (ok) setRecalc(false);
  };

  const saveEdits = async () => {
    if (!clientId || !plan) return;
    const ok = await post(
      {
        action: "save",
        client: clientId,
        inputs: plan.inputs,
        mealPlan: meals,
        routine,
      },
      "Cambios guardados.",
    );
    if (ok) setEditing(false);
  };

  const setTools = (key: "trainer" | "cashier", value: boolean) => {
    if (!clientId || !data) return;
    const trainer = key === "trainer" ? value : !!data.trainer_tools_enabled;
    const cashier = key === "cashier" ? value : !!data.cashier_tools_enabled;
    void post({ action: "tools", client: clientId, trainer, cashier }, "Permisos actualizados.");
  };

  return (
    <div className="grid gap-5">
      <p role="note" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-[0.875rem] leading-relaxed text-ink">
        <strong>Aviso:</strong> {DISCLAIMER_ES}
      </p>

      {message && <p role="status" className="text-brand-300">{message}</p>}

      {!plan && !canEdit && (
        <p className="text-fog">Todavía no hay un plan para este cliente.</p>
      )}

      {!plan && canEdit && (
        <form onSubmit={submitCalc} className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
          <h3 className="text-[1.05rem] font-semibold sm:col-span-2">Calcular plan</h3>
          <CalcFields form={form} setForm={setForm} />
          <button type="submit" className={primary} disabled={busy}>Calcular y guardar</button>
        </form>
      )}

      {plan && (
        <section className="grid gap-4 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[1.05rem] font-semibold">
              Objetivo: {GOALS.find((g) => g.key === plan.goal)?.label ?? plan.goal}
            </h3>
            <span className="text-[0.8rem] text-fog">
              Actualizado {new Date(plan.updated_at).toLocaleDateString("es-NI")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[0.9rem] sm:grid-cols-5">
            <Stat label="Calorías/día" value={`${plan.results.kcal} kcal`} />
            <Stat label="Proteína" value={`${plan.results.macros.proteinG} g`} />
            <Stat label="Grasa" value={`${plan.results.macros.fatG} g`} />
            <Stat label="Carbohidratos" value={`${plan.results.macros.carbsG} g`} />
            <Stat label="IMC" value={String(plan.results.bmi)} />
          </div>
          {plan.results.floorApplied && (
            <p className="text-[0.85rem] text-fog">
              Se usó el mínimo de seguridad de calorías. Para reducir más, consultá con un profesional.
            </p>
          )}

          <div className="grid gap-2">
            <h4 className="font-semibold">Plan de comidas (orientativo)</h4>
            {(editing ? meals : plan.meal_plan).map((m, i) => (
              <div key={m.id} className="grid gap-1 text-[0.9rem]">
                <span className="font-semibold">{m.title}</span>
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
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <h4 className="font-semibold">Rutina</h4>
            {(editing ? routine : plan.routine).map((d, di) => (
              <div key={d.day} className="grid gap-2 rounded-lg border border-line/60 p-3">
                <span className="font-semibold">{d.day} · {d.focus}</span>
                {d.exercises.map((ex, ei) =>
                  editing ? (
                    <div key={ei} className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_5rem_auto]">
                      <input className={input} aria-label="Ejercicio" value={ex.name} onChange={(e) => updateEx(setRoutine, routine, di, ei, { name: e.target.value })} />
                      <input className={input} aria-label="Series" inputMode="numeric" value={ex.sets} onChange={(e) => updateEx(setRoutine, routine, di, ei, { sets: Number(e.target.value) || 0 })} />
                      <input className={input} aria-label="Repeticiones" value={ex.reps} onChange={(e) => updateEx(setRoutine, routine, di, ei, { reps: e.target.value })} />
                      <input className={input} aria-label="Descanso en segundos" inputMode="numeric" value={ex.restSec} onChange={(e) => updateEx(setRoutine, routine, di, ei, { restSec: Number(e.target.value) || 0 })} />
                      <button type="button" className={button} onClick={() => removeEx(setRoutine, routine, di, ei)}>Quitar</button>
                    </div>
                  ) : (
                    <span key={ei} className="text-[0.9rem] text-fog">
                      {ex.name}: {ex.sets} × {ex.reps}{ex.restSec ? ` · descanso ${ex.restSec} s` : ""}
                    </span>
                  ),
                )}
                {editing && (
                  <button type="button" className={`${button} justify-self-start`} onClick={() => addEx(setRoutine, routine, di)}>
                    + Ejercicio
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-3">
              {!editing ? (
                <>
                  <button type="button" className={primary} onClick={() => { setEditing(true); setMeals(plan.meal_plan); setRoutine(plan.routine); }}>Editar plan y rutina</button>
                  <button type="button" className={button} onClick={() => setRecalc((v) => !v)}>Recalcular con nuevos datos</button>
                </>
              ) : (
                <>
                  <button type="button" className={primary} onClick={() => void saveEdits()} disabled={busy}>Guardar cambios</button>
                  <button type="button" className={button} onClick={() => { setEditing(false); setMeals(plan.meal_plan); setRoutine(plan.routine); }}>Cancelar</button>
                </>
              )}
            </div>
          )}

          {canEdit && recalc && (
            <form onSubmit={submitCalc} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
              <CalcFields form={form} setForm={setForm} />
              <p className="text-[0.85rem] text-fog sm:col-span-2">Recalcular reemplaza el plan y la rutina anteriores.</p>
              <button type="submit" className={primary} disabled={busy}>Recalcular y reemplazar</button>
            </form>
          )}
        </section>
      )}

      {isAdmin && isStaff && clientId && (
        <section className="grid gap-3 rounded-xl border border-line p-5">
          <h3 className="font-semibold">Permisos para este cliente</h3>
          <label className="flex items-center gap-3 text-[0.9rem]">
            <input type="checkbox" checked={!!data.trainer_tools_enabled} onChange={(e) => setTools("trainer", e.target.checked)} disabled={busy} />
            El entrenador asignado puede calcular y editar el plan
          </label>
          <label className="flex items-center gap-3 text-[0.9rem]">
            <input type="checkbox" checked={!!data.cashier_tools_enabled} onChange={(e) => setTools("cashier", e.target.checked)} disabled={busy} />
            Caja puede calcular y editar el plan
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
function addEx(set: Setter<RoutineDay>, days: RoutineDay[], di: number) {
  set(days.map((d, i) => (i !== di ? d : { ...d, exercises: [...d.exercises, { name: "Nuevo ejercicio", sets: 3, reps: "10", restSec: 60 }] })));
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 p-3">
      <div className="text-[0.75rem] text-fog">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

function CalcFields({
  form,
  setForm,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
}) {
  return (
    <>
      <label className="grid gap-1 text-[0.85rem]">
        Sexo
        <select className={input} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
          <option value="f">Mujer</option>
          <option value="m">Hombre</option>
        </select>
      </label>
      <label className="grid gap-1 text-[0.85rem]">
        Edad
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
        Actividad
        <select className={input} value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}>
          {ACTIVITY.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[0.85rem]">
        Objetivo
        <select className={input} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
          {GOALS.map((g) => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
        </select>
      </label>
    </>
  );
}
