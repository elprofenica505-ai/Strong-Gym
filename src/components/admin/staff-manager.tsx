"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_STAFF_VALUES,
  STAFF_FIELDS,
  STAFF_ROLE_LABEL,
  STAFF_ROLES,
  STAFF_STATE_LABEL,
  staffErrorMessage,
  staffPersonState,
  validateStaffValues,
  type StaffField,
  type StaffFieldKey,
  type StaffPersonState,
  type StaffRole,
  type StaffValues,
} from "@/lib/admin/staff";

export interface StaffMemberRow {
  profileId: string;
  fullName: string;
  nationalId: string;
  birthDate: string;
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  positionTitle: string;
  hiredOn: string;
  responsibilities: string;
  internalNotes: string;
  status: "activo" | "inactivo";
  deactivatedOn: string | null;
  deactivationReason: string | null;
}

export interface StaffCandidate {
  id: string;
  fullName: string;
  role: string;
}

type Notice = { tone: "ok" | "error"; text: string } | null;
type Filter = "todos" | "pendiente" | "completa" | "inactiva";

const ROLE_LABEL: Record<string, string> = { member: "Cliente", staff: "Personal anterior", ...STAFF_ROLE_LABEL };
const STAFF_ROLE_SET = new Set<string>(["trainer", "cashier", "admin", "staff"]);

const SECTIONS: { key: StaffField["section"]; title: string; help: string }[] = [
  { key: "identidad", title: "Identidad", help: "Datos legales de la persona. La cédula y la fecha de nacimiento no se muestran en la bitácora." },
  { key: "contacto", title: "Contacto y emergencias", help: "Un número de emergencia que conteste." },
  { key: "empleo", title: "Empleo", help: "Cargo, ingreso y responsabilidades. Las notas internas son sólo para administración." },
];

