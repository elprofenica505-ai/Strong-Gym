"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { compressProductImage } from "@/lib/products/compress";
import {
  parseAttributes,
  profitOf,
  productFailureMessage,
} from "@/lib/products/rules";

type Product = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  attributes: Record<string, string>;
  status: "activo" | "inactivo";
  cost: number;
  price: number;
  profit: number;
  stock: number;
  stock_min: number;
  low_stock: boolean;
  image_data: string | null;
};
type Data = {
  products: Product[];
  options: {
    accounts: { id: string; name: string }[];
    methods: { id: string; name_es: string }[];
    writes_enabled: boolean;
  };
  clients: { id: string; full_name: string }[];
};
type Mode = null | "form" | "purchase" | "sale" | "adjust";

const input =
  "w-full min-w-0 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink disabled:opacity-60";
const button =
  "rounded-full border border-line px-4 py-2 text-[0.875rem] text-ink transition-colors hover:border-brand disabled:opacity-50";
const primary =
  "rounded-full bg-brand px-5 py-2.5 text-[0.9rem] font-semibold text-ink disabled:opacity-50";
const nio = (n: number) =>
  new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO", maximumFractionDigits: 2 }).format(n);

const blankForm = {
  id: null as string | null,
  name: "",
  category: "",
  subcategory: "",
  attributes: "",
  status: "activo" as "activo" | "inactivo",
  cost: "",
  price: "",
  stock_min: "0",
  image: null as string | null,
};

