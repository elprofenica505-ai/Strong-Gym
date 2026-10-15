"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   Parser de CSV en el cliente
   ============================================================
   Maneja comillas dobles, comas dentro de campos, comillas
   escapadas (""), saltos de línea dentro de comillas y BOM. */

type Row = Record<string, string>;

function parseCSV(text: string): { headers: string[]; rows: Row[] } {
  // Quitar BOM
  const clean = text.replace(/^\uFEFF/, "");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (cell !== "" || row.length > 0) { row.push(cell); cell = ""; out.push(row); row = []; }
        if (c === "\r" && clean[i + 1] === "\n") i++;
      } else cell += c;
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); out.push(row); }
  if (out.length === 0) return { headers: [], rows: [] };
  const headers = out[0].map((h) => h.trim().toLowerCase());
  const rows: Row[] = [];
  for (let r = 1; r < out.length; r++) {
    const obj: Row = {};
    headers.forEach((h, i) => { obj[h] = (out[r][i] ?? "").trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

/* Mapeo de columnas del CSV a campos del sistema.
   Acepta varios alias para que sea flexible con el Excel del
   dueño. La primera coincidencia gana. */
const ALIASES: Record<string, string[]> = {
  fullName:            ["fullname", "full_name", "nombre", "name", "socio"],
  email:               ["email", "correo", "mail"],
  phone:               ["phone", "telefono", "tel", "celular", "movil"],
  planId:              ["planid", "plan_id", "plan"],
  status:              ["status", "estado"],
  birthdate:           ["birthdate", "birth_date", "fecha_nacimiento", "nacimiento", "cumple"],
  address:             ["address", "direccion", "dir"],
  emergencyContactName:["emergencycontactname", "emergency_contact_name", "contacto_emergencia_nombre", "emergencia_nombre"],
  emergencyContactPhone:["emergencycontactphone","emergency_contact_phone", "contacto_emergencia_tel", "emergencia_tel"],
  medicalNotes:        ["medicalnotes", "medical_notes", "notas_medicas", "salud", "alergias"],
};

function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const h of headers) {
      if (aliases.includes(h.replace(/\s+/g, "_").toLowerCase())) {
        map[field] = h;
        break;
      }
    }
  }
  return map;
}

const FIELD_LABELS: Record<keyof typeof ALIASES, string> = {
  fullName: "Nombre completo",
  email: "Email",
  phone: "Teléfono",
  planId: "Plan",
  status: "Estado",
  birthdate: "Fecha de nacimiento (YYYY-MM-DD)",
  address: "Dirección",
  emergencyContactName: "Contacto de emergencia (nombre)",
  emergencyContactPhone: "Contacto de emergencia (teléfono)",
  medicalNotes: "Notas médicas / alergias",
};

const REQUIRED: (keyof typeof ALIASES)[] = ["fullName", "email"];

/* ============================================================
   Componente: Importador
   ============================================================ */

