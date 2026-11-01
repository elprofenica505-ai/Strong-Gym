import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/data/queries";
import { FIGURE_WIDTHS } from "@/lib/exercises/figure";

export const runtime = "nodejs";

/**
 * Imágenes de la biblioteca de ejercicios (EX-01).
 *
 * Por qué un intermediario y no enlazar las imágenes del dataset:
 *   · La app tiene CSP estricta (`img-src 'self' …`). Abrirla a un dominio
 *     ajeno para 1.217 archivos es peor que servir por acá.
 *   · Si mañana el origen cambia de dominio, se cambia esta constante y no la
 *     base de datos ni la pantalla.
 *   · La licencia del dataset permite el uso dentro de la app, **no**
 *     redistribuir los archivos: por eso no se copian al repositorio.
 *
 * Sólo se sirven rutas con forma conocida (`images/flat/<slug>-start.webp`) y
 * sólo a quien tiene sesión iniciada. Se cachea en el borde 30 días.
 *
 * **Tamaño (EX-06).** El socio se quejó de que la app se sentía lenta. La
 * causa era esta ruta: entregaba el archivo original del origen —fotos JPG de
 * ~60 KB a 850 px— para tarjetas que en el teléfono miden ~340 px. Ahora se
 * pide `?w=320|640|960` y acá se redimensiona y se convierte a WebP. Medido
 * sobre una foto real: 71 KB → **10 KB** a 320 px (‑86 %) y 24 KB a 640 px.
 * Si el recorte falla, se devuelve el original: la pantalla nunca se rompe por
 * una imagen.
 */

/**
 * Dos orígenes, cada uno con su forma de ruta:
 *   · RepDB — dibujos planos WebP en `images/flat/`.
 *   · free-exercise-db (dominio público) — fotos JPG en `Carpeta/0.jpg` y
 *     `Carpeta/1.jpg`, la posición inicial y la final de cada movimiento.
 */
const REPDB_SOURCES = [
  (path: string) => `https://cdn.jsdelivr.net/gh/RepDB/exercise-dataset@main/${path}`,
  (path: string) => `https://raw.githubusercontent.com/RepDB/exercise-dataset/main/${path}`,
];

const FREE_DB_SOURCES = [
  (path: string) => `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/${path}`,
  (path: string) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${path}`,
];

/** Ruta válida: nada de `..`, ni URLs, ni otros directorios del repo. */
const SAFE_PATH = /^images\/flat\/[a-z0-9][a-z0-9-]{0,60}\.webp$/;

/** Foto del segundo catálogo: `Nombre_Con_Guiones_Bajos/0.jpg` o `/1.jpg`. */
const SAFE_PHOTO = /^[A-Za-z0-9][A-Za-z0-9 _().,'&-]{0,90}\/[01]\.jpg$/;

/** Sólo estas medidas: evita que cualquiera pida 5.000 px y caliente el servidor. */
const ANCHOS = new Set<number>(Object.values(FIGURE_WIDTHS));
const ANCHO_POR_DEFECTO = FIGURE_WIDTHS.card;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  const isPhoto = SAFE_PHOTO.test(path);
  if (!SAFE_PATH.test(path) && !isPhoto) return new NextResponse(null, { status: 404 });

  const pedido = Number(url.searchParams.get("w"));
  const ancho = ANCHOS.has(pedido) ? pedido : ANCHO_POR_DEFECTO;

  for (const source of isPhoto ? FREE_DB_SOURCES : REPDB_SOURCES) {
    try {
      const response = await fetch(source(path), {
        // Cachea el original en el servidor: no se vuelve a pedir por cada socio.
        next: { revalidate: 2592000 },
      });
      if (!response.ok) continue;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength === 0 || body.byteLength > 2_000_000) continue;

      const reducida = await reducir(body, ancho, isPhoto);
      if (reducida) return imagen(reducida, "image/webp");

      // Sin recorte posible: se entrega el original, como antes.
      return imagen(body, isPhoto ? "image/jpeg" : "image/webp");
    } catch {
      // Se prueba la siguiente fuente; nunca se rompe la pantalla por esto.
    }
  }

  return new NextResponse(null, { status: 404 });
}

/**
 * Redimensiona y convierte a WebP. `withoutEnlargement` deja intactos los
 * dibujos que ya vienen a 512 px si se pide 640: nunca se inventan píxeles.
 */
async function reducir(body: Buffer, ancho: number, isPhoto: boolean) {
  try {
    return await sharp(body)
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: isPhoto ? 72 : 78, effort: 4 })
      .toBuffer();
  } catch {
    return null;
  }
}

function imagen(body: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // La URL lleva la medida, así que cada tamaño se cachea por su cuenta.
      "Cache-Control": "public, max-age=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
