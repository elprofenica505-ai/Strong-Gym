"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminStep } from "@/components/admin/step";
import type { ScheduleBoardData } from "@/components/admin/schedule-board";

/** Fila de `sessions` tal como la devuelve `admin_schedule_sessions()`. */
export type ScheduleSession = {
  id: string;
  class_id: string;
  class_name: string;
  class_color: string;
  class_active: boolean;
  coach_id: string | null;
  coach_name: string | null;
  room: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  capacity: number;
  booked: number;
  status: "scheduled" | "cancelled";
  origin: "grid" | "manual";
  note: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  is_past: boolean;
};

export type SessionsBoard = {
  from: string;
  to: string;
  today: string;
  sessions: ScheduleSession[];
};

const input =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink disabled:opacity-60";

/** Fecha de Managua, sin depender de la zona del aparato. */
const formatDay = (value: string | Date) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);

const formatHour = (value: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

/** Fecha y hora locales del gimnasio, para precargar el formulario. */
const localParts = (iso: string) => {
  const date = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Managua",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Managua",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
};

/** Período con el que arranca el paso 4: hoy y las próximas cuatro semanas. */
export function sessionsBoardFrom(today: string): SessionsBoard {
  const [year, month, day] = today.split("-").map(Number);
  const to = new Date(Date.UTC(year, month - 1, day + 27))
    .toISOString()
    .slice(0, 10);
  return { from: today, to, today, sessions: [] };
}

type Draft = {
  id: string | null;
  classId: string;
  date: string;
  time: string;
  duration: number;
  capacity: number;
  room: string;
  coachId: string;
  note: string;
  expectedStarts: string | null;
};

const fromSession = (session: ScheduleSession): Draft => {
  const parts = localParts(session.starts_at);
  return {
    id: session.id,
    classId: session.class_id,
    date: parts.date,
    time: parts.time,
    duration: session.duration_min,
    capacity: session.capacity,
    room: session.room,
    coachId: session.coach_id ?? "",
    note: session.note ?? "",
    expectedStarts: `${parts.date}T${parts.time}`,
  };
};

const newDraft = (
  classes: ScheduleBoardData["classes"],
  today: string,
): Draft => {
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    id: null,
    classId: classes.find((item) => item.active)?.id ?? classes[0]?.id ?? "",
    date: tomorrow.toISOString().slice(0, 10),
    time: "18:00",
    duration: 60,
    capacity: 20,
    room: "Salón principal",
    coachId: "",
    note: "",
    expectedStarts: null,
  };
};

/**
 * Paso 4 de Horarios (OP-05): clases sueltas y días especiales. Crea, mueve o
 * suspende **una** clase con fecha sin tocar la semana fija. Para suspender
 * varios días seguidos está el paso 3 (bloqueos y cierres), que no se repite
 * acá.
 */
