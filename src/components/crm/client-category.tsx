"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  calculatedCategories,
  type CalculatedCategory,
} from "@/lib/crm/types";

/** Respuesta de `client_category()` (CLI-02). */
export type ClientCategory = {
  category: CalculatedCategory;
  auto_category: CalculatedCategory;
  reason: string;
  source: "auto" | "manual";
  manual: boolean;
  manual_reason: string | null;
  validity_days: number;
  visits_30_days: number;
  purchases_90_days: number;
  gym: { state: string; expires_on: string | null } | null;
  classes: {
    class_id: string;
    class_name: string | null;
    expires_on: string;
  }[];
};

const formatDate = (value: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Categoría de la ficha: muestra la categoría real según la vigencia y, para
 * administración, permite fijarla a mano con motivo. La decisión manual gana
 * sobre el cálculo y queda auditada.
 */
export function ClientCategoryPanel({
  clientId,
  isAdmin,
  disabled,
  onChanged,
}: {
  clientId: string;
  isAdmin: boolean;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const [info, setInfo] = useState<ClientCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<CalculatedCategory>("comun");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  // La lectura se dispara con el cliente o cuando se pide recargar; el estado
  // se actualiza en la respuesta, nunca durante el render.
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/categories?client=${encodeURIComponent(clientId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | (ClientCategory & { message?: string })
          | null;
        if (!alive) return;
        if (!res.ok || !data?.category) {
          setError(
            data?.message ??
              "No se pudo calcular la categoría con la vigencia actual. No se muestra un valor inventado.",
          );
          setInfo(null);
          return;
        }
        setError(null);
        setInfo(data);
        setCategory(data.category);
      })
      .catch(() => {
        if (!alive) return;
        setError("No se pudo leer la categoría. Reintentá la lectura de la ficha.");
        setInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [clientId, reloadKey]);

  async function send(body: unknown, okText: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: data?.message ?? "No se pudo guardar. Recargá antes de repetir.",
        });
        return;
      }
      setNotice({ tone: "ok", text: okText });
      setReason("");
      setReloadKey((value) => value + 1);
      onChanged?.();
    } catch {
      setNotice({
        tone: "error",
        text: "No se pudo guardar. Revisá la conexión y recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <section className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h3 className="text-lg font-bold text-ink">Categoría del cliente</h3>
        <p role="alert" className="text-[0.875rem] text-red-300">
          {error}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={busy}
        onClick={() => {
          setError(null);
          setReloadKey((value) => value + 1);
        }}
      >
          Reintentar
        </Button>
      </section>
    );

  if (!info)
    return (
      <section className="rounded-2xl border border-line bg-card p-4">
        <h3 className="text-lg font-bold text-ink">Categoría del cliente</h3>
        <p className="text-[0.875rem] text-fog">Calculando con la vigencia de hoy…</p>
      </section>
    );

  const vip = info.category === "strong_gym";

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">Categoría del cliente</h3>
          <p className="text-[0.875rem] text-mist">
            Sale de la vigencia pagada, no de la etiqueta del plan asignado.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${
            vip
              ? "border-brand/60 bg-brand/15 text-brand-300"
              : "border-line bg-paper/60 text-ink"
          }`}
        >
          {calculatedCategories[info.category]}
        </span>
      </div>

      <ul className="space-y-1 text-[0.875rem] text-mist">
        <li>
          <strong className="text-ink">Motivo:</strong> {info.reason}
        </li>
        {info.gym?.state === "active" && info.gym.expires_on ? (
          <li>
            Gimnasio vigente hasta el {formatDate(info.gym.expires_on)}.
          </li>
        ) : null}
        {info.classes.map((item) => (
          <li key={item.class_id}>
            {item.class_name ?? "Disciplina"} vigente hasta el{" "}
            {formatDate(item.expires_on)}.
          </li>
        ))}
        <li>
          {info.visits_30_days} visita{info.visits_30_days === 1 ? "" : "s"} en 30
          días · {info.purchases_90_days} compra
          {info.purchases_90_days === 1 ? "" : "s"} en 90 días.
        </li>
      </ul>

      {info.manual ? (
        <div className="space-y-2 rounded-xl border border-brand/40 bg-brand/[0.08] px-3 py-2">
          <p className="text-[0.875rem] text-ink">
            <strong>Fijada a mano por administración.</strong> Motivo:{" "}
            {info.manual_reason}
          </p>
          <p className="text-[0.8125rem] text-fog">
            El cálculo automático diría «{calculatedCategories[info.auto_category]}».
          </p>
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Motivo para volver al cálculo"
                maxLength={200}
                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.875rem] text-ink"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || disabled || reason.trim().length < 4}
                onClick={() =>
                  send(
                    {
                      action: "clear-override",
                      clientId,
                      reason: reason.trim(),
                    },
                    "La categoría vuelve al cálculo automático.",
                  )
                }
              >
                Volver al cálculo
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="space-y-2 rounded-xl border border-line bg-paper/50 px-3 py-3">
          <p className="text-[0.875rem] font-semibold text-ink">
            Fijar la categoría a mano
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[0.8125rem] text-mist">
              Categoría
              <select
                value={category}
                disabled={busy || disabled}
                onChange={(event) =>
                  setCategory(event.target.value as CalculatedCategory)
                }
                className="ml-2 rounded-lg border border-line bg-paper px-2 py-2 text-ink"
              >
                {(["strong_gym", "familia", "amigo", "comun"] as const).map((key) => (
                  <option key={key} value={key}>
                    {calculatedCategories[key]}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo (obligatorio)"
              maxLength={200}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.875rem] text-ink"
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || disabled || reason.trim().length < 4}
              onClick={() =>
                send(
                  { action: "set-override", clientId, category, reason: reason.trim() },
                  "Categoría fijada y registrada en la bitácora del cliente.",
                )
              }
            >
              Fijar categoría
            </Button>
          </div>
          <p className="text-[0.75rem] text-fog">
            La decisión manual gana sobre el cálculo y queda con tu nombre y la
            fecha en el historial de la ficha.
          </p>
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
    </section>
  );
}
