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
import { formatPlanDate } from "@/lib/crm/validity";
import {
  saleCatalogSchema,
  type SaleCatalog,
  type SaleCatalogProduct,
} from "@/lib/products/rules";
import {
  ProductCatalogImage,
  ProductCatalogTabs,
  ProductCategoryChoices,
  productCategoryOptions,
  type ProductCatalogView,
} from "@/components/products/product-catalog-ui";

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
const CATALOG_PAGE_SIZE = 25;
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
  initialPlanId,
  initialCurrency,
  onSuccess,
  heading,
}: {
  kind: "service_income" | "expense";
  clientId?: string;
  locale: string;
  /** Título visible opcional (ej. «Venta de productos» en su módulo). */
  heading?: string;
  disabled?: boolean;
  onRefresh?: () => void;
  onBusy?: (busy: boolean) => void;
  /** Valores iniciales opcionales; un intento pendiente siempre manda. */
  defaultAmount?: number;
  defaultConcept?: string;
  /** Cambiarlo remonta solo los campos para aplicar un preset nuevo. */
  presetKey?: string;
  /** Plan con vigencia definida: el cobro crea el periodo en el servidor. */
  initialPlanId?: string;
  /** Moneda de la tarifa elegida (Boxeo se cobra en USD). */
  initialCurrency?: "NIO" | "USD";
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
  // La moneda inicial viene de la tarifa elegida (Boxeo en USD). Al cambiar de
  // tarifa se ajusta en el mismo render, sin desmontar el comprobante.
  const [currency, setCurrency] = useState<"NIO" | "USD">(
    initialCurrency ?? "NIO",
  );
  const [currencyPresetKey, setCurrencyPresetKey] = useState(
    presetKey ?? "",
  );
  // El efectivo se limpia cuando cambia la tarifa rápida: no se arrastra de un
  // cobro al siguiente.
  const [cashText, setCashText] = useState("");
  const [cashPresetKey, setCashPresetKey] = useState(presetKey ?? "");
  if ((presetKey ?? "") !== currencyPresetKey) {
    setCurrencyPresetKey(presetKey ?? "");
    if (initialCurrency) setCurrency(initialCurrency);
  }
  if ((presetKey ?? "") !== cashPresetKey) {
    setCashPresetKey(presetKey ?? "");
    setCashText("");
  }
  const selectedCurrency = pending?.currency ?? currency;
  const [cartItems, setCartItems] = useState<CheckoutItem[]>(() =>
    pending?.kind === "service_income" ? pending.items : [],
  );
  const selectedItems =
    pending?.kind === "service_income" ? pending.items : cartItems;
  const [productSearch, setProductSearch] = useState("");
  const [catalogView, setCatalogView] =
    useState<ProductCatalogView>("productos");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    null,
  );
  const [catalogPage, setCatalogPage] = useState(0);
  const catalogProducts = useMemo(
    () => saleCatalog.data?.products ?? [],
    [saleCatalog.data],
  );
  const catalogById = useMemo(
    () =>
      new Map(
        catalogProducts.map((product) => [product.id, product] as const),
      ),
    [catalogProducts],
  );
  const categoryOptions = useMemo(
    () => productCategoryOptions(catalogProducts),
    [catalogProducts],
  );
  const activeCategory =
    selectedCategory &&
    categoryOptions.some((category) => category.name === selectedCategory)
      ? selectedCategory
      : null;
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("es-NI");
    const byCategory = activeCategory
      ? catalogProducts.filter(
          (product) => product.category === activeCategory,
        )
      : catalogProducts;
    if (!query) return byCategory;
    return byCategory.filter((product) =>
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
  }, [activeCategory, catalogProducts, productSearch]);
  const catalogPageCount = Math.max(
    1,
    Math.ceil(filteredProducts.length / CATALOG_PAGE_SIZE),
  );
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount - 1);
  const visibleProducts = filteredProducts.slice(
    safeCatalogPage * CATALOG_PAGE_SIZE,
    safeCatalogPage * CATALOG_PAGE_SIZE + CATALOG_PAGE_SIZE,
  );
  const chooseCategory = (category: string | null) => {
    setSelectedCategory(category);
    setProductSearch("");
    setCatalogPage(0);
    setCatalogView("productos");
  };
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
  const cashAmount = cashText.trim() === "" ? undefined : Number(cashText);
  const checkoutTotal = serviceAmountForTotal + productsTotal;
  const cashCents = cashAmount === undefined ? null : toCents(cashAmount);
  const cashTooLow =
    cashCents !== null && cashCents < toCents(checkoutTotal);
  const cashInvalid =
    cashAmount !== undefined &&
    (!Number.isFinite(cashAmount) ||
      cashAmount <= 0 ||
      cashAmount > 99999999 ||
      Math.abs(cashAmount * 100 - Math.round(cashAmount * 100)) > 0.000001 ||
      cashTooLow);
  const changePreview =
    cashCents !== null && !cashInvalid && cashAmount !== undefined
      ? Math.max(0, cashAmount - checkoutTotal)
      : null;
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
  // Solo se adjunta un plan cuando el catálogo confirma que tiene duración e
  // importe exacto. Así un plan sin vigencia sigue siendo un cobro genérico.
  const validityPlan =
    kind === "service_income" && initialPlanId
      ? (options.data?.plans ?? []).find(
          (plan) =>
            plan.id === initialPlanId &&
            !!plan.duration_days &&
            plan.validity_amount !== null &&
            plan.validity_amount !== undefined &&
            !!plan.validity_currency,
        )
      : undefined;
  const planAmount =
    validityPlan?.validity_amount !== undefined &&
    validityPlan?.validity_amount !== null
      ? Number(validityPlan.validity_amount)
      : null;
  const planNotice = validityPlan
    ? `Este cobro corresponde a ${validityPlan.name_es}: ${validityPlan.validity_currency} ${planAmount?.toFixed(2)} y ${validityPlan.duration_days} ${validityPlan.duration_days === 1 ? "día" : "días"}. Si el importe o la moneda no coinciden, no se activa la vigencia.`
    : "";
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
      setCashText("");
      if (body.kind === "service_income" && body.items.length > 0) {
        setCartItems([]);
        setProductSearch("");
        setSelectedCategory(null);
        setCatalogPage(0);
        setCatalogView("productos");
      }
      setMessage(
        result.plan
          ? `Cobro confirmado. ${result.plan.class_name ?? (result.plan.access === "class" ? "Disciplina" : "Gimnasio")}: vigencia del ${formatPlanDate(result.plan.started_on, locale === "en" ? "en" : "es")} al ${formatPlanDate(result.plan.expires_on, locale === "en" ? "en" : "es")} (${result.plan.days} ${result.plan.days === 1 ? "día" : "días"}). Abrí el comprobante interno para revisar los datos guardados.`
          : result.receipts && result.receipts.length > 1
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
        {heading ?? (kind === "expense" ? "Registrar gasto" : "Cobro por servicio")}
      </h2>
      <p className="text-sm text-fog">
        {kind === "expense"
          ? "Descuenta de la cuenta en su moneda. Puede dejar un saldo negativo; se mostrará en el comprobante."
          : "Registra el ingreso recibido. Podés agregar productos con stock al mismo cobro en córdobas; el inventario baja solo si todo se confirma. No reduce deudas ni crea crédito. Solo activa o renueva la vigencia cuando el cobro lleva un plan con duración definida. No lo uses para un abono de deuda o un anticipo."}{" "}
        No emite factura fiscal ni descuenta comisiones automáticamente.
      </p>
      {validityPlan && (
        <p
          role="status"
          className="rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm text-ink"
        >
          {planNotice}
        </p>
      )}
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
          className="space-y-4 rounded-xl border border-line bg-paper/40 p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold tracking-[0.18em] text-brand-300 uppercase">
                Catálogo disponible
              </p>
              <h3 className="mt-1 font-semibold text-ink">
                Seleccioná productos
              </h3>
              <p className="text-sm text-fog">
                25 por página. Buscá por nombre o detalle, o filtrá por
                categoría.
              </p>
            </div>
            <Link
              className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand"
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
              <ProductCatalogTabs
                view={catalogView}
                disabled={blocked || !!pending}
                onChange={setCatalogView}
              />
              {catalogView === "categorias" ? (
                <ProductCategoryChoices
                  categories={categoryOptions}
                  total={catalogProducts.length}
                  selected={activeCategory}
                  disabled={blocked || !!pending}
                  onSelect={chooseCategory}
                />
              ) : (
                <>
                  <label className="block text-sm text-fog">
                    Buscar producto
                    <input
                      className={input}
                      type="search"
                      value={productSearch}
                      disabled={blocked || !!pending}
                      onChange={(event) => {
                        setProductSearch(event.target.value);
                        setCatalogPage(0);
                      }}
                      placeholder="Ej.: agua, proteína, camiseta"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fog">
                    <p>
                      {activeCategory
                        ? `Categoría: ${activeCategory}`
                        : "Todas las categorías"}
                      {" · "}
                      {filteredProducts.length}{" "}
                      {filteredProducts.length === 1
                        ? "producto"
                        : "productos"}
                    </p>
                    {filteredProducts.length > 0 && (
                      <p>
                        Mostrando {safeCatalogPage * CATALOG_PAGE_SIZE + 1}–
                        {safeCatalogPage * CATALOG_PAGE_SIZE +
                          visibleProducts.length}{" "}
                        de {filteredProducts.length}
                      </p>
                    )}
                  </div>
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-fog">
                      Sin productos que coincidan con esa búsqueda o categoría.
                    </p>
                  ) : (
                    <>
                      <ul className="grid max-h-[38rem] grid-cols-2 gap-3 overflow-y-auto pr-1 min-[560px]:grid-cols-3 lg:grid-cols-4">
                        {visibleProducts.map((product) => {
                          const item = selectedItems.find(
                            (selected) => selected.product === product.id,
                          );
                          const qty = item?.qty ?? 0;
                          const qtyId = `${key}:qty:${product.id}`;
                          const attributes = Object.entries(
                            product.attributes,
                          )
                            .map(([name, value]) => `${name}: ${value}`)
                            .join(" · ");
                          const details = [product.subcategory, attributes]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <li
                              key={product.id}
                              className={`flex h-full min-w-0 flex-col gap-2 rounded-xl border p-3 ${
                                qty > 0
                                  ? "border-brand bg-brand/10"
                                  : "border-line bg-card"
                              }`}
                            >
                              <div className="min-w-0">
                                <h4
                                  title={product.name}
                                  className="line-clamp-3 min-h-[3.75rem] break-words text-sm leading-snug font-semibold text-ink sm:line-clamp-2 sm:min-h-10"
                                >
                                  {product.name}
                                </h4>
                                <p
                                  title={product.category}
                                  className="mt-1 truncate text-[0.68rem] font-semibold tracking-wide text-brand-300 uppercase"
                                >
                                  {product.category}
                                </p>
                              </div>
                              <ProductCatalogImage
                                imageData={product.image_data}
                              />
                              {details && (
                                <p
                                  title={details}
                                  className="line-clamp-2 min-h-8 break-words text-[0.7rem] leading-snug text-fog"
                                >
                                  {details}
                                </p>
                              )}
                              <div className="mt-auto space-y-1">
                                <p className="text-base font-bold text-ink">
                                  {formatMoney(product.price, "NIO")}
                                </p>
                                <p
                                  className={`text-xs ${
                                    product.low_stock
                                      ? "font-semibold text-alert"
                                      : "text-fog"
                                  }`}
                                >
                                  {product.stock} disponibles
                                  {product.low_stock ? " · Stock bajo" : ""}
                                </p>
                                {qty > 0 && (
                                  <p className="text-sm font-semibold text-brand-300">
                                    {qty} × ·{" "}
                                    {formatMoney(product.price * qty, "NIO")}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`Quitar una unidad de ${product.name}`}
                                  className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-lg text-ink disabled:opacity-40"
                                  disabled={blocked || !!pending || qty === 0}
                                  onClick={() =>
                                    setProductQty(product, qty - 1)
                                  }
                                >
                                  −
                                </button>
                                <label className="sr-only" htmlFor={qtyId}>
                                  Cantidad de {product.name}
                                </label>
                                <input
                                  id={qtyId}
                                  className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-1 py-2 text-center text-ink disabled:opacity-60"
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  max={product.stock}
                                  step="1"
                                  value={qty}
                                  disabled={blocked || !!pending}
                                  onChange={(event) =>
                                    setProductQty(
                                      product,
                                      Number(event.target.value),
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  aria-label={`Agregar una unidad de ${product.name}`}
                                  className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-paper text-lg text-ink disabled:opacity-40 sm:size-9"
                                  disabled={
                                    blocked || !!pending || qty >= product.stock
                                  }
                                  onClick={() =>
                                    setProductQty(product, qty + 1)
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {catalogPageCount > 1 && (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                            disabled={
                              blocked || !!pending || safeCatalogPage === 0
                            }
                            onClick={() =>
                              setCatalogPage(safeCatalogPage - 1)
                            }
                          >
                            Anterior
                          </button>
                          <p className="text-center text-sm text-fog">
                            Página {safeCatalogPage + 1} de {catalogPageCount}
                          </p>
                          <button
                            type="button"
                            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                            disabled={
                              blocked ||
                              !!pending ||
                              safeCatalogPage >= catalogPageCount - 1
                            }
                            onClick={() =>
                              setCatalogPage(safeCatalogPage + 1)
                            }
                          >
                            Siguiente
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
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
              : {
                  clientId,
                  items: selectedItems,
                  ...(validityPlan ? { planId: validityPlan.id } : {}),
                  ...(cashAmount !== undefined && !cashInvalid
                    ? { cashReceived: cashAmount }
                    : {}),
                }),
          });
          if (!parsed.success) {
            setMessage(
              "Revisá los campos, decimales y tasa. No se envió el movimiento.",
            );
            return;
          }
          const d = parsed.data;
          if (
            d.kind === "service_income" &&
            validityPlan &&
            (d.currency !== validityPlan.validity_currency ||
              planAmount === null ||
              d.amount !== planAmount)
          ) {
            setMessage(
              `Para activar la vigencia de ${validityPlan.name_es} el importe debe ser exactamente ${validityPlan.validity_currency} ${planAmount?.toFixed(2)}. Corregí el monto o desmarcá la tarifa rápida. No se envió el movimiento.`,
            );
            return;
          }
          const accountName = options.data?.accounts.find(
            (a) => a.id === d.account,
          )?.name;
          const confirmation =
            d.kind === "service_income" && d.items.length > 0
              ? `¿Registrar este cobro por un total de ${formatMoney(d.amount + itemsTotal(d.items), "NIO")}? Servicio: ${formatMoney(d.amount, "NIO")} (${d.concept}). Productos: ${d.items.map((item) => `${productLabel(item)} x${item.qty} (${formatMoney(item.unitPrice * item.qty, "NIO")})`).join(", ")}. Cuenta: ${accountName}. Tasa NIO/USD ${d.fx}.${d.cashReceived !== undefined ? ` Recibís ${formatMoney(d.cashReceived, "NIO")} y entregás ${formatMoney(d.cashReceived - d.amount - itemsTotal(d.items), "NIO")} de vuelto.` : ""} Bajará el stock y no aplica deuda ni crédito.${validityPlan ? ` Se activará la vigencia de ${validityPlan.name_es} por ${validityPlan.duration_days} días.` : " No aplica vigencia porque el cobro no lleva plan."}`
              : `¿Registrar ${kind === "expense" ? "gasto" : "cobro por servicio"} de ${d.currency} ${d.amount.toFixed(2)}, tasa NIO/USD ${d.fx}? Cuenta: ${accountName}. Concepto: ${d.concept}.${d.kind === "service_income" && d.cashReceived !== undefined ? ` Recibís ${formatMoney(d.cashReceived, d.currency)} y entregás ${formatMoney(d.cashReceived - d.amount, d.currency)} de vuelto.` : ""} ${kind === "expense" ? "Puede dejar saldo negativo." : validityPlan ? `Se activará o renovará la vigencia de ${validityPlan.name_es} por ${validityPlan.duration_days} días.` : "No aplica deuda, crédito ni vigencia."}`;
          if (cashInvalid) {
            setMessage(
              "El efectivo recibido no alcanza para el total del cobro. Corregilo o dejalo vacío si pagó de otra forma. No se envió el movimiento.",
            );
            return;
          }
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
          {kind === "service_income" && (
            <label className="min-w-0 text-sm text-fog sm:col-span-2">
              Efectivo recibido (opcional)
              <input
                className={input}
                name="cash"
                type="number"
                min="0"
                max="99999999"
                step="0.01"
                inputMode="decimal"
                placeholder="Solo si pagó en efectivo en una caja"
                value={cashText}
                onChange={(event) => setCashText(event.target.value)}
              />
              <span
                className={
                  cashTooLow ? "mt-1 block text-xs text-alert" : "mt-1 block text-xs text-fog"
                }
              >
                {cashTooLow
                  ? `No alcanza: el total de este cobro es ${formatMoney(checkoutTotal, selectedCurrency)}.`
                  : changePreview !== null
                    ? `Vuelto a entregar: ${formatMoney(changePreview, selectedCurrency)}.`
                    : "Dejalo vacío si pagó con transferencia, tarjeta o si no hace falta registrar el vuelto."}
              </span>
            </label>
          )}
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
