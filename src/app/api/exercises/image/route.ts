import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/queries";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const path = new URL(request.url).searchParams.get("path") ?? "";
  const isPhoto = SAFE_PHOTO.test(path);
  if (!SAFE_PATH.test(path) && !isPhoto) return new NextResponse(null, { status: 404 });

  for (const source of isPhoto ? FREE_DB_SOURCES : REPDB_SOURCES) {
    try {
      const response = await fetch(source(path), {
        // Cachea la imagen en el servidor: no se vuelve a pedir por cada socio.
        next: { revalidate: 2592000 },
      });
      if (!response.ok) continue;
      const body = await response.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > 2_000_000) continue;
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": isPhoto ? "image/jpeg" : "image/webp",
          "Cache-Control": "public, max-age=2592000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Se prueba la siguiente fuente; nunca se rompe la pantalla por esto.
    }
  }

  return new NextResponse(null, { status: 404 });
}