export function ImportMembersTool() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const mapping = useMemo(() => (parsed ? mapHeaders(parsed.headers) : null), [parsed]);

  const validRows = useMemo(() => {
    if (!parsed || !mapping) return [];
    return parsed.rows
      .map((r, idx) => {
        const fullName = mapping.fullName ? r[mapping.fullName] : "";
        const email = mapping.email ? r[mapping.email] : "";
        return {
          idx: idx + 2, // +1 header, +1 base 1
          fullName,
          email,
          phone: mapping.phone ? r[mapping.phone] : "",
          planId: mapping.planId ? r[mapping.planId] : "",
          status: mapping.status ? r[mapping.status] : "",
          birthdate: mapping.birthdate ? r[mapping.birthdate] : "",
          address: mapping.address ? r[mapping.address] : "",
          emergencyContactName: mapping.emergencyContactName ? r[mapping.emergencyContactName] : "",
          emergencyContactPhone: mapping.emergencyContactPhone ? r[mapping.emergencyContactPhone] : "",
          medicalNotes: mapping.medicalNotes ? r[mapping.medicalNotes] : "",
        };
      })
      .filter((r) => r.fullName && r.email);
  }, [parsed, mapping]);

  const onFile = (f: File) => {
    setError(null);
    setResult(null);
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      try {
        const p = parseCSV(text);
        if (p.headers.length === 0) {
          setError("El archivo no tiene encabezados.");
          setParsed(null);
          return;
        }
        setParsed(p);
      } catch {
        setError("No se pudo leer el CSV. Verificá que esté bien formado.");
        setParsed(null);
      }
    };
    reader.readAsText(f, "utf-8");
  };

  const downloadTemplate = () => {
    const headers = Object.keys(FIELD_LABELS);
    const example = [
      "María Fernanda Pérez",
      "maria.perez@ejemplo.com",
      "+505 8888-1001",
      "plan_mensual",
      "active",
      "1995-04-12",
      "Bo. San Judas, Casa #12",
      "Carlos Pérez",
      "+505 8888-9001",
      "",
    ];
    const csv = [
      headers.join(","),
      example.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","),
      "".padEnd(0, "").split(""), // línea vacía
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-socios-strong-gym.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (validRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/import-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          members: validRows.map((r) => ({
            fullName: r.fullName,
            email: r.email,
            phone: r.phone || undefined,
            planId: r.planId || undefined,
            status: (r.status as "active" | "frozen" | "cancelled") || undefined,
            birthdate: r.birthdate || undefined,
            address: r.address || undefined,
            emergencyContactName: r.emergencyContactName || undefined,
            emergencyContactPhone: r.emergencyContactPhone || undefined,
            medicalNotes: r.medicalNotes || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "Error importando");
        return;
      }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Paso 1: descargar plantilla */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-[0.9375rem] font-semibold text-ink">1. Descargá la plantilla</h3>
        <p className="mt-1 text-[0.8125rem] text-fog">
          Las columnas obligatorias son <strong>nombre</strong> y <strong>email</strong>.
          El resto es opcional y se puede cargar después desde el panel.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-card-2 px-4 py-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-brand hover:text-brand-300"
        >
          <Download className="size-4" />
          plantilla-socios-strong-gym.csv
        </button>
      </div>

      {/* Paso 2: subir el archivo */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-[0.9375rem] font-semibold text-ink">2. Subí tu archivo</h3>
        <p className="mt-1 text-[0.8125rem] text-fog">
          Aceptamos CSV. Si tenés Excel, exportá la hoja como CSV (Archivo → Guardar como → CSV).
          Google Sheets también sirve (Archivo → Descargar → CSV).
        </p>

        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-card-2 px-4 py-6 transition-colors hover:border-brand">
          <FileSpreadsheet className="size-6 text-brand-300" />
          <div>
            <p className="text-[0.875rem] font-semibold text-ink">
              Tocá para elegir un CSV
            </p>
            <p className="text-[0.75rem] text-fog">
              o arrastralo hasta acá
            </p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {fileName && (
          <p className="mt-2 text-[0.75rem] text-fog">
            Archivo cargado: <code className="text-ink">{fileName}</code>
          </p>
        )}
      </div>

      {/* Paso 3: revisar mapeo */}
      {parsed && mapping && (
        <div className="rounded-2xl border border-line bg-card p-5">
          <h3 className="text-[0.9375rem] font-semibold text-ink">3. Revisa el mapeo de columnas</h3>
          <p className="mt-1 text-[0.75rem] text-fog">
            Detectamos {parsed.headers.length} columnas en tu archivo.
            {REQUIRED.every((r) => mapping[r])
              ? " ✅ Las obligatorias están todas."
              : " ⚠️ Faltan columnas obligatorias (nombre y/o email)."}
          </p>
          <ul className="mt-3 space-y-1.5 text-[0.75rem]">
            {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map((field) => {
              const col = mapping[field];
              const required = REQUIRED.includes(field);
              return (
                <li
                  key={field}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-line bg-card-2 px-3 py-2",
                    !col && required && "border-alert/50",
                  )}
                >
                  <span className="text-ink">
                    {FIELD_LABELS[field]} {required && <span className="text-alert">*</span>}
                  </span>
                  <code className="text-fog">
                    {col ? `→ ${col}` : "no detectada"}
                  </code>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Paso 4: vista previa */}
      {validRows.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-5">
          <h3 className="text-[0.9375rem] font-semibold text-ink">
            4. Vista previa · {validRows.length} socio{validRows.length === 1 ? "" : "s"} listo{validRows.length === 1 ? "" : "s"}
          </h3>
          <p className="mt-1 text-[0.75rem] text-fog">
            Estos se importarán al confirmar.
          </p>
          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full text-left text-[0.75rem]">
              <thead className="sticky top-0 bg-card-2 text-[0.6875rem] uppercase tracking-wider text-fog">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Nombre</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {validRows.slice(0, 100).map((r) => (
                  <tr key={r.idx} className="bg-card">
                    <td className="px-3 py-2 text-fog">{r.idx}</td>
                    <td className="px-3 py-2 text-ink">{r.fullName}</td>
                    <td className="px-3 py-2 text-mist">{r.email}</td>
                    <td className="px-3 py-2 text-fog">{r.planId || "—"}</td>
                    <td className="px-3 py-2 text-fog">{r.status || "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validRows.length > 100 && (
            <p className="mt-2 text-[0.6875rem] text-fog">
              Mostrando los primeros 100. El resto se importará también.
            </p>
          )}
        </div>
      )}

      {/* Paso 5: confirmar */}
      {validRows.length > 0 && !result && (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-[0.9375rem] font-semibold text-onbrand transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? <RefreshCw className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? "Importando…" : `Importar ${validRows.length} socio${validRows.length === 1 ? "" : "s"}`}
        </button>
      )}

      {error && (
        <p className="rounded-xl border border-alert/50 bg-alert/10 p-3 text-[0.8125rem] text-alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-brand-300" />
            <h3 className="text-[0.9375rem] font-semibold text-ink">Listo</h3>
          </div>
          <p className="mt-2 text-[0.8125rem] text-mist">
            <strong className="text-brand-300">{result.imported}</strong> socio
            {result.imported === 1 ? "" : "s"} importado{result.imported === 1 ? "" : "s"}.
            {result.skipped > 0 && (
              <> <strong className="text-alert">{result.skipped}</strong> salteado{result.skipped === 1 ? "" : "s"}.</>
            )}
          </p>
          {result.errors.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.75rem] font-semibold text-fog">
                Ver {result.errors.length} detalle{result.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.75rem] text-fog">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 50 && <li>… y {result.errors.length - 50} más.</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Componente: Reset
   ============================================================ */

export function ResetTool() {
  const [busy, setBusy] = useState<null | "members" | "transactions" | "coaches" | "all">(null);
  const [confirm, setConfirm] = useState<null | "members" | "transactions" | "coaches" | "all">(null);
  const [result, setResult] = useState<{ ok: boolean; deleted: Record<string, number>; message?: string } | null>(null);

  const ask = (scope: "members" | "transactions" | "coaches" | "all") => setConfirm(scope);
  const go = async () => {
    if (!confirm) return;
    setBusy(confirm);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: confirm }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ ok: false, deleted: {}, message: json.message || json.error });
      } else {
        setResult({ ok: true, deleted: json.deleted });
      }
    } catch (e) {
      setResult({ ok: false, deleted: {}, message: String(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-alert/35 bg-alert/[0.06] p-4 text-[0.8125rem] text-mist">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" />
          <span>
            Las acciones de abajo borran <strong>solo datos de ejemplo</strong>:
            los 40 socios de <code>@stronggym-ejemplo.com</code>, los 3 coaches
            del seed y los 13 gastos del mes con la marca <code>[SEED-GASTO]</code>.
            No se tocan la estructura de la base, los planes, las disciplinas,
            ni tu usuario admin.
          </span>
        </p>
      </div>

      <ResetButtonCard
        scope="members"
        label="Borrar los 40 socios de ejemplo"
        hint="Solo los que tengan email @stronggym-ejemplo.com"
        onAsk={ask}
        disabled={busy !== null}
      />
      <ResetButtonCard
        scope="transactions"
        label="Borrar los 13 gastos del mes de ejemplo"
        hint="Solo los que tengan el prefijo [SEED-GASTO]"
        onAsk={ask}
        disabled={busy !== null}
      />
      <ResetButtonCard
        scope="coaches"
        label="Borrar los 3 coaches de ejemplo"
        hint="Douglas Hernández, María Rodríguez, José Luis Pérez"
        onAsk={ask}
        disabled={busy !== null}
      />
      <ResetButtonCard
        scope="all"
        label="Borrar TODO lo de ejemplo (socios + gastos + coaches)"
        hint="Útil cuando los datos reales ya están listos"
        danger
        onAsk={ask}
        disabled={busy !== null}
      />

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-alert/50 bg-paper p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-alert" />
              <h3 className="text-[1.0625rem] font-semibold text-ink">¿Estás seguro?</h3>
            </div>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-mist">
              Vas a borrar:{" "}
              <strong className="text-ink">
                {confirm === "members" && "los 40 socios de ejemplo"}
                {confirm === "transactions" && "los 13 gastos de ejemplo"}
                {confirm === "coaches" && "los 3 coaches de ejemplo"}
                {confirm === "all" && "socios + gastos + coaches de ejemplo"}
              </strong>
              . Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-full border border-line px-5 py-2 text-[0.8125rem] font-semibold text-mist hover:border-brand hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={go}
                disabled={busy !== null}
                className="rounded-full bg-alert px-5 py-2 text-[0.8125rem] font-semibold text-onbrand transition-colors hover:bg-alert/80 disabled:opacity-50"
              >
                {busy ? "Borrando…" : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn(
            "rounded-2xl border p-4 text-[0.8125rem]",
            result.ok ? "border-brand/40 bg-brand-soft text-brand-300" : "border-alert/50 bg-alert/10 text-alert",
          )}
        >
          {result.ok ? (
            <p>
              ✅ Listo. Borrados:{" "}
              {Object.entries(result.deleted)
                .map(([k, v]) => `${v} ${k}`)
                .join(", ")}
              .
            </p>
          ) : (
            <p>❌ {result.message ?? "Error al borrar."}</p>
          )}
        </div>
      )}
    </div>
  );
}

type ResetScope = "members" | "transactions" | "coaches" | "all";

function ResetButtonCard({
  scope,
  label,
  hint,
  danger = false,
  onAsk,
  disabled,
}: {
  scope: ResetScope;
  label: string;
  hint: string;
  danger?: boolean;
  onAsk: (scope: ResetScope) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.875rem] font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-[0.75rem] text-fog">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onAsk(scope)}
          disabled={disabled}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-[0.8125rem] font-semibold transition-colors disabled:opacity-50",
            danger
              ? "border-alert text-alert hover:bg-alert/10"
              : "border-line text-mist hover:border-brand hover:text-brand-300",
          )}
        >
          <Trash2 className="size-3.5" />
          Borrar
        </button>
      </div>
    </div>
  );
}