export function ProductManager() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState(blankForm);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Vista de tarjetas: página actual (25 por página) y producto abierto.
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Referencia de la operación en curso: se conserva si la respuesta se pierde.
  const requestRef = useRef<string | null>(null);

  /** Lectura pura: no toca el estado, así el efecto no encadena renders. */
  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "No se pudo cargar.");
    return body as Data;
  }, []);

  const applyProducts = useCallback((body: Data) => {
    setData(body);
    setLoadError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      applyProducts(await fetchProducts());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [applyProducts, fetchProducts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await fetchProducts();
        if (!cancelled) applyProducts(body);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "No se pudo cargar.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProducts, fetchProducts]);

  const open = (next: Mode, product: Product | null = null) => {
    setMode(next);
    setSelected(product);
    setMessage(null);
    requestRef.current = crypto.randomUUID();
    if (next === "form") {
      setImageNote(null);
      setForm(
        product
          ? {
              id: product.id,
              name: product.name,
              category: product.category,
              subcategory: product.subcategory ?? "",
              attributes: Object.entries(product.attributes)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n"),
              status: product.status,
              cost: String(product.cost),
              price: String(product.price),
              stock_min: String(product.stock_min),
              image: product.image_data,
            }
          : blankForm,
      );
    }
  };

  const close = () => {
    setMode(null);
    setSelected(null);
    requestRef.current = null;
  };

  const send = async (payload: unknown, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          ok: false,
          text: body.error ?? productFailureMessage(undefined),
        });
        return false;
      }
      setMessage({ ok: true, text: okText });
      await load();
      return true;
    } catch {
      setMessage({ ok: false, text: productFailureMessage(undefined) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    const cost = Number(form.cost.replace(",", "."));
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(cost) || !Number.isFinite(price) || cost < 0 || price < 0) {
      setMessage({ ok: false, text: "Revisá precio y costo: deben ser números." });
      return;
    }
    const ok = await send(
      {
        action: "save",
        product: {
          id: form.id,
          name: form.name,
          category: form.category,
          subcategory: form.subcategory.trim() || null,
          attributes: parseAttributes(form.attributes),
          status: form.status,
          cost,
          price,
          stock_min: Number(form.stock_min) || 0,
          image: form.image,
        },
      },
      form.id ? "Producto actualizado." : "Producto creado.",
    );
    if (ok) close();
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await compressProductImage(file);
      setForm((f) => ({ ...f, image: url }));
      setImageNote("Imagen lista (≤ 600 KB).");
    } catch (err) {
      setImageNote(err instanceof Error ? err.message : "No se pudo usar la imagen.");
    }
  };

  const submitOperation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected || !requestRef.current) return;
    const fd = new FormData(e.currentTarget);
    const qty = Number(fd.get("qty"));
    if (mode === "purchase") {
      const ok = await send(
        {
          action: "purchase",
          purchase: {
            request: requestRef.current,
            product: selected.id,
            qty,
            unit_cost: Number(fd.get("unit_cost")),
            method: String(fd.get("method")),
            account: String(fd.get("account")),
            note: String(fd.get("note") ?? "").trim() || null,
          },
        },
        `Compra registrada: ${qty} unidad(es) de ${selected.name}.`,
      );
      if (ok) close();
    } else if (mode === "sale") {
      const ok = await send(
        {
          action: "sell",
          sale: {
            request: requestRef.current,
            product: selected.id,
            qty,
            client: String(fd.get("client")),
            method: String(fd.get("method")),
            account: String(fd.get("account")),
          },
        },
        `Venta registrada: ${qty} x ${selected.name}.`,
      );
      if (ok) close();
    } else if (mode === "adjust") {
      const ok = await send(
        {
          action: "adjust",
          adjust: {
            product: selected.id,
            qty: Number(fd.get("qty")),
            note: String(fd.get("note") ?? ""),
          },
        },
        "Ajuste de stock registrado.",
      );
      if (ok) close();
    }
  };

  if (loadError)
    return (
      <div className="rounded-xl border border-line p-5 text-fog">
        <p>{loadError}</p>
        <button type="button" className={`${button} mt-3`} onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  if (!data) return <p className="text-fog">Cargando productos…</p>;

  const accountOptions = data.options.accounts;
  const methodOptions = data.options.methods;
  const writesOff = !data.options.writes_enabled;
  // La ficha abierta siempre se lee de los datos recién cargados.
  const detailProduct = detailId
    ? data.products.find((p) => p.id === detailId) ?? null
    : null;
  const PAGE_SIZE = 25;
  const pageCount = Math.max(1, Math.ceil(data.products.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageProducts = data.products.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      {writesOff && (
        <p className="rounded-xl border border-line p-4 text-[0.875rem] text-fog">
          Las compras y ventas quedan bloqueadas hasta que la base de datos confirme la
          configuración financiera. Los productos y el stock siguen disponibles para editar.
        </p>
      )}
      {message && (
        <p role="status" className={message.ok ? "text-brand-300" : "text-red-300"}>
          {message.text}
        </p>
      )}

      {mode === "form" ? (
        <form onSubmit={saveProduct} className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
          <h2 className="text-[1.1rem] font-semibold sm:col-span-2">
            {form.id ? "Editar producto" : "Nuevo producto"}
          </h2>
          <label className="grid gap-1 text-[0.85rem]">
            Nombre
            <input className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Categoría
            <input className={input} required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej. Suplementos" />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Subcategoría (opcional)
            <input className={input} value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Estado
            <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "activo" | "inactivo" })}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Costo (NIO)
            <input className={input} inputMode="decimal" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem]">
            Precio de venta (NIO)
            <input className={input} inputMode="decimal" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <p className="text-[0.85rem] text-fog sm:col-span-2">
            Ganancia por unidad:{" "}
            <strong className="text-ink">
              {nio(profitOf(Number(form.price) || 0, Number(form.cost) || 0))}
            </strong>
          </p>
          <label className="grid gap-1 text-[0.85rem]">
            Alerta de stock bajo (unidades)
            <input className={input} inputMode="numeric" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: e.target.value })} />
          </label>
          <label className="grid gap-1 text-[0.85rem] sm:col-span-2">
            Atributos (una línea por dato, ej. &quot;Sabor: chocolate&quot;)
            <textarea className={input} rows={3} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} />
          </label>
          <div className="grid gap-2 text-[0.85rem] sm:col-span-2">
            <span>Imagen (se reduce sola a 600 KB o menos)</span>
            <input type="file" accept="image/*" onChange={(e) => void pickImage(e.target.files?.[0])} className="text-fog" />
            {imageNote && <span className="text-fog">{imageNote}</span>}
            {form.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image} alt="Vista previa del producto" className="size-28 rounded-lg object-cover" />
            )}
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className={primary} disabled={busy}>Guardar producto</button>
            <button type="button" className={button} onClick={close}>Cancelar</button>
          </div>
        </form>
      ) : detailProduct ? (
        <section aria-label={`Ficha de ${detailProduct.name}`} className="space-y-4 rounded-xl border border-line p-5">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              close();
              setDetailId(null);
            }}
          >
            ← Volver a productos
          </button>
          <h2 className="text-xl font-bold text-ink">{detailProduct.name}</h2>
          {detailProduct.image_data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detailProduct.image_data} alt={`Foto de ${detailProduct.name}`} className="max-h-72 w-full rounded-xl object-cover" />
          ) : (
            <p className="grid h-32 place-items-center rounded-xl bg-line/40 text-sm text-fog">Sin foto</p>
          )}
          <dl className="grid gap-2 text-[0.9rem] sm:grid-cols-2">
            <div>
              <dt className="text-fog">Precio de venta</dt>
              <dd className="font-semibold text-ink">{nio(detailProduct.price)}</dd>
            </div>
            <div>
              <dt className="text-fog">Stock actual</dt>
              <dd className={`font-semibold ${detailProduct.low_stock ? "text-red-300" : "text-ink"}`}>
                {detailProduct.stock} unidades
                {detailProduct.low_stock ? " · Stock bajo" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-fog">Categoría</dt>
              <dd>{detailProduct.category}{detailProduct.subcategory ? ` / ${detailProduct.subcategory}` : ""}</dd>
            </div>
            <div>
              <dt className="text-fog">Estado</dt>
              <dd>{detailProduct.status === "activo" ? "Activo" : "Inactivo"}</dd>
            </div>
            <div>
              <dt className="text-fog">Costo</dt>
              <dd>{nio(detailProduct.cost)}</dd>
            </div>
            <div>
              <dt className="text-fog">Ganancia por unidad</dt>
              <dd>{nio(detailProduct.profit)}</dd>
            </div>
            <div>
              <dt className="text-fog">Alerta de stock bajo</dt>
              <dd>{detailProduct.stock_min} unidades</dd>
            </div>
            {Object.entries(detailProduct.attributes).length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-fog">Detalles</dt>
                <dd>{Object.entries(detailProduct.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => open("form", detailProduct)} disabled={busy}>Editar</button>
            <button type="button" className={button} onClick={() => open("purchase", detailProduct)} disabled={busy || writesOff || detailProduct.status !== "activo"}>Comprar</button>
            <button type="button" className={button} onClick={() => open("sale", detailProduct)} disabled={busy || writesOff || detailProduct.status !== "activo" || detailProduct.stock <= 0}>Vender</button>
            <button type="button" className={button} onClick={() => open("adjust", detailProduct)} disabled={busy}>Ajustar stock</button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primary} onClick={() => open("form")} disabled={busy}>
              Nuevo producto
            </button>
            {data.products.length > 0 && (
              <p className="text-sm text-fog">
                {data.products.length} {data.products.length === 1 ? "producto" : "productos"} · tocá uno para ver su ficha completa.
              </p>
            )}
          </div>
          {data.products.length === 0 ? (
            <p className="text-fog">Todavía no hay productos. Creá el primero con &quot;Nuevo producto&quot;.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {pageProducts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setDetailId(p.id);
                        setMessage(null);
                      }}
                      className="flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-paper p-3 text-left transition-colors hover:border-brand disabled:opacity-50"
                    >
                      <span className="break-words font-semibold text-ink">{p.name}</span>
                      {p.image_data ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_data} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                      ) : (
                        <span className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-line/40 text-[0.7rem] text-fog">sin foto</span>
                      )}
                      <span className="text-[0.9rem]">
                        <span className="block font-semibold text-ink">{nio(p.price)}</span>
                        <span className={`block ${p.low_stock ? "text-red-300" : "text-fog"}`}>
                          Stock: {p.stock} unidades{p.low_stock ? " · Stock bajo" : ""}
                        </span>
                        {p.status === "inactivo" && <span className="block text-fog">Inactivo</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className={button}
                    disabled={busy || safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Anterior
                  </button>
                  <p className="text-sm text-fog">
                    Página {safePage + 1} de {pageCount}
                  </p>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selected && (mode === "purchase" || mode === "sale" || mode === "adjust") && (
        <form key={`${mode}-${selected.id}`} onSubmit={submitOperation} className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
          <h2 className="text-[1.1rem] font-semibold sm:col-span-2">
            {mode === "purchase" && `Compra de ${selected.name}`}
            {mode === "sale" && `Venta de ${selected.name}`}
            {mode === "adjust" && `Ajuste de stock: ${selected.name}`}
            <span className="block text-[0.85rem] font-normal text-fog">Stock actual: {selected.stock}</span>
          </h2>
          {mode === "adjust" && (
            <>
              <label className="grid gap-1 text-[0.85rem]">
                Cantidad a sumar (+) o restar (−)
                <input name="qty" className={input} inputMode="numeric" required placeholder="Ej. -2" />
              </label>
              <label className="grid gap-1 text-[0.85rem]">
                Motivo del ajuste
                <input name="note" className={input} required minLength={3} maxLength={200} placeholder="Ej. conteo físico, producto dañado" />
              </label>
              <p className="text-[0.85rem] text-fog sm:col-span-2">Un ajuste no mueve dinero. Queda registrado con su motivo.</p>
            </>
          )}
          {mode === "purchase" && (
            <>
              <label className="grid gap-1 text-[0.85rem]">
                Cantidad
                <input name="qty" className={input} inputMode="numeric" required placeholder="Ej. 10" />
              </label>
              <label className="grid gap-1 text-[0.85rem]">
                Costo unitario (NIO)
                <input name="unit_cost" className={input} inputMode="decimal" required />
              </label>
              <PaymentFields accounts={accountOptions} methods={methodOptions} />
              <label className="grid gap-1 text-[0.85rem] sm:col-span-2">
                Nota (opcional)
                <input name="note" className={input} maxLength={200} />
              </label>
              <p className="text-[0.85rem] text-fog sm:col-span-2">La compra registra un gasto de inventario por el total y suma stock.</p>
            </>
          )}
          {mode === "sale" && (
            <>
              <label className="grid gap-1 text-[0.85rem]">
                Cliente registrado
                <select name="client" className={input} required defaultValue="">
                  <option value="" disabled>Elegí un cliente</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[0.85rem]">
                Cantidad
                <input name="qty" className={input} inputMode="numeric" required placeholder="Ej. 1" />
              </label>
              <PaymentFields accounts={accountOptions} methods={methodOptions} />
              <p className="text-[0.85rem] text-fog sm:col-span-2">Precio: {nio(selected.price)} por unidad. La venta baja el stock y registra un ingreso.</p>
            </>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className={primary} disabled={busy}>Confirmar</button>
            <button type="button" className={button} onClick={close}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

function PaymentFields({
  accounts,
  methods,
}: {
  accounts: { id: string; name: string }[];
  methods: { id: string; name_es: string }[];
}) {
  return (
    <>
      <label className="grid gap-1 text-[0.85rem]">
        Método de pago
        <select name="method" className={input} required defaultValue="">
          <option value="" disabled>Elegí un método</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>{m.name_es}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[0.85rem]">
        Cuenta (NIO)
        <select name="account" className={input} required defaultValue="">
          <option value="" disabled>Elegí una cuenta</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
    </>
  );
}
