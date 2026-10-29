"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ScheduleBoardData } from "@/components/admin/schedule-board";

export type ReasonKind = "holiday" | "vacation" | "sick" | "maintenance" | "other";
export type BlockScope = "gym" | "class" | "coach";

/** Fila de `schedule_blocks` tal como la devuelve `admin_schedule_blocks()`. */
export type ScheduleBlock = {
  id: string;
  scope: BlockScope;
  class_id: string | null;
  class_name: string | null;
  coach_id: string | null;
  coach_name: string | null;
  starts_at: string;
  ends_at: string;
  reason_kind: ReasonKind;
  reason: string;
  substitute_coach_id: string | null;
  substitute_coach_name: string | null;
  is_active: boolean;
  cancelled_sessions: number;
};

export type BlockSession = {
  id: string;
  class_id: string;
  class_name: string;
  starts_at: string;
  room: string;
  coach_id: string | null;
  coach_name: string | null;
  bookings: number;
};

export type BlockImpact = {
  sessions: BlockSession[];
  session_count: number;
  booking_count: number;
  action: "cancel" | "reassign";
};

export const REASON_LABEL: Record<ReasonKind, string> = {
  holiday: "Feriado",
  vacation: "Vacaciones",
  sick: "Enfermedad",
  maintenance: "Mantenimiento",
  other: "Otro motivo",
};

const input =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink disabled:opacity-60";

