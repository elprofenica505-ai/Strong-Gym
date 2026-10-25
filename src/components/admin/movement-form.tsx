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
  type CheckoutItem,
  type FinanceOptions,
  type MovementIntent,
  type MovementReceipt,
  type MovementResult,
} from "@/lib/finance/movements";
import { formatMoney } from "@/lib/finance/format-money";
import {
  saleCatalogSchema,
  type SaleCatalog,
  type SaleCatalogProduct,
} from "@/lib/products/rules";

const validateHistory = (value: unknown) =>
  z.array(receiptSchema).safeParse(value).success;
const validateOptions = (value: unknown) =>
  financeOptionsSchema.safeParse(value).success;
const validateSaleCatalog = (value: unknown) =>
  saleCatalogSchema.safeParse(value).success;
const toCents = (value: number) => Math.round(value * 100);
const itemsTotal = (items: CheckoutItem[]) =>
  items.reduce((sum, item) => sum + toCents(item.unitPrice) * item.qty, 0) / 100;
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
  defaultAmount,
  defaultConcept,
  presetKey,
  onSuccess,
}: {
  kind: "service_income" | "expense";
  clientId?: string;
  locale: string;
  disabled?: boolean;
  onRefresh?: () => void;
  onBusy?: (busy: boolean) => void;
  /** Valores iniciales opcionales; un intento pendiente siempre manda. */
  defaultAmount?: number;
  defaultConcept?: string;
  /** Cambiarlo remonta solo los campos para aplicar un preset nuevo. */
  presetKey?: string;
  /** Solo se llama después de que el servidor confirma el movimiento. */
  onSuccess?: (
    receiptId: string,
    result: MovementResult,
  ) => void | Promise<void>;
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
  const productsEnabled = kind === "service_income" && !!clientId;
  const saleCatalog = useCrmResource<SaleCatalog>(
    productsEnabled ? "/api/products?catalog=sale" : null,
    revision,
    productsEnabled,
    validateSaleCatalog,
  );
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const selectedCurrency = pending?.currency ?? currency;
  const [cartItems, setCartItems] = useState<CheckoutItem[]>(() =>
    pending?.kind === "service_income" ? pending.items : [],
  );
  const selectedItems =
    pending?.kind === "service_income" ? pending.items : cartItems;
  const [productSearch, setProductSearch] = useState("");
  const catalogById = useMemo(
    () =>
      new Map(
        (saleCatalog.data?.products ?? []).map((product) => [
          product.id,
          product,
        ]),
      ),
    [saleCatalog.data],
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("es-NI");
    const products = saleCatalog.data?.products ?? [];
    if (!query) return products;
    return products.filter((product) =>
      [
        product.name,
        product.category,
        product.subcategory ?? "",
        ...Object.entries(product.attributes).flatMap(([name, value]) => [
          name,
          value,
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase("es-NI")
        .includes(query),
    );
  }, [productSearch, saleCatalog.data]);
  const amountDraftKey = `${kind}:${clientId ?? "expense"}:${presetKey ?? "standard"}`;
  const [amountDraft, setAmountDraft] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const amountText = pending
    ? String(pending.amount)
    : amountDraft?.key === amountDraftKey
      ? amountDraft.value
      : defaultAmount === undefined
        ? ""
        : String(defaultAmount);
  const draftServiceAmount =
    amountText.trim() === "" ? 0 : Number(amountText);
  const serviceAmountForTotal = Number.isFinite(draftServiceAmount)
    ? draftServiceAmount
    : 0;
  const productsTotal = itemsTotal(selectedItems);
  const staleSelectedItems =
    !pending && saleCatalog.data
      ? selectedItems.filter((item) => {
          const product = catalogById.get(item.product);
          return (
            !product ||
            item.qty > product.stock ||
            toCents(item.unitPrice) !== toCents(product.price)
          );
        })
      : [];
  const productLabel = (item: CheckoutItem) =>
    catalogById.get(item.product)?.name ?? "Producto seleccionado";
  const refreshSelectedItems = () => {
    if (pending) return;
    setCartItems((current) =>
      current.flatMap((item) => {
        const product = catalogById.get(item.product);
        if (!product) return [];
        return [
          {
            product: item.product,
            qty: Math.min(item.qty, product.stock),
            unitPrice: product.price,
          },
        ];
      }),
    );
    setMessage(
      "Precios y cantidades actualizados. Revisá el nuevo total antes de confirmar.",
    );
  };
  const setProductQty = (product: SaleCatalogProduct, nextQty: number) => {
    if (pending) return;
    const qty = Number.isFinite(nextQty)
      ? Math.min(product.stock, Math.max(0, Math.trunc(nextQty)))
      : 0;
    setCartItems((current) => {
      const withoutProduct = current.filter(
        (item) => item.product !== product.id,
      );
      return qty === 0
        ? withoutProduct
        : [
            ...withoutProduct,
            { product: product.id, qty, unitPrice: product.price },
          ];
    });
  };
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptLinks, setReceiptLinks] = useState<
    MovementResult["receipts"]
  >(undefined);
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
    setReceiptLinks(undefined);
    let confirmedReceiptId: string | null = null;
    let confirmedResult: MovementResult | null = null;
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
      confirmedResult = result;
      confirmedReceiptId = result.id;
      setReceipt(result.id);
      setReceiptLinks(result.receipts);
      if (body.kind === "service_income" && body.items.length > 0) {
        setCartItems([]);
        setProductSearch("");
      }
      setMessage(
        result.receipts && result.receipts.length > 1
          ? "Cobro confirmado. Abrí los comprobantes internos de cada línea para revisar los datos guardados."
          : "Movimiento confirmado. Abrí el comprobante interno para revisar los datos guardados.",
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

    // Recién aquí el padre puede encadenar otra acción (por ejemplo, la
    // entrada del pase del día). Si esa acción falla, el cobro sigue
    // confirmado y el mensaje evita que caja lo repita por error.
    if (confirmedReceiptId && confirmedResult) {
      try {
        await onSuccess?.(confirmedReceiptId, confirmedResult);
      } catch {
        setMessage(
          "Movimiento confirmado. La acción siguiente no se pudo completar automáticamente; revisá el estado antes de repetir el cobro.",
        );
      }
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
          : "Registra el ingreso recibido. Podés agregar productos con stock al mismo cobro en córdobas; el inventario baja solo si todo se confirma. No reduce deudas, no crea crédito ni renueva planes. No lo uses para un abono de deuda o un anticipo."}{" "}
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
      {productsEnabled && (
        <section
          aria-label="Productos para agregar al cobro"
          className="space-y-3 rounded-xl border border-line bg-paper/40 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-ink">Productos</h3>
              <p className="text-sm text-fog">
                Agregá productos con stock a este mismo cobro, o dejalos como
                una venta sola con el monto del servicio en cero.
              </p>
            </div>
            <Link
              className="text-sm text-brand-300 underline"
              href={`/${locale}/panel/productos`}
            >
              Productos y stock
            </Link>
          </div>
          {saleCatalog.loading && (
            <p role="status" className="text-sm text-fog">
              Cargando productos con stock…
            </p>
          )}
          {saleCatalog.error && (
            <p role="alert" className="break-words text-sm text-alert">
              No pudimos cargar los productos. Podés cobrar solo el servicio;
              para vender productos, reintentá la carga. {saleCatalog.error}
            </p>
          )}
          {!saleCatalog.loading &&
            !saleCatalog.error &&
            saleCatalog.data?.products.length === 0 && (
              <p className="text-sm text-fog">
                Todavía no hay productos activos con precio y stock. Creá el
                producto y registrá su existencia en Productos y stock.
              </p>
            )}
          {saleCatalog.data && saleCatalog.data.products.length > 0 && (
            <>
              <label className="block text-sm text-fog">
                Buscar producto
                <input
                  className={input}
                  type="search"
                  value={productSearch}
                  disabled={blocked || !!pending}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Ej.: agua, proteína, camiseta"
                />
              </label>
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-fog">
                  Sin productos que coincidan con esa búsqueda.
                </p>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {filteredProducts.map((product) => {
                    const item = selectedItems.find(
                      (selected) => selected.product === product.id,
                    );
                    const qty = item?.qty ?? 0;
                    const qtyId = `${key}:qty:${product.id}`;
                    const attributes = Object.entries(product.attributes)
                      .map(([name, value]) => `${name}: ${value}`)
                      .join(" · ");
                    return (
                      <li
                        key={product.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold text-ink">
                            {product.name}
                          </p>
                          <p className="break-words text-xs text-fog">
                            {product.category}
                            {product.subcategory
                              ? ` · ${product.subcategory}`
                              : ""}
                            {attributes ? ` · ${attributes}` : ""}
                          </p>
                          <p className="text-sm text-fog">
                            {formatMoney(product.price, "NIO")} · Stock:{" "}
                            {product.stock}
                            {product.low_stock ? " · Stock bajo" : ""}
                          </p>
                          {qty > 0 && (
                            <p className="text-sm font-semibold text-brand-300">
                              Subtotal:{" "}
                              {formatMoney(product.price * qty, "NIO")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Quitar una unidad de ${product.name}`}
                            className="grid size-9 place-items-center rounded-full border border-line text-lg text-ink disabled:opacity-40"
                            disabled={blocked || !!pending || qty === 0}
                            onClick={() => setProductQty(product, qty - 1)}
                          >
                            −
                          </button>
                          <label className="sr-only" htmlFor={qtyId}>
                            Cantidad de {product.name}
                          </label>
                          <input
                            id={qtyId}
                            className="w-16 rounded-lg border border-line bg-paper px-2 py-2 text-center text-ink disabled:opacity-60"
                            type="number"
                            min="0"
                            max={product.stock}
                            step="1"
                            value={qty}
                            disabled={blocked || !!pending}
                            onChange={(event) =>
                              setProductQty(product, Number(event.target.value))
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Agregar una unidad de ${product.name}`}
                            className="grid size-9 place-items-center rounded-full border border-line text-lg text-ink disabled:opacity-40"
                            disabled={
                              blocked || !!pending || qty >= product.stock
                            }
                            onClick={() => setProductQty(product, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
          {selectedItems.length > 0 && (
            <div className="space-y-2 rounded-lg bg-night-3/60 p-3 text-sm">
              <h4 className="font-semibold text-ink">Resumen del cobro</h4>
              <ul className="space-y-1">
                {selectedItems.map((item) => (
                  <li
                    key={item.product}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {productLabel(item)} × {item.qty} ·{" "}
                      {formatMoney(item.unitPrice * item.qty, "NIO")}
                    </span>
                    {!pending && (
                      <button
                        type="button"
                        className="text-brand-300 underline disabled:opacity-50"
                        disabled={disabled || busy}
                        onClick={() =>
                          setCartItems((current) =>
                            current.filter(
                              (selected) => selected.product !== item.product,
                            ),
                          )
                        }
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p>
                Servicio: {formatMoney(serviceAmountForTotal, "NIO")} ·
                Productos: {formatMoney(productsTotal, "NIO")}
              </p>
              <p className="text-base font-bold text-ink">
                Total a cobrar:{" "}
                {formatMoney(serviceAmountForTotal + productsTotal, "NIO")}
              </p>
              {selectedCurrency !== "NIO" && (
                <p role="alert" className="text-alert">
                  Los productos solo se cobran en córdobas. Cambiá la moneda a
                  NIO o quitá los productos.
                </p>
              )}
              {staleSelectedItems.length > 0 && (
                <div className="space-y-2">
                  <p role="alert" className="text-alert">
                    Cambió el precio o el stock de un producto elegido.
                    Actualizá la selección y revisá el nuevo total antes de
                    confirmar.
                  </p>
                  <button
                    type="button"
                    className="rounded-full border border-line px-4 py-2 font-semibold text-ink disabled:opacity-50"
                    disabled={disabled || busy}
                    onClick={refreshSelectedItems}
                  >
                    Usar precio y stock actuales
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <form
        key={`${kind}:${clientId ?? "expense"}:${presetKey ?? "standard"}:${pending?.requestId ?? "new"}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked || pending || lock.current) return;
          if (productsEnabled && selectedItems.length > 0) {
            if (selectedCurrency !== "NIO") {
              setMessage(
                "Los productos solo se cobran en córdobas. Cambiá la moneda a NIO o quitá los productos. No se envió el movimiento.",
              );
              return;
            }
            if (saleCatalog.loading || saleCatalog.error || !saleCatalog.data) {
              setMessage(
                "Esperá a confirmar el catálogo de productos antes de registrar la venta. No se envió el movimiento.",
              );
              return;
            }
            if (staleSelectedItems.length > 0) {
              setMessage(
                "Cambió el precio o el stock de un producto elegido. Revisá las cantidades; no se envió el movimiento.",
              );
              return;
            }
          }
          const f = new FormData(event.currentTarget);
          const rawConcept = String(f.get("concept"));
          const parsed = movementSchema.safeParse({
            kind,
            requestId: crypto.randomUUID(),
            amount: Number(amountText),
            currency: selectedCurrency,
            method: String(f.get("method")),
            account: String(f.get("account")),
            concept:
              kind === "service_income" &&
              selectedItems.length > 0 &&
              rawConcept.trim() === ""
                ? "Venta de productos"
                : rawConcept,
            fx: Number(f.get("fx")),
            ...(kind === "expense"
              ? { category: String(f.get("category")) }
              : { clientId, items: selectedItems }),
          });
          if (!parsed.success) {
            setMessage(
              "Revisá los campos, decimales y tasa. No se envió el movimiento.",
            );
            return;
          }
          const d = parsed.data;
          const accountName = options.data?.accounts.find(
            (a) => a.id === d.account,
          )?.name;
          const confirmation =
            d.kind === "service_income" && d.items.length > 0
              ? `¿Registrar este cobro por un total de ${formatMoney(d.amount + itemsTotal(d.items), "NIO")}? Servicio: ${formatMoney(d.amount, "NIO")} (${d.concept}). Productos: ${d.items.map((item) => `${productLabel(item)} x${item.qty} (${formatMoney(item.unitPrice * item.qty, "NIO")})`).join(", ")}. Cuenta: ${accountName}. Tasa NIO/USD ${d.fx}. Bajará el stock y no aplica deuda, crédito ni vigencia.`
              : `¿Registrar ${kind === "expense" ? "gasto" : "cobro por servicio"} de ${d.currency} ${d.amount.toFixed(2)}, tasa NIO/USD ${d.fx}? Cuenta: ${accountName}. Concepto: ${d.concept}. ${kind === "expense" ? "Puede dejar saldo negativo." : "No aplica deuda, crédito ni vigencia."}`;
          if (!window.confirm(confirmation)) return;
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
              min={kind === "service_income" && selectedItems.length > 0 ? "0" : "0.01"}
              max="99999999"
              step="0.01"
              required={kind === "expense" || selectedItems.length === 0}
              value={amountText}
              onChange={(event) =>
                setAmountDraft({
                  key: amountDraftKey,
                  value: event.target.value,
                })
              }
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
              required={kind === "expense" || selectedItems.length === 0}
              placeholder={
                kind === "service_income" && selectedItems.length > 0
                  ? "Opcional si solo vendés productos"
                  : undefined
              }
              defaultValue={pending?.concept ?? defaultConcept}
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
              : selectedItems.length > 0
                ? serviceAmountForTotal > 0
                  ? "Confirmar cobro y productos"
                  : "Confirmar venta de productos"
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
          {pending?.kind === "service_income" && pending.items.length > 0 && (
            <div>
              <p>
                Productos del intento · Total:{" "}
                {formatMoney(
                  pending.amount + itemsTotal(pending.items),
                  "NIO",
                )}
              </p>
              <ul className="list-inside list-disc">
                {pending.items.map((item) => (
                  <li key={item.product}>
                    {productLabel(item)} × {item.qty} ·{" "}
                    {formatMoney(item.unitPrice * item.qty, "NIO")}
                  </li>
                ))}
              </ul>
            </div>
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
                if (pending?.kind === "service_income")
                  setCartItems(pending.items);
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
      {receipt && receiptLinks && receiptLinks.length > 1 ? (
        <div className="space-y-1">
          <p className="font-semibold">Comprobantes de este cobro</p>
          <ul className="space-y-1">
            {receiptLinks.map((item) => (
              <li key={item.id}>
                <Link
                  className="break-words text-brand-300 underline"
                  href={`/${locale}/panel/comprobantes/${item.id}`}
                >
                  {item.label} · {formatMoney(item.amount, "NIO")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        receipt && (
          <Link
            className="block break-all text-brand-300 underline"
            href={`/${locale}/panel/comprobantes/${receipt}`}
          >
            Abrir comprobante interno · {receipt}
          </Link>
        )
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