export function ScheduleSessions({
  initial,
  classes,
  coaches,
}: {
  initial: SessionsBoard;
  classes: ScheduleBoardData["classes"];
  coaches: ScheduleBoardData["coaches"];
}) {
  const [board, setBoard] = useState<SessionsBoard>(initial);
  const [range, setRange] = useState({ from: initial.from, to: initial.to });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduleSession | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );

  async function send(body: unknown) {
    const res = await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  async function reload(from = range.from, to = range.to) {
    const { res, data } = await send({ action: "list-sessions", from, to });
    if (!res.ok || !data || !Array.isArray(data.sessions)) {
      setNotice({
        tone: "error",
        text:
          (data?.message as string | undefined) ??
          "No pudimos traer las clases de ese período. Recargá antes de repetir.",
      });
      return;
    }
    setBoard(data as unknown as SessionsBoard);
    setRange({ from: data.from as string, to: data.to as string });
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await send({
        action: "save-session",
        id: draft.id,
        classId: draft.classId,
        date: draft.date,
        time: draft.time,
        duration: draft.duration,
        capacity: draft.capacity,
        room: draft.room.trim(),
        coachId: draft.coachId || null,
        note: draft.note.trim() || null,
        expectedStarts: draft.expectedStarts,
      });
      if (!res.ok || !data || data.action === undefined) {
        setNotice({
          tone: "error",
          text:
            (data?.message as string | undefined) ??
            "No se pudo guardar la clase. Recargá antes de repetir.",
        });
        return;
      }
      const fecha = `${formatDay(`${draft.date}T12:00:00`)} a las ${draft.time}`;
      setNotice({
        tone: "ok",
        text:
          data.action === "sin_cambios"
            ? "No había nada para cambiar: la clase quedó igual."
            : draft.id
              ? `Clase actualizada: ${fecha}. Las reservas que tenía siguen con ella.`
              : `Clase suelta agregada: ${fecha}. No cambia tu semana fija.`,
      });
      setDraft(null);
      await reload();
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo confirmar el guardado. Recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancelSession() {
    if (!cancelTarget || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await send({
        action: "cancel-session",
        id: cancelTarget.id,
        reason: reason.trim(),
        confirmed: true,
      });
      if (!res.ok || !data || data.ok !== true) {
        setNotice({
          tone: "error",
          text:
            (data?.message as string | undefined) ??
            "No se pudo cancelar la clase. Recargá antes de repetir.",
        });
        return;
      }
      const affected = Number(data.cancelled_bookings ?? 0);
      setNotice({
        tone: "ok",
        text:
          data.changed === true
            ? affected > 0
              ? `Clase cancelada. ${affected} ${affected === 1 ? "reserva quedó cancelada" : "reservas quedaron canceladas"} con el motivo escrito; nadie se quedó sin aviso en el sistema.`
              : "Clase cancelada. No tenía reservas."
            : "Esa clase ya estaba cancelada: no cambió nada.",
      });
      setCancelTarget(null);
      setReason("");
      await reload();
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo cancelar. Revisá la conexión antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  const scheduled = board.sessions.filter((s) => s.status === "scheduled");
  const cancelled = board.sessions.filter((s) => s.status === "cancelled");

  return (
    <AdminStep
      number={4}
      title="Un día puntual"
      hint="Una clase que no se repite: un sábado especial, un horario corrido por feriado o una fecha que se suspende. Cambia solo ese día, nunca tu semana fija."
    >
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

      <div className="grid gap-3 rounded-xl border border-line bg-paper p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="text-[0.8125rem] text-mist">
          <label htmlFor="sessions-from">Mostrar desde</label>
          <input
            id="sessions-from"
            className={`${input} mt-1`}
            type="date"
            value={range.from}
            disabled={busy}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
          />
        </div>
        <div className="text-[0.8125rem] text-mist">
          <label htmlFor="sessions-to">Hasta</label>
          <input
            id="sessions-to"
            className={`${input} mt-1`}
            type="date"
            value={range.to}
            disabled={busy}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDraft(null);
            setCancelTarget(null);
            void reload();
          }}
        >
          Ver este período
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-mist">
          {board.sessions.length === 0
            ? "No hay clases en ese período."
            : `${scheduled.length} ${scheduled.length === 1 ? "clase programada" : "clases programadas"}${
                cancelled.length
                  ? ` y ${cancelled.length} ${cancelled.length === 1 ? "cancelada" : "canceladas"}`
                  : ""
              }.`}
        </p>
        <Button
          type="button"
          disabled={busy || !!draft || classes.length === 0}
          onClick={() => {
            setDraft(newDraft(classes, board.today));
            setCancelTarget(null);
            setNotice(null);
          }}
        >
          Agregar clase suelta
        </Button>
      </div>

      {draft ? (
        <div className="space-y-4 rounded-xl border border-brand/40 bg-paper p-4">
          <h3 className="text-[0.9375rem] font-bold text-ink">
            {draft.id ? "Cambiar esta clase" : "Nueva clase suelta"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-class">Disciplina</label>
              <select
                id="session-class"
                className={`${input} mt-1`}
                value={draft.classId}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, classId: event.target.value })}
              >
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? "" : " (apagada en Operación)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-date">Fecha</label>
              <input
                id="session-date"
                className={`${input} mt-1`}
                type="date"
                value={draft.date}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-time">Hora de inicio</label>
              <input
                id="session-time"
                className={`${input} mt-1`}
                type="time"
                value={draft.time}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
              />
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-duration">Duración (minutos)</label>
              <input
                id="session-duration"
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
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-capacity">Cuántos pueden entrar</label>
              <input
                id="session-capacity"
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
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-room">Sala</label>
              <input
                id="session-room"
                className={`${input} mt-1`}
                value={draft.room}
                maxLength={60}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, room: event.target.value })}
              />
            </div>
            <div className="text-[0.8125rem] text-mist">
              <label htmlFor="session-coach">Entrenador</label>
              <select
                id="session-coach"
                className={`${input} mt-1`}
                value={draft.coachId}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, coachId: event.target.value })}
              >
                <option value="">Sin asignar</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[0.8125rem] text-mist sm:col-span-2">
              <label htmlFor="session-note">Nota del día especial (opcional)</label>
              <input
                id="session-note"
                className={`${input} mt-1`}
                value={draft.note}
                maxLength={200}
                placeholder="Ejemplo: sábado de Zumba al aire libre"
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </div>
          </div>
          <p className="text-[0.75rem] text-fog">
            Esta clase no se repite: es solo para esa fecha. Si cambiás la hora o
            la sala, las reservas que ya tenga siguen con ella. No se puede bajar
            el cupo por debajo de lo reservado.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Guardar clase
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

      {cancelTarget ? (
        <div className="space-y-3 rounded-xl border border-red-400/40 bg-red-400/[0.06] p-4">
          <h3 className="text-[0.9375rem] font-bold text-ink">
            Cancelar {cancelTarget.class_name} del {formatDay(cancelTarget.starts_at)} a
            las {formatHour(cancelTarget.starts_at)}
          </h3>
          <p className="text-[0.8125rem] text-mist">
            {cancelTarget.booked > 0
              ? `Esta clase tiene ${cancelTarget.booked} ${cancelTarget.booked === 1 ? "persona anotada" : "personas anotadas"}. Al cancelar, su reserva queda cancelada con el motivo que escribas. No se borra nada.`
              : "Esta clase no tiene reservas. Queda cancelada con el motivo y se puede volver a programar después."}
          </p>
          <div className="text-[0.8125rem] text-mist">
            <label htmlFor="session-cancel-reason">Motivo de la cancelación</label>
            <input
              id="session-cancel-reason"
              className={`${input} mt-1`}
              value={reason}
              maxLength={200}
              placeholder="Ejemplo: el entrenador se enfermó"
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void cancelSession()}
            >
              Sí, cancelar esta clase
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setCancelTarget(null);
                setReason("");
              }}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {board.sessions.map((session) => {
          const open = session.status === "scheduled" && !session.is_past;
          return (
            <li
              key={session.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                session.status === "cancelled"
                  ? "border-dashed border-line bg-card/60"
                  : "border-line bg-paper"
              }`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: session.class_color }}
                  />
                  {formatDay(session.starts_at)} · {formatHour(session.starts_at)} ·{" "}
                  {session.class_name}
                  {session.origin === "manual" ? (
                    <span className="rounded-full border border-brand/40 px-2 py-0.5 text-[0.6875rem] font-normal text-brand">
                      suelta
                    </span>
                  ) : null}
                  {session.status === "cancelled" ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-normal text-fog">
                      cancelada
                    </span>
                  ) : session.is_past ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-normal text-fog">
                      ya pasó
                    </span>
                  ) : null}
                </p>
                <p className="text-[0.8125rem] text-fog">
                  {session.room} · {session.coach_name ?? "sin entrenador"} ·{" "}
                  {session.booked} de {session.capacity}{" "}
                  {session.capacity === 1 ? "lugar" : "lugares"}
                  {session.note ? ` · ${session.note}` : ""}
                  {session.status === "cancelled" && session.cancel_reason
                    ? ` · motivo: ${session.cancel_reason}`
                    : ""}
                </p>
              </div>
              {open ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !!draft}
                    onClick={() => {
                      setDraft(fromSession(session));
                      setCancelTarget(null);
                      setNotice(null);
                    }}
                  >
                    Cambiar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !!draft}
                    onClick={() => {
                      setCancelTarget(session);
                      setDraft(null);
                      setReason("");
                      setNotice(null);
                    }}
                  >
                    Cancelar clase
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-[0.75rem] text-fog">
        ¿Hay que suspender varios días seguidos? Eso se hace en el paso 3, con un
        cierre: alcanza a todas las clases del período y avisa a quién tenía
        reserva.
      </p>
    </AdminStep>
  );
}
