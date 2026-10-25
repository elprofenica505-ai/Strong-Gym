"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/format-money";

export type GymTariffSlug =
  | "pase-del-dia"
  | "gimnasio-semanal"
  | "gimnasio-quincenal"
  | "gimnasio-mensual";

/**
 * Editor reutilizable de una tarifa NIO de pesas y máquinas. La API y la
 * función SQL vuelven a comprobar administrador con MFA y la lista cerrada
 * de planes; esta pantalla nunca edita Boxeo ni el precio histórico en USD.
 */
export function PlanTariffEditor({
  slug,
  nameEs,
  periodSuffix,
  placeholder,
  initialPriceNio,
  isActive,
}: {
  slug: GymTariffSlug;
  nameEs: string;
  periodSuffix: string;
  placeholder: string;
  initialPriceNio: number | null;
  isActive: boolean;
}) {
  const router = useRouter();
  const [currentPrice, setCurrentPrice] = useState(initialPriceNio);
  const [value, setValue] = useState(
    initialPriceNio === null ? "" : String(initialPriceNio),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const titleId = `tarifa-${slug}-titulo`;
  const inputId = `tarifa-${slug}-precio-nio`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const raw = value.trim().replace(",", ".");
    let priceNio: number | null;

    if (raw === "") {
      if (currentPrice === null) {
        setNotice({
          tone: "ok",
          text: `«${nameEs}» ya no tiene una tarifa rápida configurada.`,
        });
        return;
      }
      if (
        !window.confirm(
          `¿Quitar la tarifa de «${nameEs}»? La web volverá a mostrar «Consultar» y recepción no mostrará ese botón rápido. No se borra ningún cobro anterior.`,
        )
      )
        return;
      priceNio = null;
    } else {
      priceNio = Number(raw);
      const hasValidCents =
        Math.abs(priceNio * 100 - Math.round(priceNio * 100)) < 1e-9;
      if (
        !Number.isFinite(priceNio) ||
        priceNio <= 0 ||
        priceNio > 99999999 ||
        !hasValidCents
      ) {
        setNotice({
          tone: "error",
          text: "Escribí un precio válido en córdobas, con dos decimales como máximo.",
        });
        return;
      }
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_plan_price", slug, priceNio }),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
        slug?: unknown;
        nameEs?: unknown;
        priceNio?: unknown;
      } | null;

      if (!res.ok) {
        setNotice({
          tone: "error",
          text:
            json?.message ??
            "No se pudo guardar la tarifa. No se modificó ningún precio.",
        });
        return;
      }

      const savedPrice =
        !json ||
        json.slug !== slug ||
        !Object.prototype.hasOwnProperty.call(json, "priceNio")
          ? Number.NaN
          : json.priceNio === null
            ? null
            : Number(json.priceNio);
      if (savedPrice !== null && !Number.isFinite(savedPrice)) {
        setNotice({
          tone: "error",
          text: "No pudimos confirmar la tarifa guardada. Recargá la pantalla antes de repetir.",
        });
        return;
      }

      const responseName = json?.nameEs;
      const confirmedName =
        typeof responseName === "string" && responseName
          ? responseName
          : nameEs;
      setCurrentPrice(savedPrice);
      setValue(savedPrice === null ? "" : String(savedPrice));
      setNotice({
        tone: "ok",
        text:
          savedPrice === null
            ? `Tarifa rápida de «${confirmedName}» quitada. La web mostrará «Consultar» y recepción usará el cobro normal.`
            : `Tarifa de «${confirmedName}» guardada: ${formatMoney(savedPrice, "NIO")} ${periodSuffix}.`,
      });
      router.refresh();
    } catch {
      setNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar si la tarifa cambió; recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex h-full flex-col gap-5 rounded-2xl border border-line bg-card p-5"
    >
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">
          Pesas y máquinas · Recepción
        </p>
        <h2 id={titleId} className="mt-1 text-[1rem] font-semibold text-ink">
          {nameEs}
        </h2>
        <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-mist">
          Este precio está en córdobas. Se muestra en la web y prepara el cobro
          rápido en la ficha del cliente. Cobrarlo no activa vigencia
          automáticamente y no cambia ningún cobro ya registrado.
        </p>
      </div>

      <p className="rounded-xl bg-brand/[0.08] px-4 py-3 text-[0.875rem] text-ink">
        Precio actual:{" "}
        <strong>
          {currentPrice === null
            ? "sin tarifa rápida (la web muestra «Consultar»)"
            : `${formatMoney(currentPrice, "NIO")} ${periodSuffix}`}
        </strong>
      </p>

      {!isActive ? (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-400/[0.06] px-4 py-3 text-[0.8125rem] text-red-300"
        >
          El plan «{nameEs}» está inactivo. Podés guardar la tarifa, pero el
          botón rápido no aparecerá en recepción hasta volver a activarlo.
        </p>
      ) : null}

      <form onSubmit={save} className="flex flex-col gap-4">
        <label htmlFor={inputId} className="flex flex-col gap-2 text-sm text-fog">
          <span className="font-semibold text-ink">Precio de {nameEs} (C$)</span>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min="0.01"
            max="99999999"
            step="0.01"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60"
          />
          <span>
            Dejá el campo vacío y guardá solo si querés quitar esta tarifa
            rápida.
          </span>
        </label>

        <Button type="submit" disabled={busy} className="self-start">
          {busy ? "Guardando…" : "Guardar tarifa"}
        </Button>
      </form>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`rounded-xl px-4 py-2 text-[0.8125rem] ${
            notice.tone === "ok"
              ? "bg-brand/[0.08] text-ink"
              : "border border-red-400/40 bg-red-400/[0.06] text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
