import { NextResponse } from "next/server";
import { canAccessPanel, isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { importExercises } from "@/lib/exercises/queries";
import { toImportRows } from "@/lib/exercises/import";
import { toSecondCatalogRows } from "@/lib/exercises/second-catalog";
import { applyLibraryVisibility } from "@/lib/exercises/queries";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Descargar 2,6 MB y cargarlos puede tardar: se le da margen.
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

/**
 * Carga y actualización de la biblioteca de ejercicios (EX-01).
 *
 * Sólo administración con el segundo factor verificado. El JSON **no** vive en
 * el repositorio: la licencia del dataset permite usarlo dentro de la app, no
 * redistribuirlo. Por eso esta ruta lo descarga del origen oficial y lo manda a
 * `admin_import_exercises`, que hace *upsert* por `id` y se puede repetir sin
 * duplicar nada.
 *
 * Las direcciones son fijas a propósito: aceptar una URL del navegador sería
 * abrir la puerta a que el servidor pida cualquier dirección interna (SSRF).
 */

const DATASET_URLS = [
  "https://cdn.jsdelivr.net/gh/RepDB/exercise-dataset@main/exercises.json",
  "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json",
  "https://api.github.com/repos/RepDB/exercise-dataset/contents/exercises.json",
];

/**
 * Segundo origen: `yuhonas/free-exercise-db`, **dominio público (Unlicense)**.
 * Aporta barra, mancuerna, máquina y polea que a RepDB le faltan. Sus textos
 * vienen en inglés; lo que se carga es la traducción curada que vive en
 * `src/lib/exercises/catalog-*.ts`.
 */
const SECOND_DATASET_URLS = [
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json",
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
];

interface DatasetShape {
  count?: number;
  exercises?: unknown[];
}

async function downloadDataset(urls: string[] = DATASET_URLS): Promise<DatasetShape | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: url.includes("api.github.com")
          ? { Accept: "application/vnd.github.raw" }
          : undefined,
      });
      if (!response.ok) continue;
      const parsed = (await response.json()) as unknown;
      // El segundo origen entrega un arreglo suelto; el primero, `{ exercises }`.
      if (Array.isArray(parsed) && parsed.length > 0) return { exercises: parsed };
      const wrapped = parsed as DatasetShape | null;
      if (Array.isArray(wrapped?.exercises) && wrapped.exercises.length > 0) return wrapped;
    } catch {
      // Se prueba la siguiente dirección.
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ code: "ORIGIN" }, 403);

  const user = await getCurrentUser();
  if (!user || !canAccessPanel(user) || !isAdminRole(user.role))
    return reply({ code: "AUTH", message: "Sólo administración puede actualizar la biblioteca." }, 403);

  const dataset = await downloadDataset();
  if (!dataset?.exercises?.length)
    return reply(
      {
        code: "DATASET_UNAVAILABLE",
        message:
          "No pudimos descargar el catálogo de ejercicios desde su origen. No se tocó nada de lo que ya estaba cargado: reintentá en un rato.",
      },
      503,
    );

  // Se traduce acá: el español de las etiquetas vive en la web, no en la base.
  const primary = toImportRows(dataset);

  // El segundo catálogo se suma a la misma carga: una sola escritura y, si
  // algo falla, no queda media biblioteca actualizada y media vieja. Si el
  // origen no responde, la carga sigue con el primero: nunca se pierde lo que
  // ya andaba.
  const second = await downloadDataset(SECOND_DATASET_URLS);
  const secondary = second?.exercises?.length
    ? toSecondCatalogRows(second.exercises)
    : { rows: [], skipped: 0 };
  const rows = [...primary.rows, ...secondary.rows];
  const skipped = primary.skipped + secondary.skipped;

  if (rows.length === 0)
    return reply(
      {
        code: "DATASET_INVALID",
        message:
          "El catálogo llegó vacío o con un formato que no reconocemos. No se tocó nada de lo que ya estaba cargado.",
      },
      422,
    );

  const result = await importExercises({ exercises: rows });
  if (!result.ok) {
    if (result.code.includes("AUTH"))
      return reply({ code: "AUTH", message: "Sólo administración puede actualizar la biblioteca." }, 403);
    return reply(
      {
        code: "IMPORT_FAILED",
        message:
          "La carga no se completó. Lo que ya estaba cargado sigue igual; volvé a intentarlo.",
      },
      503,
    );
  }

  // Después de cargar se vuelve a aplicar el criterio de «esto es de gimnasio»:
  // así lo nuevo entra ya filtrado y nadie tiene que tocar un interruptor.
  const visibility = await applyLibraryVisibility();

  return reply({
    ok: true,
    imported: result.imported,
    total: result.total,
    /** Cuántos ejercicios nuevos entraron de cada origen. */
    fromRepdb: primary.rows.length,
    fromSecond: secondary.rows.length,
    skipped,
    visible: visibility.ok ? visibility.visible : null,
    hidden: visibility.ok ? visibility.hidden : null,
    source: "RepDB (repdb.co) y free-exercise-db (dominio público)",
  });
}
