"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MEASURE_SITES, GOAL_TYPES } from "@/lib/progress/rules";
import { DAY_KEYS } from "@/lib/progress/forms";
import { confirmationLabel } from "@/lib/progress/forms";

const input = "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const label = "grid gap-1 text-sm text-fog";
const primary = "rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-onbrand disabled:opacity-60";
const card = "min-w-0 space-y-4 rounded-2xl border border-line bg-card p-4";

type Notice = { tone: "ok" | "error" | "warn"; text: string } | null;

async function send(body: unknown): Promise<{ ok: boolean; status: number; message: string; fields?: string[] }> {
  const res = await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; fields?: string[] };
  return { ok: res.ok, status: res.status, message: json.message ?? "No se pudo guardar.", fields: json.fields };
}

export function ProgressForms({
  clientId, canRecord, canManage, today, maxTargetDate,
}: {
  clientId: string;
  canRecord: boolean;
  canManage: boolean;
  today: string;
  maxTargetDate: string;
}) {
  return (
    <div className="grid gap-6">
      {canRecord && <MeasurementForm clientId={clientId} today={today} />}
      {canManage && <GoalForm clientId={clientId} today={today} maxTargetDate={maxTargetDate} />}
      {canManage && <RoutineForm clientId={clientId} />}
    </div>
  );
}

function MeasurementForm({ clientId, today }: { clientId: string; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<{ body: Record<string, unknown>; fields: string[] } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>, confirmed = false) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    for (const s of MEASURE_SITES) values[s.key] = String(form.get(s.key) ?? "");
    const body = {
      action: "measurement",
      clientId,
      confirmed,
      data: {
        measuredOn: String(form.get("measuredOn") ?? ""),
        weightKg: String(form.get("weightKg") ?? ""),
        heightCm: String(form.get("heightCm") ?? ""),
        notes: String(form.get("notes") ?? ""),
        values,
      },
    };
    setBusy(true);
    const r = await send(body);
    setBusy(false);
    if (r.status === 409 && r.fields) {
      setPending({ body, fields: r.fields });
      setNotice({ tone: "warn", text: r.message });
      return;
    }
    if (!r.ok) { setNotice({ tone: "error", text: r.message }); return; }
    setPending(null);
    setNotice({ tone: "ok", text: "Medición guardada. Queda en el historial y no se puede editar." });
    (e.currentTarget as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <section className={card} aria-labelledby="medicion-titulo">
      <h2 id="medicion-titulo" className="text-lg font-bold text-ink">Registrar medición</h2>
      <p className="text-sm text-fog">
        Una medida que no tomaste, déjala vacía. No pongas cero. Las mediciones no se editan: si te equivocaste,
        registra una nueva.
      </p>
      <form onSubmit={(e) => submit(e, false)} className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Fecha
          <input className={input} type="date" name="measuredOn" defaultValue={today} max={today} required />
        </label>
        <label className={label}>Peso (kg)
          <input className={input} name="weightKg" inputMode="decimal" required />
        </label>
        <label className={label}>Altura (cm), opcional
          <input className={input} name="heightCm" inputMode="decimal" />
        </label>
        {MEASURE_SITES.map((s) => (
          <label key={s.key} className={label}>{s.label} (cm)
            <input className={input} name={s.key} inputMode="decimal" />
          </label>
        ))}
        <label className={`${label} sm:col-span-2`}>Notas (opcional)
          <input className={input} name="notes" maxLength={300} />
        </label>
        {pending && (
          <div className="sm:col-span-2 rounded-lg border border-line bg-paper p-3 text-sm text-ink">
            <p className="mb-2">Revisá estos valores. Están fuera del rango habitual:</p>
            <ul className="mb-3 list-disc pl-5 text-fog">
              {pending.fields.map((f) => <li key={f}>{confirmationLabel(f)}</li>)}
            </ul>
            <button type="button" disabled={busy} className={primary}
              onClick={async () => {
                setBusy(true);
                const r = await send({ ...pending.body, confirmed: true });
                setBusy(false);
                if (!r.ok) { setNotice({ tone: "error", text: r.message }); return; }
                setPending(null);
                setNotice({ tone: "ok", text: "Medición guardada con los valores confirmados." });
                router.refresh();
              }}>
              Confirmo que los valores son correctos
            </button>
          </div>
        )}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className={primary}>{busy ? "Guardando…" : "Guardar medición"}</button>
          <Feedback notice={notice} />
        </div>
      </form>
    </section>
  );
}

