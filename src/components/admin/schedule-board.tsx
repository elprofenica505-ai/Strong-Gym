"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

/**
 * Grilla semanal del gimnasio (OP-05). Cada fila es una clase fija que el
 * generador convierte en sesiones con fecha. Los cambios se guardan en la
 * base: no dependen de código ni de un despliegue.
 */
export function ScheduleBoard({ initial }: { initial: ScheduleBoardData }) {
  const [board, setBoard] = useState<ScheduleBoardData>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );

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
      const created = data.created_sessions ?? 0;
      setNotice({
        tone: "ok",
        text:
          created > 0
            ? `Horario guardado. Se crearon ${created} ${created === 1 ? "sesión" : "sesiones"} en el calendario.`
            : "Horario guardado. No hizo falta crear sesiones nuevas.",
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
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-active",
          id: slot.id,
          active: !slot.is_active,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ScheduleBoardData & { created_sessions?: number; message?: string })
        | null;
      if (!res.ok || !data?.slots) {
        setNotice({
          tone: "error",
          text: data?.message ?? "No se pudo cambiar el horario.",
        });
        return;
      }
      setBoard({
        slots: data.slots,
        classes: data.classes,
        coaches: data.coaches,
        weeks: data.weeks,
        room_hint: data.room_hint,
      });
      setNotice({
        tone: "ok",
        text: slot.is_active
          ? "Horario anulado. Las sesiones que ya existían se conservan para quien reservó."
          : "Horario reactivado.",
      });
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo cambiar el horario. Revisá la conexión antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
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
    if (saved) setDraft(null);
  };

  const totalSlots = board.slots.filter((slot) => slot.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
        <div>
          <p className="text-[0.875rem] text-mist">
            {totalSlots} {totalSlots === 1 ? "horario activo" : "horarios activos"} ·
            la grilla se convierte en sesiones con fecha.
          </p>
          {board.weeks.length ? (
            <p className="text-[0.8125rem] text-fog">
              Próximas semanas:{" "}
              {board.weeks
                .map((week) => `${formatWeek(week.week_start)} (${week.scheduled})`)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          disabled={busy || !!draft || board.classes.length === 0}
          onClick={() => setDraft(newDraft(board.classes))}
        >
          Agregar horario
        </Button>
      </div>

      {board.classes.length === 0 ? (
        <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.875rem] text-mist">
          Todavía no hay disciplinas. Creá al menos una para poder cargar su
          horario.
        </p>
      ) : null}

      {draft ? (
        <section className="space-y-4 rounded-2xl border border-brand/40 bg-card p-4">
          <h2 className="text-lg font-bold text-ink">
            {draft.id ? "Editar horario" : "Nuevo horario"}
          </h2>
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
                    {item.active ? "" : " (desactivada)"}
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
              Cupo
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
        </section>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`text-[0.875rem] ${notice.tone === "error" ? "text-red-300" : "text-brand-300"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="space-y-4">
        {DAYS.map((dayName, day) => {
          const slots = board.slots.filter((slot) => slot.day_of_week === day);
          return (
            <section key={dayName} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="text-base font-bold text-ink">
                {dayName}
                <span className="ml-2 text-[0.8125rem] font-normal text-fog">
                  {slots.length === 0
                    ? "sin clases fijas"
                    : `${slots.length} ${slots.length === 1 ? "horario" : "horarios"}`}
                </span>
              </h2>
              {slots.length === 0 ? null : (
                <ul className="mt-3 space-y-2">
                  {slots.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {slot.start_time} · {slot.class_name}
                          {slot.is_active ? "" : " · anulado"}
                        </p>
                        <p className="text-[0.8125rem] text-fog">
                          {slot.duration_min} min · {slot.capacity} cupos ·{" "}
                          {slot.room} · {slot.coach_name ?? "sin entrenador"}
                          {slot.class_active
                            ? ""
                            : " · disciplina desactivada en Operación"}
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
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void toggle(slot)}
                        >
                          {slot.is_active ? "Anular" : "Reactivar"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
