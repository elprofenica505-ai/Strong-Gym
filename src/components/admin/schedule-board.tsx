"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScheduleBlocks, type ScheduleBlock } from "@/components/admin/schedule-blocks";
import { AdminStep } from "@/components/admin/step";
import { ScheduleSessions } from "@/components/admin/schedule-sessions";
import {
  sessionsBoardFrom,
  type SessionsBoard,
} from "@/lib/admin/schedule-range";

/** Fila de `class_schedule_slots` tal como la devuelve `admin_schedule_board()`. */
export type ScheduleSlot = {
  id: string;
  class_id: string;
  class_name: string;
  class_slug: string;
  class_active: boolean;
  day_of_week: number;
  start_time: string;
  duration_min: number;
  capacity: number;
  room: string;
  coach_id: string | null;
  coach_name: string | null;
  is_active: boolean;
};

export type PlanStatus =
  | "create"
  | "duplicate"
  | "room_conflict"
  | "coach_conflict"
  | "blocked"
  | "past"
  | "inactive";

export type SchedulePlanItem = {
  date: string;
  slot_id: string;
  day_of_week: number;
  start_time: string;
  class_id: string;
  class_name: string;
  room: string;
  coach_id: string | null;
  coach_name: string | null;
  status: PlanStatus;
};

export type SchedulePlan = {
  from: string;
  to: string;
  weeks: number;
  created: number;
  totals: Record<PlanStatus, number>;
  items: SchedulePlanItem[];
};

export type SlotCoachItem = {
  session_id: string;
  starts_at: string;
  capacity: number;
  booked: number;
  current_coach_id: string | null;
  current_coach_name: string | null;
  status: "assign" | "same" | "conflict" | "no_coach";
};

/** Lo que devuelve `admin_slot_coach_plan()`. */
export type SlotCoachPlan = {
  slot_id: string;
  class_id: string;
  coach_id: string | null;
  coach_name: string | null;
  slot_active: boolean;
  totals: { sessions: number; assign: number; same: number; conflict: number; bookings: number };
  items: SlotCoachItem[];
};

export type ScheduleBoardData = {
  slots: ScheduleSlot[];
  classes: { id: string; name: string; active: boolean }[];
  coaches: { id: string; name: string; specialties: string[] | null }[];
  weeks: { week_start: string; scheduled: number }[];
  room_hint?: string;
};

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

/** Por qué no se crea una clase, dicho como se lo diría un recepcionista. */
const STATUS_LABEL: Record<PlanStatus, string> = {
  create: "se crea",
  duplicate: "ya estaba en el calendario",
  room_conflict: "esa sala ya está ocupada a esa hora",
  coach_conflict: "ese entrenador ya tiene otra clase a esa hora",
  blocked: "ese día está cerrado",
  past: "esa fecha ya pasó",
  inactive: "esa disciplina está apagada en Operación",
};

const input =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink disabled:opacity-60";

type Draft = {
  id: string | null;
  classId: string;
  day: number;
  start: string;
  duration: number;
  capacity: number;
  room: string;
  coachId: string;
  active: boolean;
};

const newDraft = (classes: ScheduleBoardData["classes"]): Draft => ({
  id: null,
  classId: classes[0]?.id ?? "",
  day: 0,
  start: "18:00",
  duration: 60,
  capacity: 20,
  room: "Salón principal",
  coachId: "",
  active: true,
});

const fromSlot = (slot: ScheduleSlot): Draft => ({
  id: slot.id,
  classId: slot.class_id,
  day: slot.day_of_week,
  start: slot.start_time,
  duration: slot.duration_min,
  capacity: slot.capacity,
  room: slot.room,
  coachId: slot.coach_id ?? "",
  active: slot.is_active,
});

const formatWeek = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};

