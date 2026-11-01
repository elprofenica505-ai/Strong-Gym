"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Banknote, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/format-money";
import {
  DEFAULT_FX,
  accountTypeLabel,
  activeAccounts,
  auditActionLabel,
  accountsErrorMessage,
  currencyLabel,
  parseMoneyInput,
  totalsByCurrency,
  transferPreview,
  type AccountsState,
  type ExpenseCategoryRow,
  type FinanceAccount,
  type PaymentMethodRow,
  type TransferRow,
} from "@/lib/finance/accounts";

/**
 * Cuentas, métodos, categorías y transferencias (FIN-03).
 *
 * Cómo está pensada:
 *   · Todo lo que se ve viene del servidor (`state`). La pantalla no guarda una
 *     copia propia de los saldos: después de guardar pide un refresco, así lo
 *     que muestra es lo que la base confirmó.
 *   · Nada se borra. Una cuenta, un método o una categoría se apagan; una
 *     transferencia se anula con contra-asiento y motivo escrito.
 *   · Una transferencia dice, antes de confirmar, cuánto va a llegar al destino
 *     y cómo quedan los dos saldos. No es ingreso ni gasto.
 *   · Los botones se ven como botones: alto de 44 px, texto, y el mismo ancho
 *     en el teléfono.
 */

const field =
  "w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[0.9375rem] text-ink " +
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-paper";

const label = "text-[0.75rem] font-semibold tracking-[0.08em] text-fog uppercase";

type Notice = { tone: "ok" | "error"; text: string } | null;

const moneyOrNull = (value: number | null, currency: string) =>
  value === null ? "—" : formatMoney(value, currency === "USD" ? "USD" : "NIO");