const STATE_STYLE: Record<StaffPersonState, string> = {
  completa: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  pendiente: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  inactiva: "border-line bg-card-2 text-fog",
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[0.875rem] text-ink placeholder:text-fog focus:border-brand focus:outline-none disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-brand-600 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-[0.8125rem] text-ink hover:border-fog disabled:opacity-40";

function fromRow(row: StaffMemberRow): StaffValues {
  return {
    fullName: row.fullName,
    nationalId: row.nationalId,
    birthDate: row.birthDate,
    phone: row.phone,
    address: row.address,
    emergencyName: row.emergencyName,
    emergencyPhone: row.emergencyPhone,
    positionTitle: row.positionTitle,
    hiredOn: row.hiredOn,
    responsibilities: row.responsibilities,
    internalNotes: row.internalNotes,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Personal: ficha formal, alta, edición, baja y reactivación. Cada acción pasa por
 * /api/admin/staff y la base vuelve a validar todo (is_admin, datos, bitácora).
 */
export function StaffManager({
  staff,
  people,
  currentUserId,
}: {
  staff: StaffMemberRow[];
  people: StaffCandidate[];
  currentUserId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [form, setForm] = useState<null | { kind: "new" } | { kind: "edit"; profileId: string }>(null);
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState<StaffRole>("trainer");
  const [values, setValues] = useState<StaffValues>(EMPTY_STAFF_VALUES);
  const [errors, setErrors] = useState<Partial<Record<StaffFieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const staffById = useMemo(() => new Map(staff.map((s) => [s.profileId, s])), [staff]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Personal = quien tiene rol de personal o ya tiene ficha.
  const rows = useMemo(
    () =>
      people
        .filter((p) => STAFF_ROLE_SET.has(p.role) || staffById.has(p.id))
        .map((p) => {
          const row = staffById.get(p.id);
          return { person: p, row, state: staffPersonState(Boolean(row), row?.status) };
        })
        .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName, "es")),
    [people, staffById],
  );

  const counts = useMemo(() => {
    const c = { todos: rows.length, pendiente: 0, completa: 0, inactiva: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);

  const visible = filter === "todos" ? rows : rows.filter((r) => r.state === filter);
  const availableToAdd = people.filter((p) => !staffById.has(p.id) && p.id !== currentUserId);

  function openForm(next: { kind: "new" } | { kind: "edit"; profileId: string }, presetId?: string) {
    setNotice(null);
    setErrors({});
    if (next.kind === "new") {
      const id = presetId ?? availableToAdd[0]?.id ?? "";
      setProfileId(id);
      setRole("trainer");
      setValues({ ...EMPTY_STAFF_VALUES, fullName: peopleById.get(id)?.fullName ?? "" });
      setForm(next);
    } else {
      const row = staffById.get(next.profileId);
      setProfileId(next.profileId);
      const current = peopleById.get(next.profileId)?.role;
      setRole((STAFF_ROLES as string[]).includes(current ?? "") ? (current as StaffRole) : "trainer");
      setValues(row ? fromRow(row) : { ...EMPTY_STAFF_VALUES, fullName: peopleById.get(next.profileId)?.fullName ?? "" });
      setForm(next);
    }
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closeForm() {
    setForm(null);
    setErrors({});
  }

  function setField(key: StaffFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!profileId) {
      setNotice({ tone: "error", text: "Elegí la cuenta a la que le vas a crear la ficha." });
      return;
    }
    const found = validateStaffValues(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice({ tone: "error", text: `Faltan o hay datos incorrectos en ${Object.keys(found).length} campo(s). Revisá los marcados.` });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", profileId, role, data: values }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNotice({ tone: "error", text: staffErrorMessage(body?.error) });
        return;
      }
      setForm(null);
      setNotice({ tone: "ok", text: "Ficha guardada. El cambio quedó en la bitácora." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: staffErrorMessage("UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(profile: string, active: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", profileId: profile, active, reason: reason.trim() || undefined }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNotice({ tone: "error", text: staffErrorMessage(body?.error) });
        return;
      }
      setNotice({
        tone: "ok",
        text: active ? "Acceso reactivado. La persona puede volver a entrar." : "Baja registrada. La persona ya no puede iniciar sesión.",
      });
      setDeactivating(null);
      setReason("");
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: staffErrorMessage("UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  const editing = form?.kind === "edit" ? form.profileId : null;
  const formName = peopleById.get(profileId)?.fullName || "Sin nombre";

  return (
    <section className="mt-12" aria-labelledby="staff-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-brand-300 uppercase">Ficha del personal</p>
          <h2 id="staff-heading" className="mt-1 text-[1.5rem] font-bold text-ink">Datos formales del personal</h2>
          <p className="mt-1 max-w-2xl text-[0.875rem] text-mist">
            Sólo administradores dan de alta y de baja. Cada cambio queda en la bitácora de abajo, sin mostrar los datos.
          </p>
        </div>
        <button type="button" onClick={() => openForm({ kind: "new" })} disabled={busy || availableToAdd.length === 0} className={btnPrimary}>
          Dar de alta
        </button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Personal", counts.todos, "todos"],
            ["Falta ficha", counts.pendiente, "pendiente"],
            ["Con ficha", counts.completa, "completa"],
            ["Inactivos", counts.inactiva, "inactiva"],
          ] as const
        ).map(([label, n, key]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-2xl border p-4 text-left transition ${filter === key ? "border-brand bg-brand/[0.08]" : "border-line bg-card hover:border-fog"}`}
          >
            <dt className="text-[0.75rem] text-fog">{label}</dt>
            <dd className="mt-1 text-[1.75rem] font-bold text-ink">{n}</dd>
          </button>
        ))}
      </dl>

      {notice ? (
        <p role="status" className={`mt-5 rounded-xl border px-4 py-3 text-[0.875rem] ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-brand/50 bg-brand/10 text-ink"}`}>
          {notice.text}
        </p>
      ) : null}

      {form ? (
        <div ref={formRef} className="mt-6 scroll-mt-24 rounded-2xl border border-line bg-cloud p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="text-[1.125rem] font-semibold text-ink">
                {form.kind === "new" ? "Alta de personal" : `Ficha de ${formName}`}
              </h3>
              <p className="mt-1 text-[0.8125rem] text-fog">
                {form.kind === "new"
                  ? "Elegí una cuenta existente y completá sus datos. Al guardar, recibe el rol de personal."
                  : "Los cambios quedan registrados en la bitácora con el nombre del campo, no su valor."}
              </p>
            </div>
            <button type="button" onClick={closeForm} className={btnGhost}>Cerrar</button>
          </div>

          <form onSubmit={submit} noValidate className="mt-6 space-y-8">
            <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
              <legend className="sr-only">Cuenta y rol</legend>
              <label className="block text-[0.8125rem] font-medium text-mist">
                Cuenta
                {form.kind === "new" ? (
                  <select value={profileId} onChange={(e) => { setProfileId(e.target.value); setValues((v) => ({ ...v, fullName: peopleById.get(e.target.value)?.fullName ?? v.fullName })); }} className={inputClass}>
                    {availableToAdd.map((c) => (
                      <option key={c.id} value={c.id}>{c.fullName || "Sin nombre"} · {ROLE_LABEL[c.role] ?? c.role}</option>
                    ))}
                  </select>
                ) : (
                  <input value={formName} disabled className={inputClass} />
                )}
              </label>
              <label className="block text-[0.8125rem] font-medium text-mist">
                Rol de personal
                <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputClass}>
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[0.75rem] font-normal text-fog">
                  Caja cobra y registra gastos · Entrenador ve asistencia y nombres · Administración gestiona el sistema.
                </span>
              </label>
            </fieldset>

            {SECTIONS.map((section) => (
              <fieldset key={section.key} disabled={busy} className="space-y-4">
                <legend className="w-full">
                  <span className="block text-[0.9375rem] font-semibold text-ink">{section.title}</span>
                  <span className="mt-0.5 block text-[0.75rem] text-fog">{section.help}</span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {STAFF_FIELDS.filter((f) => f.section === section.key).map((field) => {
                    const id = `staff-${field.key}`;
                    const err = errors[field.key];
                    const common = {
                      id,
                      value: values[field.key],
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(field.key, e.target.value),
                      "aria-invalid": err ? true : undefined,
                      "aria-describedby": err ? `${id}-err` : field.hint ? `${id}-hint` : undefined,
                      className: inputClass,
                    };
                    return (
                      <div key={field.key} className={field.kind === "multiline" ? "sm:col-span-2" : undefined}>
                        <label htmlFor={id} className="block text-[0.8125rem] font-medium text-mist">
                          {field.label}{field.required ? <span className="text-brand-300"> *</span> : null}
                        </label>
                        {field.kind === "multiline" ? (
                          <textarea rows={3} maxLength={field.max} {...common} />
                        ) : (
                          <input type={field.kind === "date" ? "date" : "text"} maxLength={field.max} {...common} />
                        )}
                        {field.hint && !err ? <p id={`${id}-hint`} className="mt-1 text-[0.75rem] text-fog">{field.hint}</p> : null}
                        {err ? <p id={`${id}-err`} className="mt-1 text-[0.75rem] text-brand-300">{err}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cloud/95 px-5 py-4 backdrop-blur sm:-mx-7 sm:px-7">
              <p className="text-[0.75rem] text-fog">* Campos obligatorios</p>
              <div className="flex gap-2">
                <button type="button" onClick={closeForm} className={btnGhost} disabled={busy}>Cancelar</button>
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Guardando…" : "Guardar ficha"}</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar personal">
        {(
          [
            ["todos", "Todos"],
            ["pendiente", "Falta ficha"],
            ["completa", "Con ficha"],
            ["inactiva", "Inactivos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition ${filter === key ? "border-brand bg-brand/10 text-ink" : "border-line text-mist hover:border-fog"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-[0.9375rem] font-semibold text-ink">Todavía no hay personal con rol asignado</p>
          <p className="mx-auto mt-2 max-w-md text-[0.8125rem] text-fog">
            Asigná un rol de caja, entrenador o administrador en la tabla de arriba. Después aparecerá aquí para completar su ficha.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-5 text-[0.875rem] text-fog">No hay personas en este filtro.</p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {visible.map(({ person, row, state }) => {
            const isMe = person.id === currentUserId;
            const isEditing = editing === person.id;
            return (
              <li key={person.id} className={`rounded-2xl border bg-card p-4 sm:p-5 ${isEditing ? "border-brand" : "border-line"}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card-2 text-[0.8125rem] font-bold text-ink" aria-hidden>
                      {initials(person.fullName || "?")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {person.fullName || "Sin nombre"}{isMe ? <span className="ml-2 text-[0.75rem] font-normal text-fog">(tú)</span> : null}
                      </p>
                      <p className="truncate text-[0.8125rem] text-mist">
                        {row ? row.positionTitle : "Sin cargo registrado"} · {ROLE_LABEL[person.role] ?? person.role}
                      </p>
                      {row ? (
                        <p className="text-[0.75rem] text-fog">
                          Ingreso {row.hiredOn} · Tel. {row.phone}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold ${STATE_STYLE[state]}`}>{STAFF_STATE_LABEL[state]}</span>
                    {isMe ? (
                      <span className="text-[0.75rem] text-fog">Tu ficha la edita otro administrador.</span>
                    ) : state === "pendiente" ? (
                      <button type="button" onClick={() => openForm({ kind: "edit", profileId: person.id })} disabled={busy} className={btnPrimary}>Completar ficha</button>
                    ) : state === "completa" ? (
                      <>
                        <button type="button" onClick={() => openForm({ kind: "edit", profileId: person.id })} disabled={busy} className={btnGhost}>Editar</button>
                        <button type="button" onClick={() => { setDeactivating(person.id); setReason(""); }} disabled={busy} className="inline-flex items-center justify-center rounded-full border border-brand/60 px-4 py-2 text-[0.8125rem] text-brand-300 hover:bg-brand/10 disabled:opacity-40">Dar de baja</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => openForm({ kind: "edit", profileId: person.id })} disabled={busy} className={btnGhost}>Ver ficha</button>
                        <button type="button" onClick={() => changeStatus(person.id, true)} disabled={busy} className={btnGhost}>Reactivar</button>
                      </>
                    )}
                  </div>
                </div>

                {state === "inactiva" && row?.deactivationReason ? (
                  <p className="mt-3 text-[0.75rem] text-fog">Baja el {row.deactivatedOn}. Motivo: {row.deactivationReason}</p>
                ) : null}

                {deactivating === person.id ? (
                  <div className="mt-4 rounded-xl border border-brand/40 bg-brand/[0.06] p-4">
                    <label htmlFor={`reason-${person.id}`} className="block text-[0.8125rem] font-medium text-ink">
                      Motivo de la baja <span className="text-brand-300">*</span>
                    </label>
                    <p className="text-[0.75rem] text-fog">Queda en la ficha. La persona no podrá iniciar sesión hasta que la reactiven.</p>
                    <input id={`reason-${person.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => changeStatus(person.id, false)} disabled={busy || reason.trim().length < 5} className={btnPrimary}>Confirmar baja</button>
                      <button type="button" onClick={() => setDeactivating(null)} className={btnGhost}>Cancelar</button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