/** «1 hora», «1 h 30 min», «45 min»: como se dice en el gimnasio. */
const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} ${hours === 1 ? "hora" : "horas"}`
    : `${hours} h ${rest} min`;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Horarios del gimnasio (OP-05), en tres pasos para que se entienda de una
 * leída: armar la semana fija, pasarla al calendario con fechas, y cerrar los
 * días que no se abre. Cada paso hace una sola cosa y avisa qué va a pasar
 * antes de escribir.
 */
export function ScheduleBoard({
  initial,
  initialBlocks = [],
  initialSessions,
  today,
}: {
  initial: ScheduleBoardData;
  initialBlocks?: ScheduleBlock[];
  initialSessions?: SessionsBoard;
  today: string;
}) {
  const [board, setBoard] = useState<ScheduleBoardData>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [gen, setGen] = useState({
    from: initial.weeks[0]?.week_start ?? "",
    weeks: 4,
  });
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [customRange, setCustomRange] = useState(false);
  const [coachPlan, setCoachPlan] = useState<SlotCoachPlan | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);

  async function generate(
    action: "preview-generate" | "apply-generate",
    options: { quiet?: boolean } = {},
  ) {
    setGenBusy(true);
    if (!options.quiet) setNotice(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          from: gen.from || undefined,
          weeks: gen.weeks,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (SchedulePlan & { message?: string; board?: ScheduleBoardData | null })
        | null;
      if (!res.ok || !data?.totals) {
        setPlan(null);
        setNotice({
          tone: "error",
          text:
            data?.message ??
            "No pudimos revisar qué clases se crearían. Recargá antes de reintentar.",
        });
        return;
      }
      setPlan(data);
      if (data.board) setBoard(data.board);
      if (action === "apply-generate") {
        const created = data.created ?? 0;
        setNotice({
          tone: "ok",
          text:
            created > 0
              ? `Listo: ${plural(created, "clase nueva", "clases nuevas")} en el calendario. No se canceló ninguna reserva.`
              : "No hizo falta crear nada: el calendario ya estaba al día.",
        });
      }
    } catch {
      setNotice({
        tone: "error",
        text: "No pudimos revisar la generación. Revisá la conexión antes de reintentar.",
      });
    } finally {
      setGenBusy(false);
    }
  }

  async function send(body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | (ScheduleBoardData & { created_sessions?: number; message?: string })
        | null;
      if (!res.ok || !data?.slots) {
        setNotice({
          tone: "error",
          text:
            data?.message ??
            "No se pudo guardar el horario. Recargá antes de repetir.",
        });
        return false;
      }
      setBoard({
        slots: data.slots,
        classes: data.classes,
        coaches: data.coaches,
        weeks: data.weeks,
        room_hint: data.room_hint,
      });
      return true;
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo guardar el horario. Revisá la conexión y recargá antes de repetir.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(slot: ScheduleSlot) {
    const saved = await send({
      action: "set-active",
      id: slot.id,
      active: !slot.is_active,
    });
    if (!saved) return;
    setNotice({
      tone: "ok",
      text: slot.is_active
        ? "Horario suspendido: deja de repetirse cada semana. Las clases que ya estaban en el calendario se conservan para quien reservó."
        : "Horario activo otra vez. Sus próximas clases se crean en el paso 2.",
    });
    void generate("preview-generate", { quiet: true });
  }

  const save = async () => {
    if (!draft) return;
    const saved = await send({
      action: "save",
      id: draft.id,
      classId: draft.classId,
      day: draft.day,
      start: draft.start,
      duration: draft.duration,
      capacity: draft.capacity,
      room: draft.room.trim(),
      coachId: draft.coachId || null,
      active: draft.active,
    });
    if (!saved) return;
    setDraft(null);
    setNotice({
      tone: "ok",
      text: "Horario guardado en tu semana fija. Todavía no tiene fechas: pasalo al calendario en el paso 2.",
    });
    // Se revisa solo qué falta crear, sin escribir nada, para que el paso 2
    // quede listo con el botón de crear.
    void generate("preview-generate", { quiet: true });
  };

  /**
   * Pasar el entrenador de un horario a las clases que ya están en el
   * calendario. Se mira primero a cuántas afecta: nada se escribe hasta que se
   * confirma, igual que en el resto de la pantalla.
   */
  async function coachAction(
    action: "slot-coach-preview" | "slot-coach-apply",
    slotId: string,
  ) {
    setCoachBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: slotId }),
      });
      const data = (await res.json().catch(() => null)) as
        | (SlotCoachPlan & {
            message?: string;
            assigned?: number;
            skipped_conflict?: number;
            board?: ScheduleBoardData | null;
          })
        | null;
      if (!res.ok || !data || !data.totals) {
        setCoachPlan(null);
        setNotice({
          tone: "error",
          text:
            data?.message ??
            "No pudimos revisar a qué clases les tocaría el entrenador. Recargá antes de reintentar.",
        });
        return;
      }
      if (action === "slot-coach-preview") {
        setCoachPlan(data);
        return;
      }
      if (data.board) setBoard(data.board);
      const assigned = data.assigned ?? 0;
      setCoachPlan(data);
      setNotice({
        tone: "ok",
        text:
          assigned > 0
            ? `Listo: ${plural(assigned, "clase quedó con el entrenador", "clases quedaron con el entrenador")}${
                (data.skipped_conflict ?? 0) > 0
                  ? `. ${plural(data.skipped_conflict ?? 0, "clase se salteó", "clases se saltearon")} porque ese entrenador ya tiene otra clase a esa hora`
                  : ""
              }. No se tocó ninguna reserva.`
            : "No hubo nada que asignar: esas clases ya tenían entrenador o chocaban con otra.",
      });
    } catch {
      setNotice({
        tone: "error",
        text: "No pudimos pasar el entrenador. Revisá la conexión antes de reintentar.",
      });
    } finally {
      setCoachBusy(false);
    }
  }

  const activeSlots = board.slots.filter((slot) => slot.is_active);
  const totalWeek = activeSlots.length;
  const nextFour = board.weeks.reduce((sum, week) => sum + week.scheduled, 0);
  const omitted = plan ? plan.items.filter((item) => item.status !== "create") : [];
  const omittedByStatus = omitted.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-4">
        <h2 className="text-base font-bold text-ink">¿Cómo funciona esta pantalla?</h2>
        <ol className="mt-2 space-y-1 text-[0.875rem] text-mist">
          <li>
            <strong className="text-ink">1. Armás tu semana fija.</strong> Qué
            clase hay cada día y a qué hora. Por ejemplo: Boxeo, martes a las
            06:00. Se repite todas las semanas.
          </li>
          <li>
            <strong className="text-ink">2. La pasás al calendario.</strong> Ahí
            esas clases reciben fecha. Podés ver cuántas se van a crear antes de
            confirmar.
          </li>
          <li>
            <strong className="text-ink">3. Cerrás los días que no abrís.</strong>{" "}
            Feriado, vacaciones o un profesor enfermo.
          </li>
          <li>
            <strong className="text-ink">4. Ajustás un día puntual.</strong> Un
            sábado con clase especial o una fecha que se suspende. Solo ese día.
          </li>
        </ol>
        <p className="mt-2 text-[0.8125rem] text-fog">
          Guardar un horario no crea clases: solo cambia tu semana fija. Las
          clases con fecha se crean en el paso 2.
        </p>
      </section>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-[0.875rem] ${
            notice.tone === "error"
              ? "border-red-400/40 bg-red-400/10 text-red-200"
              : "border-brand/30 bg-brand/[0.06] text-mist"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <AdminStep
        number={1}
        title="Tu semana fija"
        hint="Lo que se repite cada semana. Ejemplo: Boxeo los martes a las 06:00."
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-mist">
            {totalWeek === 0
              ? "Todavía no hay horarios."
              : `${plural(totalWeek, "horario activo", "horarios activos")} por semana.`}
          </p>
          <Button
            type="button"
            disabled={busy || !!draft || board.classes.length === 0}
            onClick={() => {
              setDraft(newDraft(board.classes));
              setNotice(null);
            }}
          >
            Agregar horario fijo
          </Button>
        </div>

        {board.classes.length === 0 ? (
          <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.875rem] text-mist">
            Todavía no hay disciplinas cargadas. Creá al menos una para poder
            cargar su horario.
          </p>
        ) : null}

        {draft ? (
          <div className="space-y-4 rounded-xl border border-brand/40 bg-paper p-4">
            <h3 className="text-[0.9375rem] font-bold text-ink">
              {draft.id ? "Cambiar horario fijo" : "Nuevo horario fijo"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[0.8125rem] text-mist">
                Disciplina
                <select
                  className={`${input} mt-1`}
                  value={draft.classId}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, classId: event.target.value })
                  }
                >
                  {board.classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.active ? "" : " (apagada en Operación)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[0.8125rem] text-mist">
                Día
                <select
                  className={`${input} mt-1`}
                  value={draft.day}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, day: Number(event.target.value) })
                  }
                >
                  {DAYS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[0.8125rem] text-mist">
                Hora de inicio
                <input
                  className={`${input} mt-1`}
                  type="time"
                  value={draft.start}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, start: event.target.value })
                  }
                />
              </label>
              <label className="text-[0.8125rem] text-mist">
                Duración (minutos)
                <input
                  className={`${input} mt-1`}
                  type="number"
                  min={10}
                  max={180}
                  value={draft.duration}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, duration: Number(event.target.value) })
                  }
                />
              </label>
              <label className="text-[0.8125rem] text-mist">
                Cuántos pueden entrar
                <input
                  className={`${input} mt-1`}
                  type="number"
                  min={1}
                  max={200}
                  value={draft.capacity}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, capacity: Number(event.target.value) })
                  }
                />
              </label>
              <label className="text-[0.8125rem] text-mist">
                Sala
                <input
                  className={`${input} mt-1`}
                  value={draft.room}
                  maxLength={60}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, room: event.target.value })
                  }
                />
              </label>
              <label className="text-[0.8125rem] text-mist">
                Entrenador
                <select
                  className={`${input} mt-1`}
                  value={draft.coachId}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, coachId: event.target.value })
                  }
                >
                  <option value="">Sin asignar</option>
                  {board.coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[0.75rem] text-fog">
              {board.room_hint ??
                "Usá la misma sala para que el choque de horario se detecte."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void save()}>
                Guardar horario
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {DAYS.map((dayName, day) => {
            const slots = board.slots.filter((slot) => slot.day_of_week === day);
            return (
              <div key={dayName} className="rounded-xl border border-line bg-paper p-3">
                <h3 className="text-[0.9375rem] font-bold text-ink">
                  {dayName}
                  <span className="ml-2 text-[0.8125rem] font-normal text-fog">
                    {slots.length === 0
                      ? "sin clases fijas"
                      : plural(slots.length, "horario", "horarios")}
                  </span>
                </h3>
                {slots.length === 0 ? null : (
                  <ul className="mt-2 space-y-2">
                    {slots.map((slot) => (
                      <li
                        key={slot.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                          slot.is_active
                            ? "border-line bg-card"
                            : "border-dashed border-line bg-card/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">
                            {slot.start_time} · {slot.class_name}
                            {slot.is_active ? null : (
                              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-normal text-fog">
                                suspendido
                              </span>
                            )}
                          </p>
                          <p className="text-[0.8125rem] text-fog">
                            {formatDuration(slot.duration_min)} ·{" "}
                            {plural(slot.capacity, "lugar", "lugares")} ·{" "}
                            {slot.room} ·{" "}
                            {slot.coach_name ?? "sin entrenador"}
                            {slot.class_active
                              ? ""
                              : " · disciplina apagada en Operación"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setDraft(fromSlot(slot));
                              setNotice(null);
                            }}
                          >
                            Cambiar
                          </Button>
                          {slot.coach_id ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || coachBusy || !!draft}
                              onClick={() =>
                                void coachAction("slot-coach-preview", slot.id)
                              }
                            >
                              Pasar a las clases ya creadas
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void toggle(slot)}
                          >
                            {slot.is_active ? "Suspender" : "Volver a activar"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {coachPlan ? (
          <div className="space-y-2 rounded-xl border border-brand/40 bg-paper p-3">
            <h3 className="text-[0.9375rem] font-bold text-ink">
              Pasar a {coachPlan.coach_name ?? "el entrenador"} a las clases ya
              creadas
            </h3>
            <p className="text-[0.8125rem] text-mist">
              {coachPlan.totals.sessions === 0
                ? "Ese horario todavía no tiene clases en el calendario. Primero pasá la semana al calendario en el paso 2."
                : `Encontré ${plural(coachPlan.totals.sessions, "clase por delante", "clases por delante")} de este horario: ${coachPlan.totals.assign} ${coachPlan.totals.assign === 1 ? "se puede asignar" : "se pueden asignar"}, ${coachPlan.totals.same} ya ${coachPlan.totals.same === 1 ? "tiene" : "tienen"} ese entrenador${
                    coachPlan.totals.conflict > 0
                      ? ` y ${coachPlan.totals.conflict} ${coachPlan.totals.conflict === 1 ? "se saltea" : "se saltean"} porque choca con otra clase suya`
                      : ""
                  }.`}
            </p>
            {coachPlan.totals.bookings > 0 ? (
              <p className="text-[0.8125rem] text-fog">
                Esas clases tienen {plural(coachPlan.totals.bookings, "reserva", "reservas")}.
                Solo cambia quién las dicta: ninguna reserva se toca.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {coachPlan.totals.assign > 0 ? (
                <Button
                  type="button"
                  disabled={coachBusy}
                  onClick={() => void coachAction("slot-coach-apply", coachPlan.slot_id)}
                >
                  Asignar {plural(coachPlan.totals.assign, "clase", "clases")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={coachBusy}
                onClick={() => setCoachPlan(null)}
              >
                Volver
              </Button>
            </div>
          </div>
        ) : null}
      </AdminStep>

      <AdminStep
        number={2}
        title="Pasar la semana al calendario"
        hint="Tu semana fija todavía no tiene fechas. Acá se crean las clases de las próximas semanas. No duplica, no cancela y no toca reservas."
      >
        {board.weeks.length ? (
          <p className="text-[0.8125rem] text-fog">
            En el calendario ahora hay {plural(nextFour, "clase", "clases")} en
            las próximas cuatro semanas:{" "}
            {board.weeks
              .map((week) => `semana del ${formatWeek(week.week_start)} (${week.scheduled})`)
              .join(" · ")}
            .
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={genBusy || busy || board.classes.length === 0}
            onClick={() => void generate("preview-generate")}
          >
            {genBusy ? "Revisando…" : "Ver qué clases se crearían"}
          </Button>
          {plan && plan.totals.create > 0 ? (
            <Button
              type="button"
              disabled={genBusy || busy}
              onClick={() => void generate("apply-generate")}
            >
              Crear {plural(plan.totals.create, "clase", "clases")}
            </Button>
          ) : null}
        </div>

        <details
          className="rounded-xl border border-line bg-paper p-3"
          open={customRange}
          onToggle={(event) =>
            setCustomRange((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary className="cursor-pointer text-[0.8125rem] text-mist">
            Elegir otro período (por defecto, las próximas 4 semanas)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[0.8125rem] text-mist">
              Empezar el
              <input
                className={`${input} mt-1`}
                type="date"
                value={gen.from}
                disabled={genBusy || busy}
                onChange={(event) => {
                  setGen({ ...gen, from: event.target.value });
                  setPlan(null);
                }}
              />
            </label>
            <label className="text-[0.8125rem] text-mist">
              Cuántas semanas
              <select
                className={`${input} mt-1`}
                value={gen.weeks}
                disabled={genBusy || busy}
                onChange={(event) => {
                  setGen({ ...gen, weeks: Number(event.target.value) });
                  setPlan(null);
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {weeks} {weeks === 1 ? "semana" : "semanas"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        {plan ? (
          <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
            <p className="text-[0.875rem] text-ink">
              {plan.totals.create === 0
                ? "No falta ninguna clase en ese período."
                : `Se van a crear ${plural(plan.totals.create, "clase", "clases")}.`}
            </p>
            <p className="text-[0.8125rem] text-fog">
              Del {formatWeek(plan.from)} al {formatWeek(plan.to)}.
              {Object.keys(omittedByStatus).length
                ? ` No se crean ${omitted.length}: ${Object.entries(omittedByStatus)
                    .map(
                      ([status, count]) =>
                        `${count} ${STATUS_LABEL[status as PlanStatus]}`,
                    )
                    .join(", ")}.`
                : ""}
            </p>
            {plan.totals.create > 0 ? (
              <ul className="space-y-1">
                {plan.items
                  .filter((item) => item.status === "create")
                  .slice(0, 6)
                  .map((item) => (
                    <li
                      key={`${item.slot_id}-${item.date}`}
                      className="text-[0.8125rem] text-mist"
                    >
                      {formatWeek(item.date)} · {item.start_time} ·{" "}
                      {item.class_name} · {item.room}
                    </li>
                  ))}
              </ul>
            ) : null}
            {plan.items.filter((item) => item.status === "create").length > 6 ? (
              <p className="text-[0.75rem] text-fog">
                y{" "}
                {plan.items.filter((item) => item.status === "create").length - 6}{" "}
                más.
              </p>
            ) : null}
          </div>
        ) : null}
      </AdminStep>

      <ScheduleBlocks
        initial={initialBlocks}
        classes={board.classes}
        coaches={board.coaches}
        today={today}
        onBoard={setBoard}
      />

      <ScheduleSessions
        initial={initialSessions ?? sessionsBoardFrom(today)}
        classes={board.classes}
        coaches={board.coaches}
      />
    </div>
  );
}
