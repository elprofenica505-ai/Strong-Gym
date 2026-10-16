"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/providers/dictionary-provider";
import {
  categories,
  frequency,
  type ClientDetail,
  type CrmOptions,
  type Directory,
  type GymClient,
} from "@/lib/crm/types";
import { crmActionSchema } from "@/lib/crm/schemas";
import { ClientCard } from "./client-card";
import { QrScanner } from "./qr-scanner";
const input =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const emptyOptions: CrmOptions = { plans: [], methods: [], accounts: [] };
export async function crmRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res
    .json()
    .catch(() => ({ error: "Respuesta no válida. Revisá la conexión." }));
  if (!res.ok)
    throw new Error(json.error || "No se pudo completar la operación.");
  return json as T;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm text-fog">
      <span>{label}</span>
      {children}
    </label>
  );
}
const fmt = (value: string) =>
  new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function ClientsPanel({
  isAdmin,
  isDemo,
}: {
  isAdmin: boolean;
  isDemo: boolean;
}) {
  const { locale } = useDictionary();
  const [directory, setDirectory] = useState<Directory>({ rows: [], total: 0 });
  const [options, setOptions] = useState<CrmOptions>(emptyOptions);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const requestKey = JSON.stringify([query, category, offset, revision]);
  const loading = !isDemo && loadedKey !== requestKey;
  useEffect(() => {
    if (isDemo) return;
    const ctl = new AbortController();
    crmRequest<CrmOptions>(
      "/api/admin/clients?mode=options",
      undefined,
      ctl.signal,
    )
      .then(setOptions)
      .catch((e) => {
        if (!ctl.signal.aborted) setError(e.message);
      });
    return () => ctl.abort();
  }, [isDemo]);
  useEffect(() => {
    if (isDemo) return;
    const ctl = new AbortController();
    const params = new URLSearchParams({
      search: query,
      category,
      offset: String(offset),
    });
    crmRequest<Directory>(`/api/admin/clients?${params}`, undefined, ctl.signal)
      .then((d) => {
        setDirectory(d);
        setError("");
      })
      .catch((e) => {
        if (!ctl.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoadedKey(requestKey);
      });
    return () => ctl.abort();
  }, [query, category, offset, revision, isDemo, requestKey]);
  useEffect(() => {
    if (!selected || isDemo) return;
    const ctl = new AbortController();
    crmRequest<ClientDetail>(
      `/api/admin/clients?id=${selected}`,
      undefined,
      ctl.signal,
    )
      .then(setDetail)
      .catch((e) => {
        if (!ctl.signal.aborted) setError(e.message);
      });
    return () => ctl.abort();
  }, [selected, revision, isDemo]);
  function select(id: string, token: string | null = null) {
    setDetail(null);
    setSelected(id);
    setRevision((n) => n + 1);
    setScanToken(token);
    setCreating(false);
    setNotice("");
    setError("");
  }
  async function action(body: unknown): Promise<unknown> {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await crmRequest<{ data: unknown }>(
        "/api/admin/clients",
        body,
      );
      setRevision((n) => n + 1);
      return result.data;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sin conexión. No se confirmó la operación.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function scan(token: string) {
    if (busy) throw new Error("Esperá a que termine la operación actual.");
    const result = await crmRequest<{ data: string }>("/api/admin/clients", {
      action: "find-card",
      token,
    });
    select(result.data, token);
  }
  return (
    <div className="container-x space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Fase 2 · Clientes y recepción</p>
          <h1 className="display-xl mt-3 text-3xl sm:text-4xl">
            Clientes y recepción
          </h1>
        </div>
        <Link
          href={`/${locale}/panel/caja`}
          className="text-brand-300 underline"
        >
          Ir a caja
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-fog">
        Sin celular, sin correo o sin carnet: siempre podés buscar al cliente
        manualmente. Las etiquetas sirven para futuras promociones; no cambian
        precios ni se asignan por frecuencia automáticamente.
      </p>
      {isDemo ? (
        <p className="rounded-xl border border-brand/40 bg-card p-5 text-brand-300">
          Vista de demostración sin escritura. Para probar el CRM real,
          configurá Supabase y aplicá FASE2.sql. Los ejemplos opcionales están
          separados en 00021_clients_seed.sql.
        </p>
      ) : (
        <QrScanner
          key={busy ? "locked" : "ready"}
          onRead={scan}
          disabled={busy}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-alert bg-card p-4 text-alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand/40 p-4 text-brand-300"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isDemo || busy}
          onClick={() => {
            setCreating(!creating);
            setSelected(null);
            setDetail(null);
          }}
        >
          Nuevo cliente
        </Button>
        <Button
          variant="outline"
          disabled={isDemo || busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          Actualizar
        </Button>
      </div>
      {creating && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              const id = await action({
                action: "create",
                name: form.get("name"),
                phone: form.get("phone"),
                email: form.get("email"),
                plan: form.get("plan"),
                confirmDuplicate: form.get("confirmDuplicate") === "on",
              });
              if (typeof id === "string") {
                select(id);
                setNotice(
                  "Cliente creado. Revisá su nombre; ya podés registrar entrada o cobrar.",
                );
              }
            } catch {}
          }}
          className="rounded-2xl border border-brand/40 bg-card p-5 space-y-4"
        >
          <h2 className="text-xl font-bold">
            Alta rápida · no crea una cuenta de acceso
          </h2>
          <p className="text-sm text-fog">
            Buscá primero para evitar duplicados. Sólo el nombre es obligatorio.
            La etiqueta inicial es Clientes.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo *">
              <input
                className={input}
                name="name"
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <input className={input} name="phone" type="tel" maxLength={40} />
            </Field>
            <Field label="Correo (opcional)">
              <input
                className={input}
                name="email"
                type="email"
                maxLength={120}
              />
            </Field>
            <Field label="Plan (opcional)">
              <select className={input} name="plan">
                <option value="">Sin plan asignado</option>
                {options.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_es}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex gap-2 text-xs text-fog">
            <input type="checkbox" name="confirmDuplicate" /> Si hay
            coincidencias, ya las revisé: esta ficha corresponde a otra persona.
          </label>
          <Button disabled={busy}>Guardar cliente</Button>
        </form>
      )}
      <section className="rounded-2xl border border-line bg-card p-5 space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setOffset(0);
          }}
        >
          <Field label="Nombre, teléfono o número de cliente">
            <input
              className={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={120}
              placeholder="Buscar antes de crear…"
            />
          </Field>
          <Field label="Etiqueta">
            <select
              className={input}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las etiquetas</option>
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Button className="self-end" disabled={isDemo || busy}>
            Buscar
          </Button>
        </form>
        <p role="status" className="text-xs text-fog">
          {loading
            ? "Cargando…"
            : `${directory.total} clientes · hasta 30 por página`}
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {directory.rows.map((c) => (
            <button
              disabled={busy}
              key={c.id}
              onClick={() => select(c.id)}
              className={`rounded-xl border p-4 text-left transition-colors hover:border-brand ${selected === c.id ? "border-brand bg-brand/10" : "border-line bg-paper"}`}
            >
              <p className="font-bold">
                #{c.client_number} · {c.full_name}
              </p>
              <p className="mt-1 text-sm text-brand-300">
                {categories[c.category]}
                {c.is_demo ? " · EJEMPLO" : ""}
              </p>
              <p className="text-xs text-fog">
                {c.phone || "Sin teléfono"} · {c.plan_name || "Sin plan"} ·{" "}
                {c.status === "active"
                  ? "Activo"
                  : c.status === "frozen"
                    ? "Congelado"
                    : "Cancelado"}
              </p>
              <p className="mt-2 text-xs text-fog">
                {frequency(c.visits_30 ?? 0)}
              </p>
              <p className="text-xs text-fog">
                Última visita:{" "}
                {c.last_visit ? fmt(c.last_visit) : "Sin registro"}
              </p>
            </button>
          ))}
        </div>
        {!loading && !directory.rows.length && (
          <p className="py-5 text-fog">
            No hay resultados. Revisá otro nombre antes de crear una ficha
            nueva.
          </p>
        )}
        <div className="flex justify-between gap-3">
          <Button
            variant="outline"
            disabled={!offset || loading || busy}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={offset + 30 >= directory.total || loading || busy}
            onClick={() => setOffset(offset + 30)}
          >
            Siguiente
          </Button>
        </div>
      </section>
      {selected && !detail && <p role="status">Cargando ficha…</p>}
      {detail && (
        <section className="rounded-2xl border border-brand/30 bg-card p-5 space-y-6">
          <h2 className="display-xl text-2xl">
            #{detail.client.client_number} · {detail.client.full_name}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || detail.client.status !== "active"}
              onClick={async () => {
                try {
                  const r = (await action({
                    action: "check-in",
                    id: detail.client.id,
                    source: scanToken ? "qr" : "manual",
                    ...(scanToken ? { token: scanToken } : {}),
                  })) as { already: boolean };
                  if (r)
                    setNotice(
                      r.already
                        ? "Este cliente ya tiene una visita registrada hoy. No se duplicó."
                        : "Entrada registrada. No se realizó ningún cobro.",
                    );
                } catch {}
              }}
            >
              Confirmar entrada {scanToken ? "por QR" : "manual"}
            </Button>
            <span className="self-center text-xs text-fog">
              Una visita por día · hora de Nicaragua
            </span>
          </div>
          {detail.client.status !== "active" && (
            <p className="text-alert">
              Ficha congelada/cancelada: revisá el estado antes de registrar
              asistencia.
            </p>
          )}
          {detail.balance !== null ? (
            <p className="text-sm text-fog">
              Saldo de cuenta vinculada: C$ {Number(detail.balance).toFixed(2)}{" "}
              (+ a favor / − deuda). No bloquea entradas automáticamente.
            </p>
          ) : (
            <p className="text-sm text-fog">
              Sin saldo financiero vinculado. Los cobros de esta ficha se
              muestran abajo; esto no significa que esté al día ni genera una
              cuenta por cobrar.
            </p>
          )}
          <EditClient
            key={`${detail.client.id}:${detail.client.updated_at ?? detail.client.created_at}`}
            client={detail.client}
            options={options}
            isAdmin={isAdmin}
            busy={busy}
            save={async (body) => {
              await action(body);
              setNotice("Ficha guardada. Las etiquetas no cambian precios.");
            }}
          />
          <div className="grid gap-8 xl:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-lg font-bold">Carnet digital o impreso</h3>
              <ClientCard
                name={detail.client.full_name}
                number={detail.client.client_number}
                token={detail.card}
              />
              <Button
                disabled={busy}
                variant="outline"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "¿Reemplazar el QR? El carnet anterior dejará de servir; tendrás que entregar el nuevo.",
                    )
                  )
                    return;
                  try {
                    await action({
                      action: "rotate-card",
                      id: detail.client.id,
                    });
                    setScanToken(null);
                    setNotice(
                      "QR reemplazado. Imprimí o entregá el nuevo carnet.",
                    );
                  } catch {}
                }}
              >
                Reemplazar QR perdido
              </Button>
            </div>
            <PaymentForm
              key={detail.client.id}
              clientId={detail.client.id}
              options={options}
              blocked={busy}
              onBusy={setBusy}
              onRefresh={() => setRevision((n) => n + 1)}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg font-bold">Últimas 60 entradas</h3>
              <ul className="space-y-2 text-sm">
                {detail.visits.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line p-3">
                    {fmt(v.visited_at)} · {v.source === "qr" ? "QR" : "Manual"}
                  </li>
                ))}
              </ul>
              {!detail.visits.length && (
                <p className="text-fog">Sin entradas registradas.</p>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-lg font-bold">Últimos 40 cobros</h3>
              <ul className="space-y-2 text-sm">
                {detail.payments.map((p) => (
                  <li key={p.id} className="rounded-lg border border-line p-3">
                    <p>
                      {p.currency} {Number(p.amount).toFixed(2)} · {p.concept}
                    </p>
                    <p className="text-xs text-fog">
                      {fmt(p.occurred_at)} · {p.status}
                    </p>
                    <p className="break-all text-xs text-fog">
                      Referencia: {p.id}
                    </p>
                  </li>
                ))}
              </ul>
              {!detail.payments.length && (
                <p className="text-fog">Sin cobros registrados.</p>
              )}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-brand-300">
              Historial de cambios (últimos 40)
            </summary>
            <ul className="mt-3 space-y-2 text-xs text-fog">
              {detail.events.map((e) => (
                <li key={e.id}>
                  {fmt(e.created_at)} ·{" "}
                  {(
                    {
                      created: "Alta",
                      updated: "Ficha actualizada",
                      card_reset: "QR reemplazado",
                      payment: "Cobro registrado",
                    } as Record<string, string>
                  )[e.action] || e.action}
                  {e.details.category_after &&
                    ` · ${categories[e.details.category_before as keyof typeof categories]} → ${categories[e.details.category_after as keyof typeof categories]}`}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
function EditClient({
  client,
  options,
  isAdmin,
  busy,
  save,
}: {
  client: GymClient;
  options: CrmOptions;
  isAdmin: boolean;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
}) {
  return (
    <details>
      <summary className="cursor-pointer font-semibold text-brand-300">
        Editar ficha y etiqueta
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          try {
            await save({
              action: "update",
              id: client.id,
              name: d.get("name"),
              phone: d.get("phone"),
              email: d.get("email"),
              plan: d.get("plan"),
              category: isAdmin ? d.get("category") : client.category,
              status: d.get("status"),
              notes: d.get("notes"),
            });
          } catch {}
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *">
            <input
              className={input}
              name="name"
              defaultValue={client.full_name}
              required
              minLength={2}
              maxLength={120}
            />
          </Field>
          <Field label="Teléfono">
            <input
              className={input}
              name="phone"
              type="tel"
              defaultValue={client.phone ?? ""}
              maxLength={40}
            />
          </Field>
          <Field label="Correo">
            <input
              className={input}
              name="email"
              type="email"
              defaultValue={client.email ?? ""}
              maxLength={120}
            />
          </Field>
          <Field label="Etiqueta (sólo admin)">
            <select
              className={input}
              name="category"
              defaultValue={client.category}
              disabled={!isAdmin}
            >
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select
              className={input}
              name="status"
              defaultValue={client.status}
            >
              <option value="active">Activo</option>
              <option value="frozen">Congelado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </Field>
          <Field label="Plan">
            <select
              className={input}
              name="plan"
              defaultValue={client.plan_id ?? ""}
            >
              <option value="">Sin plan</option>
              {client.plan_id &&
                !options.plans.some((p) => p.id === client.plan_id) && (
                  <option value={client.plan_id}>
                    Plan anterior (inactivo)
                  </option>
                )}
              {options.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_es}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notas internas comerciales (no datos médicos)">
            <textarea
              className={input}
              name="notes"
              defaultValue={client.notes}
              maxLength={2000}
            />
          </Field>
        </fieldset>
        <Button disabled={busy}>Guardar cambios</Button>
      </form>
    </details>
  );
}
type PaymentIntent = {
  action: "payment";
  id: string;
  requestId: string;
  amount: number;
  currency: string;
  method: string;
  account: string;
  concept: string;
  fx: number;
};
function PaymentForm({
  clientId,
  options,
  blocked,
  onBusy,
  onRefresh,
}: {
  clientId: string;
  options: CrmOptions;
  blocked: boolean;
  onBusy: (b: boolean) => void;
  onRefresh: () => void;
}) {
  const key = `strong-gym:crm-payment:${clientId}`;
  const [pending, setPending] = useState<PaymentIntent | null>(() => {
    try {
      const parsed = crmActionSchema.safeParse(
        JSON.parse(sessionStorage.getItem(key) || "null"),
      );
      return parsed.success &&
        parsed.data.action === "payment" &&
        parsed.data.id === clientId
        ? parsed.data
        : null;
    } catch {
      return null;
    }
  });
  const intent = useRef<PaymentIntent | null>(pending);
  const [currency, setCurrency] = useState(pending?.currency ?? "NIO");
  const [message, setMessage] = useState("");
  async function pay(body: PaymentIntent) {
    onBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
      intent.current = body;
      setPending(body);
      const res = await crmRequest<{ data: string }>(
        "/api/admin/clients",
        body,
      );
      sessionStorage.removeItem(key);
      intent.current = null;
      setPending(null);
      setMessage(`Cobro confirmado. Referencia: ${res.data}`);
      onRefresh();
    } catch (e) {
      setMessage(
        `${e instanceof Error ? e.message : "No se pudo confirmar."} Revisá el historial. Si reintentás, usaremos la misma referencia para no duplicar.`,
      );
      onRefresh();
    } finally {
      onBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-bold">Registrar un cobro</h3>
      <p className="text-sm text-fog">
        Acción independiente de la entrada. No emite factura ni aplica
        promociones ni renueva planes automáticamente.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked) return;
          const d = new FormData(e.currentTarget);
          const body: PaymentIntent = intent.current ?? {
            action: "payment",
            id: clientId,
            requestId: crypto.randomUUID(),
            amount: Number(d.get("amount")),
            currency,
            method: String(d.get("method")),
            account: String(d.get("account")),
            concept: String(d.get("concept")),
            fx: currency === "NIO" ? 1 : Number(d.get("fx")),
          };
          if (
            !window.confirm(
              `¿Confirmar cobro de ${body.currency} ${body.amount.toFixed(2)}?`,
            )
          )
            return;
          void pay(body);
        }}
        className="space-y-3"
      >
        <fieldset disabled={blocked || !!pending} className="space-y-3">
          <Field label="Monto recibido">
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
          </Field>
          <Field label="Moneda">
            <select
              className={input}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option>NIO</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Método de pago">
            <select
              name="method"
              className={input}
              required
              defaultValue={pending?.method ?? ""}
            >
              <option value="">Elegí método</option>
              {options.methods
                .filter((m) =>
                  currency === "NIO" ? m.accepts_nio : m.accepts_usd,
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_es}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Cuenta receptora">
            <select
              name="account"
              className={input}
              required
              defaultValue={pending?.account ?? ""}
            >
              <option value="">Elegí cuenta</option>
              {options.accounts
                .filter((a) => a.currency === currency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          {currency === "USD" && (
            <Field label="Tipo de cambio: NIO por 1 USD (confirmado en caja)">
              <input
                name="fx"
                className={input}
                type="number"
                min="0.0001"
                max="10000"
                step="0.0001"
                required
                defaultValue={pending?.fx}
              />
            </Field>
          )}
          <Field label="Concepto">
            <input
              name="concept"
              className={input}
              minLength={2}
              maxLength={200}
              required
              defaultValue={pending?.concept}
              placeholder="Ej.: pago de entrenamiento"
            />
          </Field>
        </fieldset>
        <Button
          disabled={
            blocked || !options.methods.length || !options.accounts.length
          }
        >
          {pending ? "Reintentar el mismo cobro" : "Confirmar cobro"}
        </Button>
      </form>
      {pending && (
        <div className="space-y-2 rounded-xl border border-alert/40 p-3 text-xs">
          <p>
            Intento pendiente: {pending.currency} {pending.amount} ·{" "}
            {pending.concept}
          </p>
          <p className="break-all">
            Referencia de intento: {pending.requestId}
          </p>
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => {
              if (
                !window.confirm(
                  "Sólo descartá el intento si ya revisaste el historial y confirmaste su resultado. Crear otro intento puede duplicar un cobro que sí llegó. ¿Continuar?",
                )
              )
                return;
              sessionStorage.removeItem(key);
              intent.current = null;
              setPending(null);
              setMessage("Intento descartado tras revisión manual.");
            }}
          >
            Ya revisé el historial · descartar intento
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="break-words text-sm text-brand-300">
          {message}
        </p>
      )}
    </section>
  );
}
