"use client";
import { accessLabel, formatPlanDate, validityRows } from "@/lib/crm/validity";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClientCategoryPanel } from "@/components/crm/client-category";
import { useDictionary } from "@/components/providers/dictionary-provider";
import {
  calculatedCategories,
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
import { MovementForm } from "@/components/admin/movement-form";
import { formatMoney } from "@/lib/finance/format-money";
import { crmRequest } from "@/lib/crm/request";
import { DebtForm } from "./debt-form";
import { ClientFinanceSummary, ClientIncomeHistory } from "./client-finance";
import { readClientFinance } from "@/lib/crm/client-finance";
import { useCrmResource } from "./use-crm-resource";
const input =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
/** Módulos desplegables de la ficha: solo uno abierto a la vez. */
type DetailModule =
  | "entrada"
  | "cobrar"
  | "productos"
  | "deudas"
  | "historial"
  | "datos";
/** Si quedó un intento sin confirmar, su módulo se abre solo: nunca escondido. */
function pendingModuleFor(clientId: string): DetailModule | null {
  try {
    if (
      sessionStorage.getItem(
        `strong-gym:finance-v1:service_income:${clientId}`,
      ) ||
      sessionStorage.getItem(`strong-gym:crm-payment:${clientId}`)
    )
      return "cobrar";
    if (sessionStorage.getItem(`strong-gym:debt-v1:${clientId}`))
      return "deudas";
  } catch {}
  return null;
}
/** Títulos y explicaciones de cada vista de la ficha. */
const MODULE_INFO: Record<DetailModule, { title: string; hint: string }> = {
  entrada: {
    title: "Registrar entrada",
    hint: "Cobrá una tarifa rápida o confirmá solo la visita.",
  },
  cobrar: {
    title: "Cobrar un servicio",
    hint: "Monto y concepto manuales; podés sumar productos.",
  },
  productos: {
    title: "Vender productos",
    hint: "Solo productos con stock, sin cobrar un servicio.",
  },
  deudas: {
    title: "Deudas y abonos",
    hint: "Deuda actual, abonos y vuelto en efectivo.",
  },
  historial: {
    title: "Saldo e historial",
    hint: "Saldos, cobros, entradas y cambios de la ficha.",
  },
  datos: {
    title: "Datos del cliente y carnet",
    hint: "Editar la ficha, ver el carnet o reemplazar el QR.",
  },
};
/** Tarjeta del menú de la ficha: al tocarla se abre su propia vista. */
function ModuleCard({
  module,
  pending,
  onOpen,
}: {
  module: DetailModule;
  pending: boolean;
  onOpen: (module: DetailModule) => void;
}) {
  const info = MODULE_INFO[module];
  return (
    <button
      type="button"
      onClick={() => onOpen(module)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 px-4 py-3 text-left transition hover:border-brand/60 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span>
        <span className="block font-semibold text-ink">
          {info.title}
          {pending && (
            <span className="ml-2 rounded-full border border-alert/50 px-2 py-0.5 text-[0.65rem] font-semibold text-alert">
              Sin confirmar
            </span>
          )}
        </span>
        <span className="block text-xs text-fog">{info.hint}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-fog">
        ›
      </span>
    </button>
  );
}
/**
 * Tarifas de disciplina: cada plan activo atado a una disciplina con duración
 * y vigencia propias se ofrece como cobro directo. Se toma el importe y la
 * moneda del catálogo, nunca el precio histórico del plan.
 */
function findClassTariffs(plans: CrmOptions["plans"]): QuickTariff[] {
  const tariffs: QuickTariff[] = [];
  for (const plan of plans) {
    if (plan.access !== "class" || !plan.class_id || !plan.duration_days) continue;
    const amount = Number(plan.validity_amount);
    const currency = plan.validity_currency;
    if (!currency || !Number.isFinite(amount) || amount <= 0) continue;
    tariffs.push({
      plan,
      amount,
      currency,
      buttonLabel: plan.class_name ?? plan.name_es,
      isDayPass: false,
      isClass: true,
    });
  }
  return tariffs;
}
const emptyOptions: CrmOptions = {
  plans: [],
  methods: [],
  accounts: [],
  payments_enabled: false,
};
const QUICK_TARIFFS = [
  { slug: "pase-del-dia", period: "session", buttonLabel: "pase del día" },
  { slug: "gimnasio-semanal", period: "week", buttonLabel: "semana" },
  { slug: "gimnasio-quincenal", period: "fortnight", buttonLabel: "quincena" },
  { slug: "gimnasio-mensual", period: "month", buttonLabel: "mes" },
] as const;
type QuickTariff = {
  plan: CrmOptions["plans"][number];
  /** Importe y moneda canónicos de la tarifa; el cobro exige que coincidan. */
  amount: number;
  currency: "NIO" | "USD";
  buttonLabel: string;
  isDayPass: boolean;
  /** Un plan de disciplina es un acceso aparte: no registra entrada de gimnasio. */
  isClass: boolean;
};
function validQuickTariffPrice(plan: CrmOptions["plans"][number]) {
  const price = Number(plan.price_nio);
  return Number.isFinite(price) && price > 0 ? price : null;
}
function findQuickTariffs(plans: CrmOptions["plans"]): QuickTariff[] {
  return QUICK_TARIFFS.flatMap((expected, index) => {
    let plan = plans.find(
      (candidate) =>
        candidate.slug === expected.slug &&
        candidate.period === expected.period &&
        validQuickTariffPrice(candidate) !== null,
    );

    // Compatibilidad: si el pase todavía no tuviera el slug esperado, se
    // acepta cualquier plan activo de una sesión con tarifa NIO válida.
    if (!plan && index === 0) {
      plan = plans.find(
        (candidate) =>
          candidate.period === expected.period &&
          validQuickTariffPrice(candidate) !== null,
      );
    }

    const priceNio = plan ? validQuickTariffPrice(plan) : null;
    return plan && priceNio !== null
      ? [
          {
            plan,
            amount: priceNio,
            currency: "NIO" as const,
            buttonLabel: expected.buttonLabel,
            isDayPass: index === 0,
            isClass: false,
          },
        ]
      : [];
  });
}
function validDirectory(data: unknown) {
  const value = data as Directory | null;
  return !!value && Array.isArray(value.rows) && Number.isInteger(value.total);
}
function validOptions(data: unknown) {
  const value = data as CrmOptions | null;
  return (
    !!value &&
    Array.isArray(value.plans) &&
    Array.isArray(value.methods) &&
    Array.isArray(value.accounts) &&
    typeof value.payments_enabled === "boolean"
  );
}
function validDetail(data: unknown) {
  const value = data as ClientDetail | null;
  return (
    !!value?.client?.id &&
    typeof value.client.full_name === "string" &&
    typeof value.card === "string" &&
    Array.isArray(value.visits) &&
    Array.isArray(value.events) &&
    Array.isArray(value.payments)
  );
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
  staffIds = [],
  staffDirectory,
}: {
  isAdmin: boolean;
  isDemo: boolean;
  /** Cuentas de personal: nunca se muestran como clientes ni en la búsqueda. */
  staffIds?: string[];
  /** Directorio del personal: se oculta mientras una ficha está abierta. */
  staffDirectory?: ReactNode;
}) {
  const staffSet = new Set(staffIds);
  const { locale } = useDictionary();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [entryFeedback, setEntryFeedback] = useState<{
    clientId: string;
    message: string;
    failed: boolean;
  } | null>(null);
  const [quickTariffPreset, setQuickTariffPreset] = useState<{
    clientId: string;
    planId: string;
    stamp: number;
  } | null>(null);
  const [classPreset, setClassPreset] = useState<{
    clientId: string;
    planId: string;
    stamp: number;
  } | null>(null);
  const [registerEntryAfterQuickTariff, setRegisterEntryAfterQuickTariff] =
    useState(true);
  const [busy, setBusy] = useState(false);
  const [openModule, setOpenModule] = useState<DetailModule | null>(null);
  const [showAllVisits, setShowAllVisits] = useState(false);
  // Cliente con cobro iniciado desde "Registrar entrada": mantiene el
  // formulario montado tras confirmar, para no perder el comprobante.
  const [entryChargeClientId, setEntryChargeClientId] = useState<
    string | null
  >(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const moduleScreenRef = useRef<HTMLElement>(null);
  const directoryResource = useCrmResource<Directory>(
    `/api/admin/clients?${new URLSearchParams({ search: query, category, offset: String(offset) })}`,
    revision,
    !isDemo,
    validDirectory,
  );
  const optionsResource = useCrmResource<CrmOptions>(
    "/api/admin/clients?mode=options",
    optionsAttempt,
    !isDemo,
    validOptions,
  );
  const detailResource = useCrmResource<ClientDetail>(
    selected ? `/api/admin/clients?id=${selected}` : null,
    `${revision}:${detailAttempt}`,
    !isDemo,
    validDetail,
  );
  const directory = directoryResource.data ?? { rows: [], total: 0 };
  const options = optionsResource.data ?? emptyOptions;
  const detail = detailResource.data;
  const loading = directoryResource.loading;
  // Al abrir un cliente, bajamos hasta su ficha.
  const detailId = detail?.client.id;
  useEffect(() => {
    if (!detailId) return;
    document.getElementById("ficha-cliente")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [detailId]);
  const focusDetail = !!detail;
  const pendingModule = detail ? pendingModuleFor(detail.client.id) : null;
  const scrollToFichaTop = () => {
    const go = () =>
      document
        .getElementById("ficha-cliente")
        ?.scrollIntoView?.({ block: "start" });
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(go);
    else go();
  };
  /** Cada módulo se abre como su propia vista dentro de la ficha. */
  const openModuleView = (module: DetailModule) => {
    setOpenModule(module);
    scrollToFichaTop();
  };
  const backToFicha = () => {
    setOpenModule(null);
    scrollToFichaTop();
  };
  // Al abrir una tarjeta, el módulo funciona como una pantalla aparte:
  // empieza arriba, recibe el foco y la página de atrás no se mueve.
  useEffect(() => {
    if (!openModule) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const screen = moduleScreenRef.current;
    if (screen) {
      screen.scrollTop = 0;
      screen.focus({ preventScroll: true });
    }
    // Al imprimir un comprobante o el carnet, la página debe paginar normal.
    const unlockForPrint = () => {
      document.body.style.overflow = previousOverflow;
    };
    const relockAfterPrint = () => {
      document.body.style.overflow = "hidden";
    };
    window.addEventListener("beforeprint", unlockForPrint);
    window.addEventListener("afterprint", relockAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", unlockForPrint);
      window.removeEventListener("afterprint", relockAfterPrint);
      document.body.style.overflow = previousOverflow;
    };
  }, [openModule]);
  const managuaDay = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua" }).format(
      value,
    );
  const enteredToday = detail
    ? detail.visits.some(
        (v) => managuaDay(new Date(v.visited_at)) === managuaDay(new Date()),
      )
    : false;
  const headerFinance = detail
    ? readClientFinance(
        detail.finance,
        detail.client.id,
        detail.client.profile_id,
      )
    : null;
  const headerDebt =
    headerFinance?.balance_status === "ready" && headerFinance.balances
      ? headerFinance.balances
      : null;
  const visibleVisits = detail
    ? showAllVisits
      ? detail.visits
      : detail.visits.slice(0, 5)
    : [];
  const detailBusy = busy || detailResource.loading || !!detailResource.error;
  const quickTariffs =
    options.finance_layout === "bank_accounts_split"
      ? findQuickTariffs(options.plans)
      : [];
  const classTariffs =
    options.finance_layout === "bank_accounts_split"
      ? findClassTariffs(options.plans)
      : [];
  const gymTariffSelected =
    detail && quickTariffPreset?.clientId === detail.client.id
      ? quickTariffs.find(
          (tariff) => tariff.plan.id === quickTariffPreset.planId,
        )
      : undefined;
  const classSelected =
    detail && classPreset?.clientId === detail.client.id
      ? classTariffs.find((tariff) => tariff.plan.id === classPreset.planId)
      : undefined;
  const selectedQuickTariff = gymTariffSelected ?? classSelected;
  const quickTariffArmed = !!selectedQuickTariff;
  /** Arma un cobro con plan y abre su formulario en el módulo de cobro. */
  function armPlan(tariff: QuickTariff, registerEntry: boolean, stamp: number) {
    if (!detail || detailBusy || detail.client.status !== "active") return;
    setEntryChargeClientId(detail.client.id);
    setRegisterEntryAfterQuickTariff(registerEntry);
    setQuickTariffPreset(
      tariff.isClass
        ? null
        : {
            clientId: detail.client.id,
            planId: tariff.plan.id,
            stamp,
          },
    );
    setClassPreset(
      tariff.isClass
        ? {
            clientId: detail.client.id,
            planId: tariff.plan.id,
            stamp,
          }
        : null,
    );
    setEntryFeedback(null);
    openModuleView(tariff.isClass ? "cobrar" : "entrada");
    requestAnimationFrame(() =>
      document
        .getElementById("cobro")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
    );
  }
  /** Tarifa de gimnasio sugerida para renovar: mes si existe, si no la primera. */
  const renewTariff =
    quickTariffs.find((tariff) => tariff.plan.slug === "gimnasio-mensual") ??
    quickTariffs[quickTariffs.length - 1] ??
    null;
  /** Panel de vigencias: gimnasio y cada disciplina, con su botón de cobro. */
  const validityPanel = () => {
    if (!detail || options.finance_layout !== "bank_accounts_split") return null;
    // Una fila por disciplina: primero las que tienen plan cobrable y luego
    // las que solo tienen vigencia registrada, para no ocultar ninguna.
    const registered = detail.plan_validity?.classes ?? [];
    const classRows = [
      ...classTariffs.map((tariff) => ({
        key: tariff.plan.class_id as string,
        label: tariff.buttonLabel,
        access: registered.find((row) => row.key === tariff.plan.class_id),
        tariff: tariff as QuickTariff | null,
      })),
      ...registered
        .filter(
          (row) => !classTariffs.some((tariff) => tariff.plan.class_id === row.key),
        )
        .map((row) => ({
          key: row.key,
          label: row.label,
          access: row as (typeof registered)[number] | undefined,
          tariff: null,
        })),
    ];
    const rows = [
      {
        key: "gym" as string,
        label: "Gimnasio",
        access: detail.plan_validity?.gym,
        tariff: renewTariff,
      },
      ...classRows,
    ];
    return (
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h3 className="text-lg font-bold text-ink">Vigencias</h3>
          <p className="text-sm text-fog">
            Cada acceso se cobra y vence por separado: el gimnasio y cada
            disciplina con plan configurado. Podés tener varios vigentes a la
            vez. El «plan asignado» de la ficha es solo una etiqueta y no cobra
            ni activa nada.
          </p>
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{row.label}</p>
                <p
                  className={`text-sm ${row.access?.state === "active" ? "text-brand-300" : row.access?.state === "expired" ? "text-alert" : "text-fog"}`}
                >
                  {row.access ? accessLabel(row.access, "es") : "Sin vigencia registrada"}
                  {row.access?.expires_on &&
                    row.access.state !== "none" &&
                    ` · vence el ${formatPlanDate(row.access.expires_on, "es")}`}
                </p>
              </div>
              {row.tariff ? (
                <Button
                  type="button"
                  variant={row.key === "gym" ? "primary" : "outline"}
                  size="sm"
                  className="shrink-0"
                  disabled={detailBusy || detail.client.status !== "active"}
                  onClick={() => armPlan(row.tariff!, false, Date.now())}
                >
                  Cobrar {row.label} ·{" "}
                  {formatMoney(row.tariff.amount, row.tariff.currency)}
                </Button>
              ) : (
                <p className="text-xs text-fog">
                  Sin tarifa configurada para este acceso.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  };
  function select(id: string, token: string | null = null) {
    setEntryFeedback(null);
    setQuickTariffPreset(null);
    setRegisterEntryAfterQuickTariff(true);
    // Si quedó un intento sin confirmar, su módulo se abre solo al entrar.
    setOpenModule(pendingModuleFor(id));
    setEntryChargeClientId(null);
    setShowAllVisits(false);
    setSelected(id);
    setRevision((n) => n + 1);
    setScanToken(token);
    setCreating(false);
    setNotice("");
    setError("");
  }
  function backToDirectory() {
    setSelected(null);
    setScanToken(null);
    setOpenModule(null);
    setEntryChargeClientId(null);
    setShowAllVisits(false);
    searchInput.current?.focus();
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
  async function registerEntry(clientId: string, afterPayment = false) {
    setEntryFeedback({
      clientId,
      message: afterPayment
        ? "Cobro confirmado. Registrando entrada…"
        : "Confirmando entrada…",
      failed: false,
    });
    try {
      const r = (await action({
        action: "check-in",
        id: clientId,
        source: scanToken ? "qr" : "manual",
        ...(scanToken ? { token: scanToken } : {}),
      })) as { already?: unknown } | null;
      if (!r || typeof r.already !== "boolean")
        throw new Error(
          "El servidor no confirmó el resultado. Revisá Últimas 60 entradas antes de repetir.",
        );
      setEntryFeedback({
        clientId,
        failed: false,
        message: r.already
          ? afterPayment
            ? "Cobro confirmado. Este cliente ya tenía una visita registrada hoy; no se duplicó la entrada."
            : "Este cliente ya tiene una visita registrada hoy. No se duplicó."
          : afterPayment
            ? "Cobro confirmado y entrada registrada."
            : "Entrada registrada. No se realizó ningún cobro.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la entrada. Revisá el historial antes de repetir.";
      setEntryFeedback({
        clientId,
        failed: true,
        message: afterPayment
          ? `El cobro quedó confirmado, pero no se pudo confirmar la entrada. No repitas el cobro. ${message}`
          : message,
      });
    }
  }
  /** El mismo formulario seguro de siempre, presentado en el módulo abierto:
   * entrada con tarifa, cobro manual o venta de productos. Solo se monta
   * una vez (un módulo abierto a la vez); el intento pendiente se recupera
   * de sessionStorage igual que antes. */
  const paymentBlock = (heading?: string) =>
    detail ? (
      <div id="cobro" className="scroll-mt-24 space-y-3">
        {quickTariffArmed && selectedQuickTariff && (
          <div className="space-y-3 rounded-xl border border-brand/50 bg-brand/10 p-4 text-sm">
            <p>
              <strong>
                {selectedQuickTariff.plan.name_es} listo para cobrar.
              </strong>{" "}
              El monto de{" "}
              {formatMoney(selectedQuickTariff.amount, selectedQuickTariff.currency)}{" "}
              y el concepto ya están cargados; elegí método, cuenta y tasa como
              siempre.{" "}
              {selectedQuickTariff.isClass
                ? `${selectedQuickTariff.buttonLabel} se cobra solo, sin productos, y crea una vigencia aparte de la del gimnasio.`
                : "También podés agregar productos con stock al mismo total antes de confirmar."}
            </p>
            <p className="text-fog">
              {selectedQuickTariff.plan.duration_days
                ? `Al confirmarse, activa o renueva la vigencia del plan: ${selectedQuickTariff.plan.duration_days} ${selectedQuickTariff.plan.duration_days === 1 ? "día" : "días"} contando este pago como día 1.`
                : "Este plan no tiene una duración definida: el cobro solo registra el pago y no crea vigencia."}
            </p>
            {!selectedQuickTariff.isClass && (
              <>
                <label className="flex items-start gap-2 text-ink">
                  <input
                    type="checkbox"
                    checked={registerEntryAfterQuickTariff}
                    disabled={detailBusy}
                    onChange={(event) =>
                      setRegisterEntryAfterQuickTariff(event.target.checked)
                    }
                    className="mt-0.5 size-4 shrink-0 accent-brand"
                  />
                  <span>Registrar entrada ahora al confirmarse el cobro</span>
                </label>
                <p className="text-fog">
                  {selectedQuickTariff.isDayPass
                    ? "Desmarcala solo si la persona pagó para entrar más tarde."
                    : "Desmarcala si hoy la persona solo viene a pagar y no va a entrenar."}
                </p>
              </>
            )}
          </div>
        )}
        {options.finance_layout === "bank_accounts_split" ? (
          <MovementForm
            key={detail.client.id}
            kind="service_income"
            clientId={detail.client.id}
            locale={locale}
            heading={heading}
            disabled={detailBusy}
            onBusy={setBusy}
            onRefresh={() => setRevision((n) => n + 1)}
            defaultAmount={
              quickTariffArmed && selectedQuickTariff
                ? selectedQuickTariff.amount
                : undefined
            }
            initialCurrency={
              quickTariffArmed && selectedQuickTariff
                ? selectedQuickTariff.currency
                : undefined
            }
            defaultConcept={
              quickTariffArmed && selectedQuickTariff
                ? selectedQuickTariff.plan.name_es
                : undefined
            }
            presetKey={
              quickTariffArmed && selectedQuickTariff
                ? `quick-tariff:${selectedQuickTariff.plan.slug ?? selectedQuickTariff.plan.id}:${quickTariffPreset?.stamp ?? classPreset?.stamp ?? 0}`
                : "standard"
            }
            initialPlanId={
              quickTariffArmed && selectedQuickTariff
                ? selectedQuickTariff.plan.id
                : undefined
            }
            onSuccess={async (_receiptId, result) => {
              if (!quickTariffArmed) return;
              if (selectedQuickTariff?.isClass) {
                // Un plan de disciplina no registra entrada de gimnasio.
                setClassPreset(null);
                setEntryChargeClientId(null);
                return;
              }
              const clientId = detail.client.id;
              const includedService = result.serviceAmount !== 0;
              const shouldRegisterEntry =
                registerEntryAfterQuickTariff && includedService;
              setQuickTariffPreset(null);
              setClassPreset(null);
              if (shouldRegisterEntry) {
                await registerEntry(clientId, true);
              } else if (registerEntryAfterQuickTariff && !includedService) {
                setEntryFeedback({
                  clientId,
                  failed: true,
                  message:
                    "Venta de productos confirmada. No se registró la entrada porque este cobro no incluyó el servicio; no repitas la venta.",
                });
              }
            }}
          />
        ) : (
          <PaymentForm
            key={detail.client.id}
            clientId={detail.client.id}
            options={options}
            blocked={
              detailBusy ||
              optionsResource.loading ||
              !!optionsResource.error ||
              options.payments_enabled !== true
            }
            onBusy={setBusy}
            onRefresh={() => setRevision((n) => n + 1)}
          />
        )}
      </div>
    ) : null;
  /** Aviso de intento sin confirmar: visible en el menú y en cualquier vista. */
  const pendingBanner =
    detail && pendingModule && openModule !== pendingModule ? (
      <div
        role="alert"
        className="space-y-2 rounded-xl border border-alert/50 p-4 text-sm text-alert"
      >
        <p>
          {pendingModule === "deudas"
            ? "Hay una operación de deuda sin confirmar. Revisala antes de registrar otra."
            : "Hay un cobro sin confirmar. Revisalo antes de registrar otro."}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => openModuleView(pendingModule)}
        >
          Revisar intento pendiente
        </Button>
      </div>
    ) : null;
  return (
    <div className="container-x space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Clientes · Personal</p>
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
      {isDemo && (
        <p className="rounded-xl border border-brand/40 bg-card p-5 text-brand-300">
          Este despliegue está en modo demo sin base configurada: no guarda
          clientes ni cobros. Una demostración comercial puede usar una base
          real de pruebas con datos de ejemplo.
        </p>
      )}
      {!isDemo && (
        <p className="text-xs text-fog">
          Cada sección confirma sus propios datos. Si una no carga, las demás
          siguen funcionando.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-alert bg-card p-4 text-alert"
        >
          Operación: {error}
        </p>
      )}
      {optionsResource.error && (
        <div
          role="alert"
          className="rounded-xl border border-alert/40 p-4 text-alert"
        >
          <p>Planes y métodos de cobro: {optionsResource.error}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setOptionsAttempt((n) => n + 1)}
          >
            Reintentar planes y métodos
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand/40 p-4 text-brand-300"
        >
          {notice}
        </p>
      )}
      {!focusDetail && (
        <>
      <section className="rounded-2xl border border-line bg-card p-5 space-y-4">
        <h2 className="text-xl font-bold">Buscar por nombre · sin QR</h2>
        <p className="text-sm text-fog">
          Escribí parte del nombre, tocá Buscar y después elegí la tarjeta del
          cliente. También sirve teléfono o número.
        </p>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setOffset(0);
            setRevision((n) => n + 1);
          }}
        >
          <Field label="Nombre, teléfono o número de cliente">
            <input
              ref={searchInput}
              className={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={120}
              placeholder="Escribí el nombre del cliente…"
            />
          </Field>
          <Field label="Categoría o etiqueta">
            <select
              className={input}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las categorías</option>
              <optgroup label="Categoría por vigencia">
                {Object.entries(calculatedCategories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Etiqueta histórica">
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Button className="self-end" disabled={isDemo || busy}>
            Buscar
          </Button>
        </form>
        {directoryResource.error && (
          <div
            role="alert"
            className="rounded-xl border border-alert/40 p-4 text-alert"
          >
            <p>Listado de clientes: {directoryResource.error}</p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRevision((n) => n + 1)}
            >
              Reintentar listado
            </Button>
          </div>
        )}
        <p role="status" className="text-xs text-fog">
          {loading
            ? "Cargando…"
            : directoryResource.error
              ? "No se pudo confirmar el listado. No vuelvas a registrar clientes por este aviso."
              : `${directory.total} ${directory.total === 1 ? "cliente" : "clientes"} · hasta 30 por página`}
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {directory.rows.filter((c) => !(c.profile_id && staffSet.has(c.profile_id))).map((c) => (
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
                {c.category_calc
                  ? `${calculatedCategories[c.category_calc]}${c.category_source === "manual" ? " (a mano)" : ""}`
                  : categories[c.category]}
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
        {!loading && !directoryResource.error && !directory.rows.length && (
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
      <div className="rounded-2xl border border-line bg-card p-4 space-y-3">
        <Button
          type="button"
          variant="outline"
          disabled={isDemo || busy}
          aria-expanded={showScanner}
          onClick={() => setShowScanner((v) => !v)}
        >
          {showScanner ? "Cerrar escáner QR" : "Usar QR o lector (opcional)"}
        </Button>
        <p className="text-xs text-fog">
          No hace falta carnet ni celular para buscar por nombre.
        </p>
        {showScanner && !isDemo && (
          <QrScanner
            key={busy ? "locked" : "ready"}
            onRead={scan}
            disabled={busy}
            onManual={() => {
              setShowScanner(false);
              searchInput.current?.focus();
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isDemo || busy}
          onClick={() => {
            setCreating(!creating);
            setSelected(null);
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
        </>
      )}
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
                  "Cliente creado. No lo registres de nuevo si falla la lectura de su ficha.",
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
            <Field label="Plan asignado (solo etiqueta)">
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
      {selected && detailResource.loading && (
        <p role="status">
          {detail ? "Actualizando ficha…" : "Cargando ficha…"}
        </p>
      )}
      {selected && detailResource.error && (
        <section
          role="alert"
          className="rounded-2xl border border-alert/50 bg-card p-5 space-y-3"
        >
          <h2 className="text-xl font-bold">No pudimos abrir esta ficha</h2>
          <p>{detailResource.error}</p>
          {detail && (
            <p className="text-sm text-alert">
              Los datos visibles son de la última lectura y pueden estar
              desactualizados. Las acciones están bloqueadas hasta confirmar la
              ficha.
            </p>
          )}
          <p className="text-sm text-fog">
            La tarjeta del listado no se eliminó. No vuelvas a registrar al
            cliente: podés reintentar o volver a buscar por nombre.
          </p>
          <Button
            disabled={busy}
            onClick={() => setDetailAttempt((n) => n + 1)}
          >
            Reintentar ficha
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => {
              setSelected(null);
              setScanToken(null);
              searchInput.current?.focus();
            }}
          >
            Volver al listado
          </Button>
        </section>
      )}
      {detail && (
        <section
          ref={moduleScreenRef}
          id="ficha-cliente"
          aria-busy={detailResource.loading}
          aria-label={
            openModule
              ? `${MODULE_INFO[openModule].title} de ${detail.client.full_name}`
              : undefined
          }
          data-module-screen={openModule ?? undefined}
          tabIndex={openModule ? -1 : undefined}
          className={
            openModule
              ? "fixed inset-0 z-[80] space-y-6 overflow-y-auto overscroll-contain bg-paper px-4 pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl outline-none print:static print:overflow-visible sm:px-6 lg:px-[max(2rem,calc((100vw_-_72rem)/2))]"
              : "scroll-mt-24 rounded-2xl border border-brand/30 bg-card p-5 space-y-6"
          }
        >
          {openModule === null ? (
            <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={backToDirectory}
            >
              ← Volver a clientes
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={detailBusy}
              onClick={() => setRevision((n) => n + 1)}
            >
              Actualizar ficha
            </Button>
          </div>
          <h2 className="display-xl text-2xl">
            #{detail.client.client_number} · {detail.client.full_name}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-fog">
              Etiqueta: {categories[detail.client.category]}
            </span>
            <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-fog">
              {detail.client.status === "active"
                ? "Activo"
                : detail.client.status === "frozen"
                  ? "Congelado"
                  : "Cancelado"}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 ${enteredToday ? "border-brand/50 text-brand-300" : "border-line bg-paper text-fog"}`}
            >
              {enteredToday ? "Ya entró hoy" : "Sin entrada hoy"}
            </span>
            {validityRows(detail.plan_validity, "es").map((row) => (
              <span
                key={row.key}
                className={`rounded-full border px-2.5 py-1 ${row.value.startsWith("Vigente") ? "border-brand/50 text-brand-300" : row.value.startsWith("Venció") ? "border-alert/50 text-alert" : "border-line bg-paper text-fog"}`}
              >
                {row.label}: {row.value}
              </span>
            ))}
            {headerDebt &&
              (headerDebt.debt_nio > 0 || headerDebt.debt_usd > 0) && (
                <span className="rounded-full border border-alert/50 px-2.5 py-1 text-alert">
                  Debe
                  {headerDebt.debt_nio > 0
                    ? ` C$ ${headerDebt.debt_nio.toFixed(2)}`
                    : ""}
                  {headerDebt.debt_usd > 0
                    ? ` · US$ ${headerDebt.debt_usd.toFixed(2)}`
                    : ""}
                </span>
              )}
          </div>
          <p className="text-sm text-fog">
            {detail.client.phone || "Sin teléfono"} ·{" "}
            {detail.client.plan_id
              ? (options.plans.find((p) => p.id === detail.client.plan_id)
                  ?.name_es ?? "Plan asignado")
              : "Sin plan asignado"}{" "}
            (etiqueta; las vigencias están arriba)
          </p>
          {detail.client.status !== "active" && (
            <p className="text-alert">
              Ficha congelada/cancelada: revisá el estado antes de registrar
              asistencia.
            </p>
          )}
          {pendingBanner}
          {openModule !== "entrada" &&
            entryFeedback?.clientId === detail.client.id && (
              <p
                role={entryFeedback.failed ? "alert" : "status"}
                className={`rounded-xl border p-4 text-sm ${entryFeedback.failed ? "border-alert/50 text-alert" : "border-brand/40 text-brand-300"}`}
              >
                {entryFeedback.message}
              </p>
            )}
            </>
          ) : (
            <>
              <div className="sticky top-0 z-20 flex items-center gap-2 rounded-2xl border border-line bg-card/95 p-3 shadow-xl backdrop-blur">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 sm:flex-none"
                  disabled={busy}
                  onClick={backToFicha}
                >
                  ← Volver a la ficha
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 sm:flex-none"
                  disabled={detailBusy}
                  onClick={() => setRevision((n) => n + 1)}
                >
                  Actualizar ficha
                </Button>
              </div>
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-ink">
                  #{detail.client.client_number} · {detail.client.full_name}
                </h2>
                {pendingBanner}
                <h3 className="text-base font-semibold text-brand-300">
                  {openModule ? MODULE_INFO[openModule].title : ""}
                </h3>
              </div>
            </>
          )}
          {openModule === "entrada" && (
            <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {quickTariffs.map((tariff) => (
              <Button
                key={tariff.plan.id}
                variant="primary"
                aria-pressed={selectedQuickTariff?.plan.id === tariff.plan.id}
                className={`w-full justify-center ${selectedQuickTariff?.plan.id === tariff.plan.id ? "ring-2 ring-white/90 ring-offset-2 ring-offset-paper" : ""}`}
                disabled={detailBusy || detail.client.status !== "active"}
                onClick={() => armPlan(tariff, true, Date.now())}
              >
                Cobrar {tariff.buttonLabel} ·{" "}
                {formatMoney(tariff.amount, tariff.currency)}
              </Button>
            ))}
            <Button
              variant={quickTariffs.length > 0 ? "dark" : "primary"}
              className="w-full justify-center"
              disabled={detailBusy || detail.client.status !== "active"}
              aria-describedby="crm-entry-feedback"
              onClick={() => {
                if (detailBusy || detail.client.status !== "active") return;
                void registerEntry(detail.client.id);
              }}
            >
              {quickTariffs.length > 0
                ? "Solo confirmar entrada"
                : "Confirmar entrada"}{" "}
              {scanToken ? "por QR" : "manual"}
            </Button>
          </div>
          <p className="text-xs text-fog">
            Una visita por día · hora de Nicaragua
          </p>
          <div id="crm-entry-feedback" aria-live="polite" aria-atomic="true">
            {entryFeedback?.clientId === detail.client.id && (
              <p
                role={entryFeedback.failed ? "alert" : "status"}
                className={`rounded-xl border p-4 text-sm ${entryFeedback.failed ? "border-alert/50 text-alert" : "border-brand/40 text-brand-300"}`}
              >
                {entryFeedback.message}
              </p>
            )}
          </div>
            {entryChargeClientId === detail.client.id && paymentBlock()}
            </div>
          )}
          {openModule === "cobrar" && (
            <div className="space-y-4">
            {validityPanel()}
            {paymentBlock()}
            </div>
          )}
          {options.finance_layout === "bank_accounts_split" &&
            openModule === "productos" && (
              <div className="space-y-4">
              {paymentBlock(
                quickTariffArmed ? undefined : "Venta de productos",
              )}
              </div>
          )}
          {detail.finance_layout === "bank_accounts_split" &&
            openModule === "deudas" && (
              <div className="space-y-4">
              <DebtForm
                key={`debt:${detail.client.id}`}
                clientId={detail.client.id}
                locale={locale}
                disabled={detailBusy}
                onBusy={setBusy}
                onRefresh={() => setRevision((n) => n + 1)}
              />
              </div>
          )}
          {openModule === "historial" && (
            <div className="space-y-4">
          <ClientFinanceSummary
            detail={detail}
            pending={detailResource.loading}
            stale={!!detailResource.error}
            disabled={busy || detailResource.loading}
            retry={() => setDetailAttempt((n) => n + 1)}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg font-bold">Últimas 60 entradas</h3>
              <ul className="space-y-2 text-sm">
                {visibleVisits.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line p-3">
                    {fmt(v.visited_at)} · {v.source === "qr" ? "QR" : "Manual"}
                  </li>
                ))}
              </ul>
              {!detail.visits.length && (
                <p className="text-fog">Sin entradas registradas.</p>
              )}
              {detail.visits.length > 5 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setShowAllVisits((value) => !value)}
                >
                  {showAllVisits
                    ? "Ver menos"
                    : `Ver las ${detail.visits.length} entradas`}
                </Button>
              )}
            </div>
            <ClientIncomeHistory detail={detail} pending={detailResource.loading} stale={!!detailResource.error} />
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
                      debt_charge: "Deuda registrada",
                      debt_opening: "Saldo inicial registrado",
                    } as Record<string, string>
                  )[e.action] || e.action}
                  {e.details.category_after &&
                    ` · ${categories[e.details.category_before as keyof typeof categories]} → ${categories[e.details.category_after as keyof typeof categories]}`}
                </li>
              ))}
            </ul>
          </details>
            </div>
          )}
          {openModule === "datos" && (
            <div className="space-y-4">
          <EditClient
            key={`${detail.client.id}:${detail.client.updated_at ?? detail.client.created_at}`}
            client={detail.client}
            options={options}
            isAdmin={isAdmin}
            busy={detailBusy}
            save={async (body) => {
              await action(body);
              setNotice("Ficha guardada. Las etiquetas no cambian precios.");
            }}
          />
          <ClientCategoryPanel
            clientId={detail.client.id}
            isAdmin={isAdmin}
            disabled={detailBusy}
            onChanged={() => setRevision((n) => n + 1)}
          />
          <div>
            <div className="space-y-3">
              <h3 className="text-lg font-bold">Carnet digital o impreso</h3>
              {!detailResource.loading && !detailResource.error ? (
                <ClientCard
                  name={detail.client.full_name}
                  number={detail.client.client_number}
                  token={detail.card}
                />
              ) : (
                <p className="text-sm text-fog">
                  Carnet oculto hasta confirmar la lectura actual de la ficha.
                </p>
              )}
              <Button
                disabled={detailBusy}
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
          </div>
            </div>
          )}
          {openModule === null && (
            <>
              {validityPanel()}
              <div className="space-y-3">
                <ModuleCard
                  module="entrada"
                  pending={pendingModule === "entrada"}
                  onOpen={openModuleView}
                />
                <ModuleCard
                  module="cobrar"
                  pending={pendingModule === "cobrar"}
                  onOpen={openModuleView}
                />
                {options.finance_layout === "bank_accounts_split" && (
                  <ModuleCard
                    module="productos"
                    pending={pendingModule === "productos"}
                    onOpen={openModuleView}
                  />
                )}
                {detail.finance_layout === "bank_accounts_split" && (
                  <ModuleCard
                    module="deudas"
                    pending={pendingModule === "deudas"}
                    onOpen={openModuleView}
                  />
                )}
                <ModuleCard
                  module="historial"
                  pending={pendingModule === "historial"}
                  onOpen={openModuleView}
                />
                <ModuleCard
                  module="datos"
                  pending={pendingModule === "datos"}
                  onOpen={openModuleView}
                />
              </div>
              <div className="space-y-3">
                <Link
                  href={`/${locale}/panel/progreso/${detail.client.id}`}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-brand px-4 py-3 text-left text-onbrand transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  <span>
                    <span className="block font-semibold">
                      Progreso y medidas (peso, altura, rutina)
                    </span>
                    <span className="block text-xs text-white/80">
                      Mediciones, meta, rutina y plan nutricional.
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg">
                    ›
                  </span>
                </Link>
                <Link
                  href={`/${locale}/panel/progreso/${detail.client.id}?vista=asistencia`}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 px-4 py-3 text-left transition hover:border-brand/60 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span>
                    <span className="block font-semibold text-ink">
                      Asistencia (día, semana, mes)
                    </span>
                    <span className="block text-xs text-fog">
                      Visitas por semana y por mes, y su última visita.
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg text-fog">
                    ›
                  </span>
                </Link>
              </div>
            </>
          )}
        </section>
      )}
      {!focusDetail && staffDirectory}
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
          <Field label="Etiqueta del contacto (sólo admin)">
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
          <Field label="Plan asignado (solo etiqueta)">
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
      const res = await crmRequest<{ data: string | { id?: string } }>(
        "/api/admin/clients",
        body,
      );
      sessionStorage.removeItem(key);
      intent.current = null;
      setPending(null);
      const reference =
        typeof res.data === "string" ? res.data : (res.data?.id ?? "");
      setMessage(`Cobro confirmado. Referencia: ${reference}`);
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
      {options.payments_enabled === false && (
        <p
          role="status"
          className="rounded-xl border border-alert/40 p-3 text-sm text-alert"
        >
          {options.payment_block_reason ||
            "Los cobros están bloqueados hasta confirmar las opciones y la compatibilidad financiera. No se envió ningún cobro por este aviso."}
        </p>
      )}
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
