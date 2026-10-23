"use client";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCrmResource } from "@/components/crm/use-crm-resource";
import { crmRequest } from "@/lib/crm/request";
import {
  financeOptionsSchema,
  movementSchema,
  movementResultSchema,
  receiptSchema,
  type FinanceOptions,
  type MovementIntent,
  type MovementReceipt,
} from "@/lib/finance/movements";

const validateHistory = (value: unknown) =>
  z.array(receiptSchema).safeParse(value).success;
const validateOptions = (value: unknown) =>
  financeOptionsSchema.safeParse(value).success;
const input =
  "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const eventName = "strong-gym:finance-pending";
const subscribe = (fn: () => void) => {
  window.addEventListener("storage", fn);
  window.addEventListener(eventName, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(eventName, fn);
  };
};
const serverSnapshot = () => null;

/** Se guarda el intento ANTES del POST. Respuesta perdida = mismo intento,
 * nunca un nuevo UUID automático. Las opciones no deciden permisos: SQL sí. */
export function MovementForm({
  kind,
  clientId,
  locale,
  disabled = false,
  onRefresh,
  onBusy,
}: {
  kind: "service_income" | "expense";
  clientId?: string;
  locale: string;
  disabled?: boolean;
  onRefresh?: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const key = `strong-gym:finance-v1:${kind}:${clientId ?? "general"}`;
  const read = useCallback(() => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return "UNAVAILABLE";
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const recovered = useMemo(() => {
    if (raw === null) return { intent: null, error: "" };
    try {
      const p = movementSchema.safeParse(JSON.parse(raw));
      if (
        p.success &&
        p.data.kind === kind &&
        (p.data.kind !== "service_income" || p.data.clientId === clientId)
      )
        return { intent: p.data, error: "" };
    } catch {}
    return {
      intent: null,
      error:
        "No se pudo recuperar la referencia local. No se enviará un movimiento nuevo. Revisá el historial antes de descartar este registro.",
    };
  }, [raw, kind, clientId]);
  const pending = recovered.intent;
  const [revision, setRevision] = useState(0);
  const options = useCrmResource<FinanceOptions>(
    "/api/admin/finance",
    revision,
    true,
    validateOptions,
  );
  const historyUrl = `/api/admin/finance?history=${kind}${kind === "service_income" ? `&client=${clientId}` : ""}`;
  const history = useCrmResource<MovementReceipt[]>(
    historyUrl,
    revision,
    true,
    validateHistory,
  );
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const selectedCurrency = pending?.currency ?? currency;
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const missingChoices =
    !!options.data &&
    (!options.data.accounts.some((a) => a.currency === selectedCurrency) ||
      !options.data.methods.some((m) =>
        selectedCurrency === "NIO" ? m.accepts_nio : m.accepts_usd,
      ) ||
      (kind === "expense" && options.data.categories.length === 0));
  const blocked =
    disabled ||
    missingChoices ||
    busy ||
    options.loading ||
    !!options.error ||
    options.data?.writes_enabled !== true ||
    !!recovered.error;
  async function pay(body: MovementIntent) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setMessage("");
    // Un resultado anterior no es el comprobante del intento que ahora se envía.
    setReceipt(null);
    try {
      try {
        sessionStorage.setItem(key, JSON.stringify(body));
        window.dispatchEvent(new window.Event(eventName));
      } catch {
        setMessage(
          "No se pudo guardar la referencia local. No se envió el movimiento; revisá el almacenamiento del navegador.",
        );
        return;
      }
      const parsedResult = movementResultSchema.safeParse(
        await crmRequest<unknown>("/api/admin/finance", body),
      );
      if (!parsedResult.success)
        throw new Error(
          "El servidor no devolvió un comprobante válido; no se pudo confirmar el resultado.",
        );
      const result = parsedResult.data;
      setReceipt(result.id);
      setMessage(
        "Movimiento confirmado. Abrí el comprobante interno para revisar los datos guardados.",
      );
      try {
        sessionStorage.removeItem(key);
        window.dispatchEvent(new window.Event(eventName));
      } catch {
        setMessage(
          "Movimiento confirmado. No se pudo quitar la referencia local; reintentar devuelve el mismo comprobante.",
        );
      }
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "No se pudo confirmar."} Conservá esta referencia y revisá el historial. Reintentar no crea otro intento.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy?.(false);
      setRevision((n) => n + 1);
      onRefresh?.();
    }
  }
  const router = useRouter();
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-bold text-ink">
        {kind === "expense" ? "Registrar gasto" : "Cobro por servicio"}
      </h2>
      <p className="text-sm text-fog">
        {kind === "expense"
          ? "Descuenta de la cuenta en su moneda. Puede dejar un saldo negativo; se mostrará en el comprobante."
          : "Registra el ingreso recibido. No reduce deudas, no crea crédito ni renueva planes. No lo uses para un abono de deuda o un anticipo."}{" "}
        No emite factura fiscal ni descuenta comisiones automáticamente.
      </p>
      <p className="text-sm text-fog">
        Ingresá la tasa NIO por 1 USD usada para los equivalentes de reportes,
        también al registrar NIO. No convierte ni transfiere dinero entre
        cuentas.
      </p>
      {missingChoices && !options.loading && !options.error && (
        <p role="alert" className="text-sm text-alert">
          Falta una cuenta o método activo para esta moneda, o una categoría de
          gastos. No se enviarán movimientos hasta configurar las opciones
          reales.
        </p>
      )}
      {options.loading && <p role="status">Cargando opciones verificadas…</p>}
      {options.error && (
        <p role="alert" className="break-words text-alert">
          {options.error}
        </p>
      )}
      {options.data?.writes_enabled === false && (
        <p role="alert" className="text-alert">
          Escritura no habilitada. Revisá la actualización, permisos y
          disparadores; no se habilitan intentos nuevos. Un reintento conserva
          su referencia y la base verifica si puede completarse.
        </p>
      )}
      <button
        type="button"
        className="text-sm text-brand-300 underline disabled:opacity-50"
        disabled={busy}
        onClick={() => setRevision((n) => n + 1)}
      >
        Reintentar
      </button>
      <form
        key={`${kind}:${clientId ?? "expense"}:${pending?.requestId ?? "new"}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked || pending || lock.current) return;
          const f = new FormData(event.currentTarget);
          const parsed = movementSchema.safeParse({
            kind,
            requestId: crypto.randomUUID(),
            amount: Number(f.get("amount")),
            currency: selectedCurrency,
            method: String(f.get("method")),
            account: String(f.get("account")),
            concept: String(f.get("concept")),
            fx: Number(f.get("fx")),
            ...(kind === "expense"
              ? { category: String(f.get("category")) }
              : { clientId }),
          });
          if (!parsed.success) {
            setMessage(
              "Revisá los campos, decimales y tasa. No se envió el movimiento.",
            );
            return;
          }
          const d = parsed.data;
          if (
            !window.confirm(
              `¿Registrar ${kind === "expense" ? "gasto" : "cobro por servicio"} de ${d.currency} ${d.amount.toFixed(2)}, tasa NIO/USD ${d.fx}? Cuenta: ${options.data?.accounts.find((a) => a.id === d.account)?.name}. Concepto: ${d.concept}. ${kind === "expense" ? "Puede dejar saldo negativo." : "No aplica deuda, crédito ni vigencia."}`,
            )
          )
            return;
          void pay(d);
        }}
        className="space-y-3"
      >
        <fieldset
          disabled={blocked || !!pending}
          className="grid min-w-0 gap-3 sm:grid-cols-2"
        >
          <label className="min-w-0 text-sm text-fog">
            Monto
            <input
              className={input}
              name="amount"
              type="number"
              min="0.01"
              max="99999999"
              step="0.01"
              required
              defaultValue={pending?.amount}
            />
          </label>
          <label className="min-w-0 text-sm text-fog">
            Moneda
            <select
              className={input}
              value={selectedCurrency}
              onChange={(e) => setCurrency(e.target.value as "NIO" | "USD")}
            >
              <option>NIO</option>
              <option>USD</option>
            </select>
          </label>
          <label className="min-w-0 text-sm text-fog">
            Método
            <select
              key={`method:${selectedCurrency}`}
              className={input}
              name="method"
              required
              defaultValue={pending?.method ?? ""}
            >
              <option value="">Elegí método</option>
              {options.data?.methods
                .filter((m) =>
                  selectedCurrency === "NIO" ? m.accepts_nio : m.accepts_usd,
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_es}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-0 text-sm text-fog">
            Cuenta
            <select
              key={`account:${selectedCurrency}`}
              className={input}
              name="account"
              required
              defaultValue={pending?.account ?? ""}
            >
              <option value="">Elegí cuenta</option>
              {options.data?.accounts
                .filter((a) => a.currency === selectedCurrency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-0 text-sm text-fog">
            Tasa NIO por 1 USD
            <input
              className={input}
              name="fx"
              type="number"
              min="0.0001"
              max="10000"
              step="0.0001"
              required
              defaultValue={pending?.fx}
            />
          </label>
          {kind === "expense" && (
            <label className="min-w-0 text-sm text-fog">
              Categoría
              <select
                className={input}
                name="category"
                required
                defaultValue={
                  pending?.kind === "expense" ? pending.category : ""
                }
              >
                <option value="">Elegí categoría</option>
                {options.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="min-w-0 text-sm text-fog sm:col-span-2">
            Concepto
            <input
              className={input}
              name="concept"
              minLength={2}
              maxLength={200}
              required
              defaultValue={pending?.concept}
            />
          </label>
        </fieldset>
        <button
          type="submit"
          disabled={blocked || !!pending}
          className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-onbrand disabled:opacity-50"
        >
          {busy
            ? "Confirmando…"
            : kind === "expense"
              ? "Confirmar gasto"
              : "Confirmar cobro por servicio"}
        </button>
      </form>
      {(pending || recovered.error) && (
        <div className="space-y-3 rounded-xl border border-alert/40 p-3 text-sm">
          <p className="break-all">
            {pending
              ? `Intento pendiente de revisión: ${pending.requestId}`
              : recovered.error}
          </p>
          {pending && (
            <p>
              {pending.currency} {pending.amount.toFixed(2)} · tasa {pending.fx}{" "}
              · {pending.concept}
            </p>
          )}
          {pending && (
            <button
              type="button"
              disabled={disabled || busy || !!recovered.error}
              className="block text-brand-300 underline disabled:opacity-50"
              onClick={() => void pay(pending)}
            >
              Reintentar exactamente el mismo movimiento
            </button>
          )}
          <button
            type="button"
            disabled={busy || disabled}
            className="block text-fog underline disabled:opacity-50"
            onClick={() => {
              if (
                !window.confirm(
                  "Revisá primero el historial y los comprobantes. Descartar este registro NO anula un movimiento que llegó al servidor. Crear otro intento puede duplicarlo. ¿Ya verificaste el resultado?",
                )
              )
                return;
              try {
                sessionStorage.removeItem(key);
                window.dispatchEvent(new window.Event(eventName));
                setMessage(
                  "Referencia local descartada tras revisión. No se anuló ningún movimiento.",
                );
              } catch {
                setMessage("No se pudo modificar el almacenamiento local.");
              }
            }}
          >
            Ya revisé el historial · descartar referencia local
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="break-words text-sm text-brand-300">
          {message}
        </p>
      )}
      {receipt && (
        <Link
          className="block break-all text-brand-300 underline"
          href={`/${locale}/panel/comprobantes/${receipt}`}
        >
          Abrir comprobante interno · {receipt}
        </Link>
      )}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-semibold">
          Últimos 50 comprobantes del nuevo registro
        </h3>
        {history.loading && (
          <p role="status" className="text-sm text-fog">
            Consultando comprobantes…
          </p>
        )}
        {history.error && (
          <p role="alert" className="text-sm text-alert">
            {history.error} No significa que no haya movimientos.
          </p>
        )}
        {!history.loading && !history.error && history.data?.length === 0 && (
          <p className="text-sm text-fog">
            Sin comprobantes del nuevo registro en esta consulta. Los históricos
            anteriores siguen en Caja o en la ficha.
          </p>
        )}
        {!history.loading && !history.error && history.data && (
          <ul className="space-y-2">
            {history.data.map((r) => (
              <li key={r.id} className="min-w-0 break-words text-sm">
                <Link
                  className="text-brand-300 underline"
                  href={`/${locale}/panel/comprobantes/${r.id}`}
                >
                  {r.currency} {r.amount.toFixed(2)} · {r.concept}
                </Link>
                <p className="break-all text-xs text-fog">{r.requestId}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="text-sm text-fog underline"
        disabled={busy}
        onClick={() => {
          setRevision((n) => n + 1);
          router.refresh();
        }}
      >
        Actualizar historial y saldos
      </button>
    </section>
  );
}
