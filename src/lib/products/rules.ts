import { z } from "zod";

/** Límite de la imagen: 600 KiB binarios ≈ 819 200 caracteres en base64 (la base de datos admite 820 000). */
export const MAX_IMAGE_BYTES = 600 * 1024;
export const MAX_IMAGE_CHARS = 820000;

export const money = z
  .number()
  .finite()
  .min(0)
  .max(9999999)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Usá hasta dos decimales.");

export const productSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Escribí el nombre (mín. 2 letras).").max(120),
  category: z.string().trim().min(2, "Escribí la categoría.").max(60),
  subcategory: z.string().trim().max(60).nullable(),
  attributes: z.record(z.string().max(40), z.string().max(120)).default({}),
  status: z.enum(["activo", "inactivo"]),
  cost: money,
  price: money,
  stock_min: z.number().int().min(0).max(100000),
  image: z
    .string()
    .startsWith("data:image/jpeg;base64,")
    .max(MAX_IMAGE_CHARS)
    .nullable(),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Convierte líneas "Clave: valor" en atributos. Ignora líneas vacías y sin clave. */
export function parseAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const i = raw.indexOf(":");
    if (i < 1) continue;
    const key = raw.slice(0, i).trim();
    const value = raw.slice(i + 1).trim();
    if (key && value) out[key.slice(0, 40)] = value.slice(0, 120);
  }
  return out;
}

/** Ganancia = precio − costo, en NIO con dos decimales. */
export function profitOf(price: number, cost: number): number {
  return Math.round((price - cost) * 100) / 100;
}

/** Bytes binarios de un data URL base64 (sin el encabezado). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** Bajar calidad y tamaño hasta que la imagen quepa en el límite. */
export const COMPRESSION_STEPS: ReadonlyArray<{ maxSide: number; quality: number }> = [
  { maxSide: 1280, quality: 0.85 },
  { maxSide: 1280, quality: 0.7 },
  { maxSide: 1024, quality: 0.7 },
  { maxSide: 800, quality: 0.6 },
  { maxSide: 640, quality: 0.5 },
  { maxSide: 480, quality: 0.4 },
];

export const purchaseSchema = z.object({
  request: z.string().uuid(),
  product: z.string().uuid(),
  qty: z.number().int().min(1).max(100000),
  unit_cost: money.refine((n) => n > 0, "El costo debe ser mayor que cero."),
  method: z.string().min(1).max(40),
  account: z.string().min(1).max(60),
  note: z.string().trim().max(200).nullable(),
});

/** Largo máximo del nombre suelto de una venta particular (igual que la base). */
export const CUSTOMER_NAME_MAX = 80;

/**
 * Venta de producto.
 *
 * `client: null` es la **venta particular**: alguien que entró a comprar y no
 * tiene ficha en el gimnasio. En ese caso se puede guardar un nombre suelto
 * (`customer`), para saber a quién se le vendió, sin crearle una cuenta.
 */
export const saleSchema = z.object({
  request: z.string().uuid(),
  product: z.string().uuid(),
  qty: z.number().int().min(1).max(100000),
  client: z.string().uuid().nullable(),
  customer: z
    .string()
    .trim()
    .min(2, "Si escribís el nombre de quien compra, que tenga al menos 2 letras.")
    .max(CUSTOMER_NAME_MAX, "El nombre de quien compra no puede pasar de 80 letras.")
    .nullable()
    .optional(),
  method: z.string().min(1).max(40),
  account: z.string().min(1).max(60),
});

/** Catálogo mínimo para vender: nunca expone costo ni ganancia. */
export const saleCatalogProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  subcategory: z.string().trim().min(1).max(60).nullable(),
  attributes: z.record(z.string().max(40), z.string().max(120)).default({}),
  price: money.refine((value) => value > 0, "El precio debe ser mayor que cero."),
  stock: z.number().int().positive().max(100000),
  low_stock: z.boolean(),
  // Foto ya reducida (≤ 600 KB) para reconocer el producto al vender.
  // .default(null) mantiene válido un catálogo anterior a la migración 00060.
  image_data: z.string().max(900000).nullable().default(null),
});
export type SaleCatalogProduct = z.infer<typeof saleCatalogProductSchema>;
export const saleCatalogSchema = z.object({
  products: z.array(saleCatalogProductSchema).max(5000),
});
export type SaleCatalog = z.infer<typeof saleCatalogSchema>;

export const adjustSchema = z.object({
  product: z.string().uuid(),
  qty: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Escribí una cantidad distinta de cero."),
  note: z.string().trim().min(3, "Explicá el ajuste (mín. 3 letras).").max(200),
});

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), product: productSchema }),
  z.object({ action: z.literal("purchase"), purchase: purchaseSchema }),
  z.object({ action: z.literal("sell"), sale: saleSchema }),
  z.object({ action: z.literal("adjust"), adjust: adjustSchema }),
]);
export type ProductAction = z.infer<typeof actionSchema>;

const failures: Record<string, string> = {
  AUTH: "No tenés permiso para cambiar productos o stock.",
  INVALID_IMAGE: "La imagen no es válida. Usá JPG y menos de 600 KB.",
  INVALID_COST: "Revisá el costo: debe ser mayor que cero y con hasta dos decimales.",
  INVALID_QTY: "La cantidad debe ser mayor que cero.",
  INVALID_REQUEST: "Falta la referencia de la operación. Actualizá la página e intentá de nuevo.",
  NOT_FOUND: "No encontramos el producto o el cliente.",
  PRODUCT_INACTIVE: "El producto está inactivo. Activalo antes de comprar o vender.",
  SIN_STOCK: "No hay suficiente stock para esa venta.",
  NEGATIVE_STOCK: "El ajuste dejaría el stock en negativo.",
  CLIENT_REQUIRED: "Elegí un cliente registrado o marcá «Venta particular».",
  INVALID_CLIENT: "Ese cliente ya no está disponible. Elegí otro o marcá «Venta particular».",
  INVALID_CUSTOMER: "El nombre de quien compra no puede pasar de 80 letras.",
  INVALID_PAYMENT: "Revisá el monto, el método o la cuenta.",
  INVALID_ACCOUNT: "Elegí una cuenta activa de la misma moneda.",
  INVALID_METHOD: "El método no está habilitado para esta moneda.",
  FINANCE_REVIEW_REQUIRED: "La cuenta financiera no está habilitada para registrar esta operación. No se registró nada.",
};
/** Mensaje en español para un código de la base de datos. Nunca muestra detalles técnicos. */
export function productFailureMessage(code: string | undefined): string {
  if (code && Object.hasOwn(failures, code)) return failures[code];
  return "No se pudo confirmar la operación. Revisá el listado antes de repetirla; la misma referencia evita duplicados.";
}
