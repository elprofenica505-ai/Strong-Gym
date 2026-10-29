"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/format-money";

/** Forma que devuelve `admin_plans_catalog()`. */
export type AdminPlan = {
  id: string;
  slug: string;
  name_es: string;
  name_en: string;
  period: "session" | "week" | "fortnight" | "month";
  price_nio: number | string | null;
  price: number | string | null;
  access_kind: "gym" | "class" | null;
  class_id: string | null;
  class_name: string | null;
  duration_days: number | null;
  validity_currency: "NIO" | "USD" | null;
  validity_amount: number | string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
};
type AdminClass = { id: string; slug: string; name_es: string; is_active: boolean };
type Catalog = { plans: AdminPlan[]; classes: AdminClass[] };

const PERIODS = [
  { value: "session", label: "Visita" },
  { value: "week", label: "Semana" },
  { value: "fortnight", label: "Quincena" },
  { value: "month", label: "Mes" },
] as const;

const numberOrNull = (value: string) => {
  const raw = value.trim().replace(",", ".");
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

function emptyDraft(classes: AdminClass[]) {
  return {
    id: null as string | null,
    nameEs: "",
    nameEn: "",
    slug: "",
    period: "month" as AdminPlan["period"],
    priceNio: "",
    accessKind: (classes.length ? "class" : "gym") as "gym" | "class" | null,
    classId: classes[0]?.id ?? "",
    durationDays: "30",
    validityCurrency: "NIO" as "NIO" | "USD",
    validityAmount: "",
    isActive: true,
    sortOrder: "100",
  };
}

type Draft = ReturnType<typeof emptyDraft>;

/**
 * Catálogo de planes y modalidades (CLI-06). Crear aquí un plan con acceso,
 * duración, moneda e importe habilita su cobro con vigencia en la ficha del
 * cliente, sin cambios de código. No borra planes: los desactiva.
 */
export function PlansCatalog({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState<Catalog>(initial);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initial.classes));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const activeClasses = useMemo(
    () => catalog.classes.filter((c) => c.is_active),
    [catalog.classes],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function edit(plan: AdminPlan) {
    setNotice(null);
    setDraft({
      id: plan.id,
      nameEs: plan.name_es,
      nameEn: plan.name_en,
      slug: plan.slug,
      period: plan.period,
      priceNio: plan.price_nio === null ? "" : String(plan.price_nio),
      accessKind: plan.access_kind,
      classId: plan.class_id ?? "",
      durationDays: plan.duration_days === null ? "" : String(plan.duration_days),
      validityCurrency: plan.validity_currency ?? "NIO",
      validityAmount:
        plan.validity_amount === null ? "" : String(Number(plan.validity_amount)),
      isActive: plan.is_active,
      sortOrder: String(plan.sort_order),
    });
  }

  async function refresh() {
    const res = await fetch("/api/admin/plans", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Catalog;
    setCatalog({ plans: data.plans ?? [], classes: data.classes ?? [] });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const hasValidity = draft.durationDays.trim() !== "";
    const body = {
      action: "save",
      id: draft.id,
      nameEs: draft.nameEs.trim(),
      nameEn: draft.nameEn.trim(),
      slug: draft.slug.trim().toLowerCase(),
      period: draft.period,
      priceNio: numberOrNull(draft.priceNio),
      accessKind: hasValidity ? draft.accessKind : null,
      classId: hasValidity && draft.accessKind === "class" ? draft.classId || null : null,
      durationDays: hasValidity ? numberOrNull(draft.durationDays) : null,
      validityCurrency: hasValidity ? draft.validityCurrency : null,
      validityAmount: hasValidity ? numberOrNull(draft.validityAmount) : null,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder) || 0,
    };
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (!res.ok || !parsed?.ok) {
        setNotice({
          tone: "error",
          text: parsed?.message ?? "No se pudo guardar el plan. Recargá antes de repetir.",
        });
        return;
      }
      await refresh();
      setNotice({
        tone: "ok",
        text: body.durationDays
          ? `«${body.nameEs}» guardado. Ya se puede cobrar con vigencia desde la ficha del cliente.`
          : `«${body.nameEs}» guardado. Sin duración, el cobro es genérico y no crea vigencia.`,
      });
      setDraft(emptyDraft(catalog.classes));
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo confirmar el guardado. Recargá antes de repetir; no se duplicó nada.",
      });
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="text-lg font-bold text-ink">
            {draft.id ? "Editar plan" : "Crear plan o modalidad"}
          </h2>
          <p className="text-sm text-fog">
            Al guardar con duración, moneda e importe, el plan aparece solo en el
            cobro de la ficha y crea vigencia real. Si dejás la duración vacía, el
            cobro registra dinero sin fechas.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-fog">
            Nombre en español
            <input className={input} value={draft.nameEs} maxLength={80}
              onChange={(e) => set("nameEs", e.target.value)} />
          </label>
          <label className="text-sm text-fog">
            Nombre en inglés
            <input className={input} value={draft.nameEn} maxLength={80}
              onChange={(e) => set("nameEn", e.target.value)} />
          </label>
          <label className="text-sm text-fog">
            Identificador (slug)
            <input className={input} value={draft.slug} maxLength={48}
              placeholder="zumba-mensual"
              onChange={(e) => set("slug", e.target.value.toLowerCase())} />
          </label>
          <label className="text-sm text-fog">
            Periodo
            <select
              className={input}
              value={draft.period}
              onChange={(e) => set("period", e.target.value as AdminPlan["period"])}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-fog">
            Tarifa rápida en córdobas (opcional)
            <input className={input} inputMode="decimal" value={draft.priceNio}
              placeholder="400"
              onChange={(e) => set("priceNio", e.target.value)} />
          </label>
          <label className="text-sm text-fog">
            Orden en la lista
            <input className={input} inputMode="numeric" value={draft.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)} />
          </label>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line/70 p-3">
          <legend className="px-1 text-sm font-semibold text-ink">Vigencia</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-fog">
              Da acceso a
              <select
                className={input}
                value={draft.accessKind ?? ""}
                onChange={(e) =>
                  set("accessKind", (e.target.value || null) as "gym" | "class" | null)
                }
              >
                <option value="">Sin vigencia (solo cobro)</option>
                <option value="gym">Todo el gimnasio</option>
                <option value="class">Una disciplina</option>
              </select>
            </label>
            <label className="text-sm text-fog">
              Disciplina
              <select
                className={input}
                value={draft.classId}
                disabled={draft.accessKind !== "class"}
                onChange={(e) => set("classId", e.target.value)}
              >
                <option value="">Elegí disciplina</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_es}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-fog">
              Duración en días
              <input className={input} inputMode="numeric" value={draft.durationDays}
                placeholder="30"
                onChange={(e) => set("durationDays", e.target.value)} />
            </label>
            <label className="text-sm text-fog">
              Moneda
              <select className={input} value={draft.validityCurrency}
                onChange={(e) => set("validityCurrency", e.target.value as "NIO" | "USD")}>
                <option value="NIO">Córdobas (C$)</option>
                <option value="USD">Dólares (US$)</option>
              </select>
            </label>
            <label className="text-sm text-fog">
              Importe exacto que activa la vigencia
              <input className={input} inputMode="decimal" value={draft.validityAmount}
                placeholder="400"
                onChange={(e) => set("validityAmount", e.target.value)} />
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-ink">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={draft.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Disponible para vender
            </label>
          </div>
          <p className="text-xs text-fog">
            El importe y la moneda deben coincidir exactamente al cobrar; si no,
            el servidor rechaza el cobro y no crea fechas.
          </p>
        </fieldset>

        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-xl border p-3 text-sm ${notice.tone === "error" ? "border-alert/50 text-alert" : "border-brand/40 text-brand-300"}`}
          >
            {notice.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear plan"}
          </Button>
          {draft.id && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(emptyDraft(catalog.classes));
                setNotice(null);
              }}
            >
              Cancelar edición
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Planes cargados</h2>
        <ul className="space-y-2">
          {catalog.plans.map((plan) => {
            const amount = plan.validity_amount === null ? null : Number(plan.validity_amount);
            const currency = plan.validity_currency ?? "NIO";
            return (
              <li
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {plan.name_es}{" "}
                    {!plan.is_active && (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] text-fog">
                        Desactivado
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-fog">
                    {plan.access_kind === "gym"
                      ? "Todo el gimnasio"
                      : plan.access_kind === "class"
                        ? (plan.class_name ?? "Disciplina")
                        : "Sin vigencia"}{" "}
                    ·{" "}
                    {plan.duration_days
                      ? `${plan.duration_days} ${plan.duration_days === 1 ? "día" : "días"}`
                      : "sin duración"}
                    {amount !== null && ` · ${formatMoney(amount, currency)}`}
                    {plan.price_nio !== null && ` · tarifa ${formatMoney(Number(plan.price_nio), "NIO")}`}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => edit(plan)}>
                  Editar
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