function GoalForm({ clientId, today, maxTargetDate }: { clientId: string; today: string; maxTargetDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [type, setType] = useState<string>("perdida");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await send({
      action: "goal",
      clientId,
      data: {
        goalType: type,
        otherLabel: String(f.get("otherLabel") ?? ""),
        startsOn: String(f.get("startsOn") ?? ""),
        targetDate: String(f.get("targetDate") ?? ""),
        targetWeightKg: String(f.get("targetWeightKg") ?? ""),
      },
    });
    setBusy(false);
    if (!r.ok) { setNotice({ tone: "error", text: r.message }); return; }
    setNotice({ tone: "ok", text: "Meta guardada. La anterior quedó cancelada y sigue en el historial." });
    router.refresh();
  }

  return (
    <section className={card} aria-labelledby="meta-titulo">
      <h2 id="meta-titulo" className="text-lg font-bold text-ink">Meta activa</h2>
      <p className="text-sm text-fog">Plazo máximo de 12 meses. Revisión cada 3 meses. Una sola meta activa por cliente.</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Tipo de meta
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            {GOAL_TYPES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        {type === "otra" && (
          <label className={label}>Describe la meta
            <input className={input} name="otherLabel" maxLength={120} required minLength={3} />
          </label>
        )}
        <label className={label}>Inicio
          <input className={input} type="date" name="startsOn" defaultValue={today} required />
        </label>
        <label className={label}>Fecha límite (máximo 12 meses)
          <input className={input} type="date" name="targetDate" max={maxTargetDate} required />
        </label>
        {type !== "otra" && (
          <label className={label}>Peso objetivo (kg)
            <input className={input} name="targetWeightKg" inputMode="decimal" required />
          </label>
        )}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className={primary}>{busy ? "Guardando…" : "Guardar meta"}</button>
          <Feedback notice={notice} />
        </div>
      </form>
    </section>
  );
}

function RoutineForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [days, setDays] = useState<string[]>([]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await send({
      action: "routine",
      clientId,
      name: String(f.get("name") ?? ""),
      days,
      exercisesText: String(f.get("exercises") ?? ""),
    });
    setBusy(false);
    if (!r.ok) { setNotice({ tone: "error", text: r.message }); return; }
    setNotice({ tone: "ok", text: "Rutina asignada. La anterior quedó cerrada con fecha de fin." });
    router.refresh();
  }

  return (
    <section className={card} aria-labelledby="rutina-titulo">
      <h2 id="rutina-titulo" className="text-lg font-bold text-ink">Rutina</h2>
      <p className="text-sm text-fog">Una línea por ejercicio: <span className="font-mono">Nombre; series; repeticiones; descanso en segundos</span>. Ejemplo: <span className="font-mono">Sentadilla; 4; 8; 90</span>.</p>
      <form onSubmit={submit} className="grid gap-3">
        <label className={label}>Nombre de la rutina
          <input className={input} name="name" minLength={2} maxLength={80} required />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm text-fog">Días</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((d) => (
              <label key={d} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-ink">
                <input type="checkbox" checked={days.includes(d)}
                  onChange={(e) => setDays((prev) => e.target.checked ? [...prev, d] : prev.filter((x) => x !== d))} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>Ejercicios
          <textarea className={`${input} min-h-32 font-mono`} name="exercises" required />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy || days.length === 0} className={primary}>{busy ? "Guardando…" : "Asignar rutina"}</button>
          <Feedback notice={notice} />
        </div>
      </form>
    </section>
  );
}

function Feedback({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone = notice.tone === "ok" ? "text-brand-300" : notice.tone === "warn" ? "text-fog" : "text-alert";
  return <p role={notice.tone === "error" ? "alert" : "status"} className={`text-sm ${tone}`}>{notice.text}</p>;
}


/** Solo administrador: corrige la altura de la ficha. Queda registrada con motivo. */
export function HeightCorrectionForm({ clientId, currentHeight }: { clientId: string; currentHeight: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await send({
      action: "height_correct",
      clientId,
      heightCm: Number(String(f.get("heightCm") ?? "").replace(",", ".")),
      reason: String(f.get("reason") ?? ""),
    });
    setBusy(false);
    if (!r.ok) { setNotice({ tone: "error", text: r.message }); return; }
    setNotice({ tone: "ok", text: "Altura corregida. El cambio quedó registrado en la bitácora de la ficha." });
    router.refresh();
  }

  return (
    <section className={card} aria-labelledby="altura-titulo">
      <h2 id="altura-titulo" className="text-lg font-bold text-ink">Corregir altura de la ficha</h2>
      <p className="text-sm text-fog">
        Altura actual: <strong>{currentHeight ?? "sin registrar"}{currentHeight ? " cm" : ""}</strong>.
        Las mediciones anteriores no se modifican. Escribí el motivo del cambio.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Altura correcta (cm)
          <input className={input} name="heightCm" inputMode="decimal" required />
        </label>
        <label className={label}>Motivo (mínimo 5 caracteres)
          <input className={input} name="reason" minLength={5} maxLength={200} required />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className={primary}>{busy ? "Guardando…" : "Corregir altura"}</button>
          <Feedback notice={notice} />
        </div>
      </form>
    </section>
  );
}