/** Fecha y hora de Managua, sin depender de la zona del aparato. */
const formatMoment = (value: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

const formatDay = (value: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

const formatHour = (value: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

const scopeName = (block: ScheduleBlock) =>
  block.scope === "gym"
    ? "Todo el gimnasio"
    : block.scope === "class"
      ? (block.class_name ?? "Disciplina")
      : (block.coach_name ?? "Entrenador");

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

type Draft = {
  scope: BlockScope;
  classId: string;
  coachId: string;
  fromDate: string;
  toDate: string;
  reasonKind: ReasonKind;
  reason: string;
  substituteCoachId: string;
};

const newDraft = (
  classes: ScheduleBoardData["classes"],
  coaches: ScheduleBoardData["coaches"],
  today: string,
): Draft => ({
  scope: "gym",
  classId: classes[0]?.id ?? "",
  coachId: coaches[0]?.id ?? "",
  fromDate: today,
  toDate: today,
  reasonKind: "holiday",
  reason: "",
  substituteCoachId: "",
});

/**
 * Cierres del calendario (OP-05, paso 3). Feriado, vacaciones, enfermedad o
 * mantenimiento: se elige a quién afecta, se revisa qué clases y reservas toca
 * y recién entonces se guarda. Nada se borra: lo cancelado queda con su motivo.
 */
export function ScheduleBlocks({
  initial,
  classes,
  coaches,
  today,
  onBoard,
}: {
  initial: ScheduleBlock[];
  classes: ScheduleBoardData["classes"];
  coaches: ScheduleBoardData["coaches"];
  today: string;
  onBoard?: (board: ScheduleBoardData) => void;
}) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [impact, setImpact] = useState<BlockImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );

  const body = (action: "preview-block" | "save-block", extra = {}) => ({
    action,
    scope: draft!.scope,
    classId: draft!.scope === "class" ? draft!.classId || null : null,
    coachId: draft!.scope === "coach" ? draft!.coachId || null : null,
    starts: `${draft!.fromDate}T00:00`,
    ends: `${draft!.toDate}T23:59`,
    substituteCoachId:
      draft!.scope === "coach" ? draft!.substituteCoachId || null : null,
    ...extra,
  });

  async function post(payload: unknown) {
    const res = await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, data };
  }

  async function preview() {
    if (!draft) return;
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await post(body("preview-block"));
      if (!res.ok || !data || !Array.isArray(data.sessions)) {
        setImpact(null);
        setNotice({
          tone: "error",
          text:
            (data?.message as string | undefined) ??
            "No pudimos revisar el cierre. Recargá antes de reintentar.",
        });
        return;
      }
      setImpact(data as unknown as BlockImpact);
    } catch {
      setNotice({
        tone: "error",
        text: "No pudimos revisar el cierre. Revisá la conexión antes de reintentar.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || !impact) return;
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await post(
        body("save-block", {
          reasonKind: draft.reasonKind,
          reason: draft.reason.trim(),
          confirmed: true,
        }),
      );
      if (!res.ok || !data || !Array.isArray(data.blocks)) {
        setNotice({
          tone: "error",
          text:
            (data?.message as string | undefined) ??
            "No se guardó el cierre. Recargá antes de repetirlo.",
        });
        return;
      }
      setBlocks(data.blocks as ScheduleBlock[]);
      if (data.board && onBoard) onBoard(data.board as ScheduleBoardData);
      const cancelled = Number(data.cancelled_sessions ?? 0);
      const reassigned = Number(data.reassigned_sessions ?? 0);
      setNotice({
        tone: "ok",
        text:
          reassigned > 0
            ? `Listo: ${plural(reassigned, "clase pasó", "clases pasaron")} al sustituto. No se canceló a nadie.`
            : cancelled > 0
              ? `Listo: ${plural(cancelled, "clase se canceló", "clases se cancelaron")} y cada reserva quedó con el motivo escrito.`
              : "Cierre guardado. No había clases programadas en esos días.",
      });
      setDraft(null);
      setImpact(null);
    } catch {
      setNotice({
        tone: "error",
        text: "No se guardó el cierre. Revisá la conexión antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function lift(block: ScheduleBlock) {
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await post({ action: "lift-block", id: block.id });
      if (!res.ok || !data || !Array.isArray(data.blocks)) {
        setNotice({
          tone: "error",
          text:
            (data?.message as string | undefined) ??
            "No se pudo reabrir. Recargá antes de repetir.",
        });
        return;
      }
      setBlocks(data.blocks as ScheduleBlock[]);
      setNotice({
        tone: "ok",
        text: "Cierre levantado. Las clases que se habían cancelado no vuelven solas: se crean de nuevo en el paso 2.",
      });
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo reabrir. Revisá la conexión antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  const activeBlocks = blocks.filter((block) => block.is_active);

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[0.875rem] font-bold text-white"
        >
          3
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">
            <span className="sr-only">Paso 3: </span>
            Días que no abrís
          </h2>
          <p className="mt-1 text-[0.8125rem] text-fog">
            Feriado, vacaciones, un profesor enfermo o mantenimiento. Al cerrar,
            esas clases no se programan y las que ya tenían gente se cancelan con
            el motivo. Nada se borra.
          </p>
          <p className="mt-1 text-[0.8125rem] text-mist">
            {activeBlocks.length === 0
              ? "No hay cierres programados."
              : `${plural(activeBlocks.length, "cierre programado", "cierres programados")}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !!draft}
          onClick={() => {
            setDraft(newDraft(classes, coaches, today));
            setImpact(null);
            setNotice(null);
          }}
        >
          Cerrar un día o un rango
        </Button>
      </div>

      {draft ? (
        <div className="space-y-3 rounded-xl border border-brand/40 bg-paper p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-[0.8125rem] text-mist">
              Qué cerrás
              <select
                className={`${input} mt-1`}
                value={draft.scope}
                disabled={busy}
                onChange={(event) => {
                  setDraft({ ...draft, scope: event.target.value as BlockScope });
                  setImpact(null);
                }}
              >
                <option value="gym">Todo el gimnasio</option>
                <option value="class">Una disciplina</option>
                <option value="coach">Un entrenador</option>
              </select>
            </label>
            {draft.scope === "class" ? (
              <label className="text-[0.8125rem] text-mist">
                Disciplina
                <select
                  className={`${input} mt-1`}
                  value={draft.classId}
                  disabled={busy}
                  onChange={(event) => {
                    setDraft({ ...draft, classId: event.target.value });
                    setImpact(null);
                  }}
                >
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {draft.scope === "coach" ? (
              <>
                <label className="text-[0.8125rem] text-mist">
                  Entrenador
                  <select
                    className={`${input} mt-1`}
                    value={draft.coachId}
                    disabled={busy}
                    onChange={(event) => {
                      setDraft({ ...draft, coachId: event.target.value });
                      setImpact(null);
                    }}
                  >
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[0.8125rem] text-mist">
                  Quién lo cubre (opcional)
                  <select
                    className={`${input} mt-1`}
                    value={draft.substituteCoachId}
                    disabled={busy}
                    onChange={(event) => {
                      setDraft({ ...draft, substituteCoachId: event.target.value });
                      setImpact(null);
                    }}
                  >
                    <option value="">Nadie: se cancelan sus clases</option>
                    {coaches
                      .filter((coach) => coach.id !== draft.coachId)
                      .map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="text-[0.8125rem] text-mist">
              Primer día
              <input
                className={`${input} mt-1`}
                type="date"
                value={draft.fromDate}
                disabled={busy}
                onChange={(event) => {
                  setDraft({ ...draft, fromDate: event.target.value });
                  setImpact(null);
                }}
              />
            </label>
            <label className="text-[0.8125rem] text-mist">
              Último día
              <input
                className={`${input} mt-1`}
                type="date"
                value={draft.toDate}
                disabled={busy}
                onChange={(event) => {
                  setDraft({ ...draft, toDate: event.target.value });
                  setImpact(null);
                }}
              />
            </label>
            <label className="text-[0.8125rem] text-mist">
              Por qué
              <select
                className={`${input} mt-1`}
                value={draft.reasonKind}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, reasonKind: event.target.value as ReasonKind })
                }
              >
                {Object.entries(REASON_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[0.8125rem] text-mist sm:col-span-2">
              Contales qué pasa
              <input
                className={`${input} mt-1`}
                value={draft.reason}
                maxLength={200}
                placeholder="Por ejemplo: feriado nacional, retomamos el jueves"
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, reason: event.target.value })
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void preview()}
            >
              {busy ? "Revisando…" : "Ver a quién afecta"}
            </Button>
            <Button
              type="button"
              disabled={busy || !impact || draft.reason.trim().length < 3}
              onClick={() => void save()}
            >
              Confirmar cierre
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setImpact(null);
              }}
            >
              Cancelar
            </Button>
          </div>

          {impact ? (
            <div className="space-y-2 rounded-xl border border-line bg-card p-3">
              <p className="text-[0.875rem] text-mist">
                {impact.session_count === 0
                  ? "No hay clases programadas en esos días: el cierre va a impedir que se creen."
                  : impact.action === "reassign"
                    ? `Se pasan ${plural(impact.session_count, "clase", "clases")} al sustituto. No se cancela ninguna reserva.`
                    : `Se cancelan ${plural(impact.session_count, "clase", "clases")} y ${plural(impact.booking_count, "reserva", "reservas")}. Cada reserva queda cancelada con el motivo escrito.`}
              </p>
              {impact.sessions.length ? (
                <ul className="space-y-1">
                  {impact.sessions.map((session) => (
                    <li key={session.id} className="text-[0.8125rem] text-fog">
                      {formatDay(session.starts_at)} {formatHour(session.starts_at)} ·{" "}
                      {session.class_name} · {session.room}
                      {session.bookings > 0
                        ? ` · ${plural(session.bookings, "reserva", "reservas")}`
                        : " · sin reservas"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`text-[0.875rem] ${notice.tone === "error" ? "text-red-300" : "text-brand-300"}`}
        >
          {notice.text}
        </p>
      ) : null}

      {activeBlocks.length ? (
        <ul className="space-y-2">
          {activeBlocks.map((block) => (
            <li
              key={block.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {REASON_LABEL[block.reason_kind]} · {scopeName(block)}
                </p>
                <p className="text-[0.8125rem] text-fog">
                  {formatMoment(block.starts_at)} → {formatMoment(block.ends_at)} ·{" "}
                  {block.reason}
                  {block.substitute_coach_name
                    ? ` · cubre ${block.substitute_coach_name}`
                    : block.cancelled_sessions > 0
                      ? ` · ${plural(block.cancelled_sessions, "clase cancelada", "clases canceladas")}`
                      : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void lift(block)}
              >
                Reabrir
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
