"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_STAFF_VALUES,
  STAFF_FIELDS,
  STAFF_ROLE_LABEL,
  STAFF_ROLES,
  staffErrorMessage,
  validateStaffValues,
  type StaffFieldKey,
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

const ROLE_OF_LABEL: Record<string, string> = { member: "Cliente", staff: "Personal anterior", ...STAFF_ROLE_LABEL };

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

/**
 * Personal: alta, edición, baja y reactivación. Cada acción pasa por /api/admin/staff
 * y la base vuelve a validar todo (is_admin, datos, bitácora sin valores sensibles).
 */
export function StaffManager({
  staff,
  candidates,
  currentUserId,
}: {
  staff: StaffMemberRow[];
  candidates: StaffCandidate[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "new" | "edit">("idle");
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState<StaffRole>("trainer");
  const [values, setValues] = useState<StaffValues>(EMPTY_STAFF_VALUES);
  const [errors, setErrors] = useState<Partial<Record<StaffFieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const available = useMemo(() => {
    const taken = new Set(staff.map((s) => s.profileId));
    return candidates.filter((c) => !taken.has(c.id) && c.id !== currentUserId);
  }, [candidates, staff, currentUserId]);

  function startNew() {
    setMode("new");
    setProfileId(available[0]?.id ?? "");
    setRole("trainer");
    setValues({ ...EMPTY_STAFF_VALUES, fullName: available[0]?.fullName ?? "" });
    setErrors({});
    setNotice(null);
  }

  function startEdit(row: StaffMemberRow) {
    setMode("edit");
    setProfileId(row.profileId);
    setRole((candidates.find((c) => c.id === row.profileId)?.role as StaffRole) ?? "trainer");
    setValues(fromRow(row));
    setErrors({});
    setNotice(null);
  }

  function setField(key: StaffFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (mode === "new" && !profileId) {
      setNotice({ tone: "error", text: "Elegí la cuenta que vas a dar de alta." });
      return;
    }
    const found = validateStaffValues(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice({ tone: "error", text: "Revisá los campos marcados." });
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
      setNotice({ tone: "ok", text: "Ficha guardada. Quedó registrada en la bitácora." });
      setMode("idle");
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: staffErrorMessage("UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(row: StaffMemberRow, active: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", profileId: row.profileId, active, reason: reason.trim() || undefined }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNotice({ tone: "error", text: staffErrorMessage(body?.error) });
        return;
      }
      setNotice({ tone: "ok", text: active ? "Acceso reactivado." : "Personal dado de baja. Ya no puede iniciar sesión." });
      setDeactivating(null);
      setReason("");
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: staffErrorMessage("UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[0.875rem] text-ink focus:border-brand focus:outline-none";

  return (
    <section className="mt-10" aria-labelledby="staff-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-heading" className="text-[1.125rem] font-semibold text-ink">Ficha del personal</h2>
        <button
          type="button"
          onClick={startNew}
          disabled={busy || available.length === 0}
          className="rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
        >
          Dar de alta
        </button>
      </div>
      <p className="mt-1 text-[0.8125rem] text-mist">
        Sólo administradores dan de alta y de baja. Cada cambio queda en la bitácora sin mostrar los datos.
      </p>

      {notice ? (
        <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-[0.8125rem] ${notice.tone === "ok" ? "border-brand/30 bg-brand/[0.06] text-ink" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.text}
        </p>
      ) : null}

      {staff.length === 0 ? (
        <p className="mt-4 text-[0.875rem] text-mist">Todavía no hay fichas de personal.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
          {staff.map((row) => {
            const role = candidates.find((c) => c.id === row.profileId)?.role;
            return (
              <li key={row.profileId} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{row.fullName}</p>
                    <p className="text-[0.8125rem] text-mist">
                      {row.positionTitle} · {role ? ROLE_OF_LABEL[role] ?? role : "Sin rol"} ·{" "}
                      {row.status === "activo" ? "Activo" : `Inactivo desde ${row.deactivatedOn ?? ""}`}
                    </p>
                    {row.status === "inactivo" && row.deactivationReason ? (
                      <p className="text-[0.75rem] text-mist">Motivo: {row.deactivationReason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(row)} disabled={busy || row.profileId === currentUserId} className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] text-ink disabled:opacity-40">
                      Editar
                    </button>
                    {row.status === "activo" ? (
                      <button type="button" onClick={() => { setDeactivating(row.profileId); setReason(""); }} disabled={busy || row.profileId === currentUserId} className="rounded-full border border-red-300 px-3 py-1.5 text-[0.8125rem] text-red-700 disabled:opacity-40">
                        Dar de baja
                      </button>
                    ) : (
                      <button type="button" onClick={() => changeStatus(row, true)} disabled={busy} className="rounded-full border border-brand px-3 py-1.5 text-[0.8125rem] text-ink disabled:opacity-40">
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
                {deactivating === row.profileId ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <label className="block text-[0.8125rem] text-ink" htmlFor={`reason-${row.profileId}`}>
                      Motivo de la baja (obligatorio)
                    </label>
                    <input id={`reason-${row.profileId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => changeStatus(row, false)} disabled={busy} className="rounded-full bg-red-700 px-3 py-1.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50">
                        Confirmar baja
                      </button>
                      <button type="button" onClick={() => setDeactivating(null)} className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem]">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {mode !== "idle" ? (
        <form onSubmit={submit} noValidate className="mt-6 rounded-xl border border-line bg-white p-5">
          <h3 className="text-[1rem] font-semibold text-ink">{mode === "new" ? "Alta de personal" : "Editar ficha"}</h3>

          {mode === "new" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-[0.8125rem] text-ink">
                Cuenta
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputClass}>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName || "Sin nombre"} ({ROLE_OF_LABEL[c.role] ?? c.role})</option>
                  ))}
                </select>
              </label>
              <label className="block text-[0.8125rem] text-ink">
                Rol de personal
                <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputClass}>
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="mt-4 block max-w-xs text-[0.8125rem] text-ink">
              Rol de personal
              <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputClass}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {STAFF_FIELDS.map((field) => {
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
                  <label htmlFor={id} className="block text-[0.8125rem] text-ink">
                    {field.label}{field.required ? " *" : ""}
                  </label>
                  {field.kind === "multiline" ? (
                    <textarea rows={3} maxLength={field.max} {...common} />
                  ) : (
                    <input type={field.kind === "date" ? "date" : "text"} maxLength={field.max} {...common} />
                  )}
                  {field.hint && !err ? <p id={`${id}-hint`} className="mt-1 text-[0.75rem] text-mist">{field.hint}</p> : null}
                  {err ? <p id={`${id}-err`} className="mt-1 text-[0.75rem] text-red-700">{err}</p> : null}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50">
              {busy ? "Guardando…" : "Guardar ficha"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="rounded-full border border-line px-4 py-2 text-[0.8125rem]">
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
