import { NextResponse } from "next/server";
import { canAccessPanel, isAdminRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { importExercises } from "@/lib/exercises/queries";
import { toImportRows } from "@/lib/exercises/import";
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

interface DatasetShape {
  count?: number;
  exercises?: unknown[];
}

async function downloadDataset(): Promise<DatasetShape | null> {
  for (const url of DATASET_URLS) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: url.includes("api.github.com")
          ? { Accept: "application/vnd.github.raw" }
          : undefined,
      });
      if (!response.ok) continue;
      const parsed = (await response.json()) as DatasetShape;
      if (Array.isArray(parsed?.exercises) && parsed.exercises.length > 0) return parsed;
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
  const { rows, skipped } = toImportRows(dataset);
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

  return reply({
    ok: true,
    imported: result.imported,
    total: result.total,
    skipped,
    source: "RepDB (repdb.co)",
  });
}