function Panel({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {hint ? <p className="text-sm text-fog">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone =
    notice.tone === "ok"
      ? "border-emerald-400/40 bg-emerald-400/[0.06] text-emerald-200"
      : "border-red-400/40 bg-red-400/[0.06] text-red-300";
  return (
    <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-[0.875rem] ${tone}`}>
      {notice.text}
    </p>
  );
}

function Toggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} aria-expanded={open}>
      {children}
    </Button>
  );
}

export function MoneySettings({ state }: { state: AccountsState }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const totals = totalsByCurrency(state);

  return (
    <div className="space-y-5">
      <NoticeBox notice={notice} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className={label}>Total en caja y bancos · córdobas</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {state.balancesVisible ? formatMoney(totals.nio) : "Sin permiso"}
          </p>
          <p className="mt-1 text-[0.8125rem] text-fog">
            {state.balancesVisible
              ? "Suma de las cuentas activas. No incluye cuentas apagadas."
              : "Tu rol no tiene el interruptor para ver saldos. Podés mover plata sólo si sos administrador."}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className={label}>Total en caja y bancos · dólares</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {state.balancesVisible ? formatMoney(totals.usd, "USD") : "Sin permiso"}
          </p>
          <p className="mt-1 text-[0.8125rem] text-fog">
            Cada cuenta se muestra en su propia moneda. Acá no se convierte nada.
          </p>
        </div>
      </div>

      <TransferPanel state={state} onNotice={setNotice} onDone={() => router.refresh()} />

      {state.transfers.length > 0 ? (
        <TransferHistory
          transfers={state.transfers}
          canManage={state.canManage}
          onNotice={setNotice}
          onDone={() => router.refresh()}
        />
      ) : null}

      <AccountsPanel
        state={state}
        onNotice={setNotice}
        onDone={() => router.refresh()}
      />

      <MethodsPanel state={state} onNotice={setNotice} onDone={() => router.refresh()} />

      <CategoriesPanel state={state} onNotice={setNotice} onDone={() => router.refresh()} />

      {state.canManage && state.audit.length > 0 ? (
        <Panel
          title="Bitácora de estos cambios"
          hint="Quién cambió qué y cuándo. Los últimos 20 movimientos de configuración del dinero."
        >
          <ul className="divide-y divide-line">
            {state.audit.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="font-semibold text-ink">{auditActionLabel(row.action)}</span>
                <span className="text-fog">
                  {row.actorName ?? "—"} · {dateTime(row.at)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------ transferencias ---------------------------- */

function TransferPanel({
  state,
  onNotice,
  onDone,
}: {
  state: AccountsState;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const accounts = activeAccounts(state);
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [fx, setFx] = useState(String(DEFAULT_FX));
  const [concept, setConcept] = useState("");
  const [busy, setBusy] = useState(false);

  const origin = accounts.find((account) => account.id === from) ?? null;
  const destination = accounts.find((account) => account.id === to) ?? null;
  const amountValue = parseMoneyInput(amount);
  const fxValue = parseMoneyInput(fx);
  const preview =
    origin && destination && amountValue !== null
      ? transferPreview({
          amount: amountValue,
          fromCurrency: origin.currency,
          toCurrency: destination.currency,
          fx: fxValue ?? Number.NaN,
        })
      : { amountIn: null, message: null };
  const crossCurrency = Boolean(origin && destination && origin.currency !== destination.currency);

  const canSubmit =
    state.canManage &&
    Boolean(origin && destination && origin.id !== destination.id) &&
    amountValue !== null &&
    (crossCurrency ? fxValue !== null : true) &&
    concept.trim().length >= 2;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    if (!origin || !destination || amountValue === null) return;

    const arrives = preview.amountIn;
    if (arrives === null) {
      onNotice({ tone: "error", text: preview.message ?? accountsErrorMessage("INVALID_AMOUNT") });
      return;
    }

    const beforeFrom = origin.balance;
    const beforeTo = destination.balance;
    const detail =
      origin.currency === destination.currency
        ? `${formatMoney(amountValue, origin.currency === "USD" ? "USD" : "NIO")}`
        : `${formatMoney(amountValue, origin.currency === "USD" ? "USD" : "NIO")} y llegan ${formatMoney(
            arrives,
            destination.currency === "USD" ? "USD" : "NIO",
          )}`;
    const after =
      beforeFrom !== null && beforeTo !== null
        ? `\n\n${origin.name} queda en ${formatMoney(beforeFrom - amountValue, origin.currency === "USD" ? "USD" : "NIO")} y ${destination.name} en ${formatMoney(
            beforeTo + arrives,
            destination.currency === "USD" ? "USD" : "NIO",
          )}.`
        : "";

    if (
      !window.confirm(
        `¿Mover ${detail} de «${origin.name}» a «${destination.name}»? Esto no es un ingreso ni un gasto: sólo cambia de cuenta.${after}`,
      )
    ) {
      return;
    }

    setBusy(true);
    onNotice(null);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer",
          requestId: crypto.randomUUID(),
          from: origin.id,
          to: destination.id,
          amount: amountValue,
          fx: crossCurrency ? fxValue : Number(DEFAULT_FX),
          concept: concept.trim(),
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({
          tone: "error",
          text: json?.message ?? "No se movió la plata: la base no confirmó la transferencia.",
        });
        return;
      }
      setAmount("");
      setConcept("");
      onNotice({
        tone: "ok",
        text: `Transferencia registrada: ${detail}. Queda en el historial y se puede anular con motivo.`,
      });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar si la transferencia se registró: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length < 2) {
    return (
      <Panel title="Mover plata entre cuentas">
        <p className="text-sm text-fog">
          Para transferir hacen falta al menos dos cuentas activas. Creá una abajo y volvé a esta
          pantalla.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Mover plata entre cuentas"
      hint="De la caja al banco, del banco a la billetera. No es ingreso ni gasto: no cambia los totales del día, sólo dónde está la plata."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label} htmlFor="transfer-from">
              Sale de
            </label>
            <select
              id="transfer-from"
              className={field}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {currencyLabel(account.currency)}
                  {account.balance === null ? "" : ` · ${moneyOrNull(account.balance, account.currency)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="transfer-to">
              Entra a
            </label>
            <select
              id="transfer-to"
              className={field}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {currencyLabel(account.currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="transfer-amount">
              Importe que sale
            </label>
            <input
              id="transfer-amount"
              className={field}
              inputMode="decimal"
              placeholder={origin?.currency === "USD" ? "100.00" : "1000.00"}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          {crossCurrency ? (
            <div className="space-y-1">
              <label className={label} htmlFor="transfer-fx">
                Tasa NIO por USD
              </label>
              <input
                id="transfer-fx"
                className={field}
                inputMode="decimal"
                value={fx}
                onChange={(event) => setFx(event.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1 sm:col-span-2">
            <label className={label} htmlFor="transfer-concept">
              Motivo
            </label>
            <input
              id="transfer-concept"
              className={field}
              placeholder="Depósito de la semana, cambio de vuelto…"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
            />
          </div>
        </div>

        {preview.amountIn !== null ? (
          <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.875rem] text-ink">
            Van a llegar <strong>{formatMoney(preview.amountIn, destination?.currency === "USD" ? "USD" : "NIO")}</strong> a{" "}
            {destination?.name}.
          </p>
        ) : preview.message ? (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/[0.06] px-4 py-3 text-[0.875rem] text-red-300">
            {preview.message}
          </p>
        ) : null}

        {!state.canManage ? (
          <p className="rounded-xl border border-line bg-paper px-4 py-3 text-[0.875rem] text-fog">
            Sólo un administrador con verificación en dos pasos puede mover plata entre cuentas.
          </p>
        ) : null}

        <Button type="submit" disabled={!canSubmit || busy}>
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          {busy ? "Moviendo…" : "Mover plata"}
        </Button>
      </form>
    </Panel>
  );
}

function TransferHistory({
  transfers,
  canManage,
  onNotice,
  onDone,
}: {
  transfers: TransferRow[];
  canManage: boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  return (
    <Panel
      title="Últimas transferencias"
      hint="Se anulan con contra-asiento y motivo: no se borra nada, y el arqueo de la caja vuelve a cuadrar."
    >
      <ul className="space-y-3">
        {transfers.map((transfer) => (
          <TransferItem
            key={transfer.id}
            transfer={transfer}
            canManage={canManage}
            onNotice={onNotice}
            onDone={onDone}
          />
        ))}
      </ul>
    </Panel>
  );
}

function TransferItem({
  transfer,
  canManage,
  onNotice,
  onDone,
}: {
  transfer: TransferRow;
  canManage: boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const outCurrency = transfer.currencyOut === "USD" ? "USD" : "NIO";
  const inCurrency = transfer.currencyIn === "USD" ? "USD" : "NIO";

  async function voidIt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reason.trim().length < 5) return;
    if (
      !window.confirm(
        `¿Anular la transferencia de ${formatMoney(transfer.amountOut, outCurrency)}? Vuelve la plata a «${transfer.fromName ?? "origen"}» y sale de «${transfer.toName ?? "destino"}». No se borra nada: queda el contra-asiento.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "void_transfer",
          requestId: crypto.randomUUID(),
          transferId: transfer.id,
          reason: reason.trim(),
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({
          tone: "error",
          text: json?.message ?? "No se anuló: la base no confirmó el contra-asiento.",
        });
        return;
      }
      setReason("");
      setOpen(false);
      onNotice({ tone: "ok", text: "Transferencia anulada. Los dos saldos volvieron a su lugar." });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar la anulación: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-ink">
          {transfer.fromName ?? "—"} → {transfer.toName ?? "—"}
        </span>
        <span className={transfer.voided ? "text-fog line-through" : "text-ink"}>
          {formatMoney(transfer.amountOut, outCurrency)}
          {outCurrency !== inCurrency
            ? ` · llegaron ${formatMoney(transfer.amountIn, inCurrency)}`
            : ""}
        </span>
      </div>
      <p className="mt-1 text-[0.8125rem] text-fog">
        {dateTime(transfer.occurredAt)} · {transfer.createdByName ?? "—"} · {transfer.concept}
      </p>
      {transfer.voided ? (
        <p className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-[0.8125rem] text-fog">
          Anulada{transfer.voidReason ? `: ${transfer.voidReason}` : "."}
        </p>
      ) : canManage ? (
        <div className="mt-2 space-y-2">
          <Toggle open={open} onClick={() => setOpen((value) => !value)}>
            {open ? "Cerrar" : "Anular esta transferencia"}
          </Toggle>
          {open ? (
            <form onSubmit={voidIt} className="space-y-2">
              <label className={label} htmlFor={`void-${transfer.id}`}>
                Motivo de la anulación
              </label>
              <input
                id={`void-${transfer.id}`}
                className={field}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Se cargó a la cuenta equivocada"
              />
              <Button type="submit" variant="outline" size="sm" disabled={busy || reason.trim().length < 5}>
                {busy ? "Anulando…" : "Confirmar anulación"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* --------------------------------- cuentas -------------------------------- */

function AccountsPanel({
  state,
  onNotice,
  onDone,
}: {
  state: AccountsState;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Panel
      title="Cuentas donde entra la plata"
      hint="Caja fuerte, banco o billetera. Se apagan, no se borran: los movimientos viejos siguen apuntando a su cuenta."
    >
      <ul className="space-y-3">
        {state.accounts.map((account) => (
          <AccountItem
            key={account.id}
            account={account}
            canManage={state.canManage}
            onNotice={onNotice}
            onDone={onDone}
          />
        ))}
      </ul>

      {state.canManage ? (
        <div className="space-y-3 border-t border-line pt-4">
          <Toggle open={creating} onClick={() => setCreating((value) => !value)}>
            <Plus className="size-4" aria-hidden="true" />
            {creating ? "Cerrar" : "Nueva cuenta"}
          </Toggle>
          {creating ? (
            <AccountForm
              account={null}
              onNotice={onNotice}
              onDone={() => {
                setCreating(false);
                onDone();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function AccountItem({
  account,
  canManage,
  onNotice,
  onDone,
}: {
  account: FinanceAccount;
  canManage: boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    if (busy) return;
    const next = !account.isActive;
    const verb = next ? "encender" : "apagar";
    if (
      !window.confirm(
        `¿${next ? "Encender" : "Apagar"} «${account.name}»? ${
          next
            ? "Vuelve a aparecer para cobrar y transferir."
            : "Deja de ofrecerse para cobrar y transferir, pero sus movimientos y su saldo quedan guardados. No se borra nada."
        }`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_account",
          id: account.id,
          name: account.name,
          accountType: account.accountType,
          currency: account.currency,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          displayOrder: account.displayOrder,
          isActive: next,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({
          tone: "error",
          text: json?.message ?? `No se pudo ${verb} la cuenta. No se cambió nada.`,
        });
        return;
      }
      onNotice({ tone: "ok", text: `Cuenta «${account.name}» ${next ? "encendida" : "apagada"}.` });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar el cambio: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {account.name}
            {account.isActive ? "" : " · apagada"}
          </p>
          <p className="text-[0.8125rem] text-fog">
            {accountTypeLabel(account.accountType)} · {currencyLabel(account.currency)}
            {account.bankName ? ` · ${account.bankName}` : ""}
            {account.accountNumber ? ` · ${account.accountNumber}` : ""}
          </p>
        </div>
        <p className={`text-sm font-semibold ${account.balance !== null && account.balance < 0 ? "text-red-300" : "text-ink"}`}>
          {account.balance === null ? "Saldo oculto" : moneyOrNull(account.balance, account.currency)}
        </p>
      </div>
      {account.cashOpen ? (
        <p className="mt-1 text-[0.8125rem] text-fog">Tiene un turno de caja abierto.</p>
      ) : null}
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Toggle open={editing} onClick={() => setEditing((value) => !value)}>
            {editing ? "Cerrar" : "Editar"}
          </Toggle>
          <Button type="button" variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
            {account.isActive ? "Apagar" : "Encender"}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <div className="mt-3 border-t border-line pt-3">
          <AccountForm
            account={account}
            onNotice={onNotice}
            onDone={() => {
              setEditing(false);
              onDone();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function AccountForm({
  account,
  onNotice,
  onDone,
}: {
  account: FinanceAccount | null;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [accountType, setAccountType] = useState(account?.accountType ?? "caja_fuerte");
  const [currency, setCurrency] = useState(account?.currency ?? "NIO");
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onNotice(null);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_account",
          id: account?.id ?? null,
          name,
          accountType,
          currency,
          bankName: bankName.trim() ? bankName.trim() : null,
          accountNumber: accountNumber.trim() ? accountNumber.trim() : null,
          displayOrder: account?.displayOrder ?? 100,
          isActive: account?.isActive ?? true,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({
          tone: "error",
          text: json?.message ?? "No se guardó la cuenta. No se cambió nada.",
        });
        return;
      }
      onNotice({
        tone: "ok",
        text: account ? `Cuenta «${name.trim()}» actualizada.` : `Cuenta «${name.trim()}» creada.`,
      });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar si se guardó: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label}>Nombre</label>
          <input
            className={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Caja fuerte córdobas"
          />
        </div>
        <div className="space-y-1">
          <label className={label}>Tipo</label>
          <select className={field} value={accountType} onChange={(event) => setAccountType(event.target.value)}>
            <option value="caja_fuerte">Caja fuerte</option>
            <option value="banco">Banco</option>
            <option value="billetera">Billetera</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Moneda</label>
          <select className={field} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="NIO">Córdobas</option>
            <option value="USD">Dólares</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Banco o billetera</label>
          <input
            className={field}
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder="BAC, BANPRO, Tigo Money…"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={label}>Número de cuenta</label>
          <input
            className={field}
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>
      <p className="text-[0.8125rem] text-fog">
        La moneda de una cuenta con movimientos no se puede cambiar: cambiaría el significado de su
        historial. El saldo no se escribe acá; se mueve con cobros, gastos y transferencias.
      </p>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        <Wallet className="size-4" aria-hidden="true" />
        {busy ? "Guardando…" : account ? "Guardar cambios" : "Crear cuenta"}
      </Button>
    </form>
  );
}

/* --------------------------------- métodos -------------------------------- */

function MethodsPanel({
  state,
  onNotice,
  onDone,
}: {
  state: AccountsState;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Panel
      title="Métodos de pago"
      hint="Cómo entra la plata: efectivo, transferencia, tarjeta, billetera. Un método apagado deja de ofrecerse al cobrar."
    >
      <ul className="space-y-2">
        {state.methods.map((method) => (
          <MethodItem key={method.id} method={method} canManage={state.canManage} onNotice={onNotice} onDone={onDone} />
        ))}
      </ul>
      {state.canManage ? (
        <div className="space-y-3 border-t border-line pt-4">
          <Toggle open={creating} onClick={() => setCreating((value) => !value)}>
            <Plus className="size-4" aria-hidden="true" />
            {creating ? "Cerrar" : "Nuevo método"}
          </Toggle>
          {creating ? (
            <MethodForm
              method={null}
              onNotice={onNotice}
              onDone={() => {
                setCreating(false);
                onDone();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function MethodItem({
  method,
  canManage,
  onNotice,
  onDone,
}: {
  method: PaymentMethodRow;
  canManage: boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {method.name}
          {method.isActive ? "" : " · apagado"}
        </p>
        <p className="text-[0.8125rem] text-fog">
          {currencyLabel(method.currency)} · comisión {method.feePct}%
        </p>
      </div>
      {canManage ? (
        <div className="mt-2">
          <Toggle open={editing} onClick={() => setEditing((value) => !value)}>
            {editing ? "Cerrar" : "Editar"}
          </Toggle>
          {editing ? (
            <div className="mt-3 border-t border-line pt-3">
              <MethodForm
                method={method}
                onNotice={onNotice}
                onDone={() => {
                  setEditing(false);
                  onDone();
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function MethodForm({
  method,
  onNotice,
  onDone,
}: {
  method: PaymentMethodRow | null;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(method?.name ?? "");
  const [currency, setCurrency] = useState(method?.currency ?? "NIO");
  const [fee, setFee] = useState(String(method?.feePct ?? 0));
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_method",
          id: method?.id ?? null,
          name,
          currency,
          feePct: parseMoneyInput(fee) ?? 0,
          displayOrder: method?.displayOrder ?? 100,
          isActive,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({ tone: "error", text: json?.message ?? "No se guardó el método. No se cambió nada." });
        return;
      }
      onNotice({ tone: "ok", text: `Método «${name.trim()}» guardado.` });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar si se guardó: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className={label}>Nombre</label>
          <input className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Tarjeta" />
        </div>
        <div className="space-y-1">
          <label className={label}>Moneda</label>
          <select className={field} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="NIO">Córdobas</option>
            <option value="USD">Dólares</option>
            <option value="BOTH">Las dos</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Comisión %</label>
          <input className={field} inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        Se puede usar al cobrar
      </label>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        {busy ? "Guardando…" : method ? "Guardar cambios" : "Crear método"}
      </Button>
    </form>
  );
}

/* -------------------------------- categorías ------------------------------- */

function CategoriesPanel({
  state,
  onNotice,
  onDone,
}: {
  state: AccountsState;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Panel
      title="Categorías de gasto"
      hint="Para saber en qué se va la plata. Una categoría apagada deja de ofrecerse al cargar un gasto, pero los gastos viejos la conservan."
    >
      <ul className="space-y-2">
        {state.categories.map((category) => (
          <CategoryItem
            key={category.id}
            category={category}
            canManage={state.canManage}
            onNotice={onNotice}
            onDone={onDone}
          />
        ))}
      </ul>
      {state.canManage ? (
        <div className="space-y-3 border-t border-line pt-4">
          <Toggle open={creating} onClick={() => setCreating((value) => !value)}>
            <Plus className="size-4" aria-hidden="true" />
            {creating ? "Cerrar" : "Nueva categoría"}
          </Toggle>
          {creating ? (
            <CategoryForm
              category={null}
              onNotice={onNotice}
              onDone={() => {
                setCreating(false);
                onDone();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function CategoryItem({
  category,
  canManage,
  onNotice,
  onDone,
}: {
  category: ExpenseCategoryRow;
  canManage: boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full border border-line"
            style={{ backgroundColor: category.color }}
          />
          <p className="text-sm font-semibold text-ink">
            {category.name}
            {category.isActive ? "" : " · apagada"}
          </p>
        </div>
        <p className="text-[0.8125rem] text-fog">
          {category.budgetMonthly === null
            ? "Sin presupuesto"
            : `Presupuesto ${formatMoney(category.budgetMonthly)} al mes`}
        </p>
      </div>
      {canManage ? (
        <div className="mt-2">
          <Toggle open={editing} onClick={() => setEditing((value) => !value)}>
            {editing ? "Cerrar" : "Editar"}
          </Toggle>
          {editing ? (
            <div className="mt-3 border-t border-line pt-3">
              <CategoryForm
                category={category}
                onNotice={onNotice}
                onDone={() => {
                  setEditing(false);
                  onDone();
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function CategoryForm({
  category,
  onNotice,
  onDone,
}: {
  category: ExpenseCategoryRow | null;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#888888");
  const [budget, setBudget] = useState(
    category?.budgetMonthly === null || category?.budgetMonthly === undefined
      ? ""
      : String(category.budgetMonthly),
  );
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_category",
          id: category?.id ?? null,
          name,
          color,
          budgetMonthly: budget.trim() === "" ? null : parseMoneyInput(budget),
          displayOrder: category?.displayOrder ?? 100,
          isActive,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onNotice({ tone: "error", text: json?.message ?? "No se guardó la categoría. No se cambió nada." });
        return;
      }
      onNotice({ tone: "ok", text: `Categoría «${name.trim()}» guardada.` });
      onDone();
    } catch {
      onNotice({
        tone: "error",
        text: "No hay conexión. No pudimos confirmar si se guardó: recargá antes de repetir.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className={label}>Nombre</label>
          <input className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Mantenimiento" />
        </div>
        <div className="space-y-1">
          <label className={label}>Color</label>
          <input className={field} value={color} onChange={(event) => setColor(event.target.value)} placeholder="#888888" />
        </div>
        <div className="space-y-1">
          <label className={label}>Presupuesto mensual (C$)</label>
          <input className={field} inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Opcional" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        Se puede usar al cargar un gasto
      </label>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        <Banknote className="size-4" aria-hidden="true" />
        {busy ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
      </Button>
    </form>
  );
}

/** Fecha y hora de Managua, sin depender de la zona del aparato. */
function dateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
