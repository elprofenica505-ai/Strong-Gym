import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageFinance } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import {
  findStoredVoidReceipt,
  parseVoidReceipt,
  voidDiagnostic,
  voidMessage,
  voidRequestSchema,
  voidResultPath,
} from "@/lib/finance/voids";
import { sameOrigin } from "@/lib/security/same-origin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lee la anulación ya guardada, con reintentos cortos.
 *
 * Se usa para no confundir «no llegó la respuesta» con «no se guardó»: la
 * escritura puede haber quedado hecha aunque el celular no reciba el
 * comprobante. Nunca lanza: si no se puede leer, devuelve null.
 */
async function readStoredVoid(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  transactionId: string,
  attempts = 3,
): Promise<Awaited<ReturnType<typeof findStoredVoidReceipt>>> {
  if (!supabase) return null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const stored = await findStoredVoidReceipt(supabase, transactionId);
      if (stored) return stored;
    } catch {
      // Se reintenta abajo; un fallo de lectura no cambia el resultado.
    }
    if (attempt < attempts - 1) await sleep(300);
  }
  return null;
}

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

/**
 * Origen público del pedido, para redirigir al mismo dominio que ve la persona.
 *
 * Detrás del proxy del despliegue, `request.url` puede apuntar a la dirección
 * interna o a la URL de una versión concreta; redirigir ahí perdería la
 * sesión (las cookies son por dominio). Se prefiere el `origin` del navegador,
 * que ya pasó por `sameOrigin`.
 */
function publicBase(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // Sigue abajo con el host.
    }
  }
  const host = request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

const isFormRequest = (request: Request) => {
  const type = request.headers.get("content-type") ?? "";
  return (
    type.includes("application/x-www-form-urlencoded") ||
    type.includes("multipart/form-data")
  );
};

/**
 * Consulta previa: qué pasaría si se anula ese movimiento.
 * Devuelve si está permitido y, si no, el código del motivo (ya anulado,
 * es una reversa, día distinto, interruptor apagado…).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) {
    return reply({ error: "AUTH", message: voidMessage("AUTH") }, 403);
  }
  if (!isSupabaseConfigured) return reply({ error: "DEMO", message: "Sin Supabase conectado." }, 503);

  const id = new URL(request.url).searchParams.get("transaction");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return reply({ error: "NOT_FOUND", message: voidMessage("NOT_FOUND") }, 404);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return reply({ error: "DEMO", message: "Sin Supabase conectado." }, 503);

  const { data, error } = await supabase.rpc("finance_void_plan", {
    p_transaction: parsed.data,
  });
  if (error) {
    const code = (error.message ?? "").trim().toUpperCase();
    const known = code.startsWith("AUTH") ? "AUTH" : "NOT_FOUND";
    return reply({ error: known, message: voidMessage(known) }, known === "AUTH" ? 403 : 404);
  }
  // Si ya está anulada, la consulta devuelve también el comprobante guardado:
  // así la pantalla puede mostrar el resultado real en vez de solo un aviso.
  const plan = data as { allowed?: boolean; code?: string } | null;
  if (plan?.allowed === false && plan.code === "ALREADY_VOIDED") {
    const stored = await readStoredVoid(supabase, parsed.data, 1);
    if (stored) return reply({ ...plan, receipt: stored });
  }
  return reply(data);
}

/**
 * Anular un movimiento sin borrarlo (FIN-01).
 *
 * La ruta no decide nada: valida la forma del pedido y llama a
 * `finance_void_movement`, que comprueba rol, MFA, interruptor, dueño del
 * movimiento y día en curso, e inserta la reversa en la misma transacción.
 *
 * Acepta dos formas de pedido:
 *   * **Formulario del navegador** (la que usa Caja): responde con un redirect
 *     a la pantalla de resultado, que arma el servidor leyendo la base. Así el
 *     resultado no depende de que el celular reciba un cuerpo JSON completo:
 *     es una página, y si algo se cortó, la página siguiente muestra la
 *     verdad guardada.
 *   * **JSON** (integraciones y pruebas): responde el comprobante o el código
 *     de error, como antes.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "ORIGIN" }, 403);

  const asForm = isFormRequest(request);
  const base = publicBase(request);
  const form = asForm ? await request.formData().catch(() => null) : null;
  const formLocale = String(form?.get("locale") ?? "es");
  const formTransaction = String(form?.get("transactionId") ?? "");
  // Con formulario, cualquier desenlace termina en la página de resultado: es
  // la que sabe leer la verdad (incluidos los motivos que da la base).
  const formRedirect = () =>
    NextResponse.redirect(
      new URL(voidResultPath(formLocale, formTransaction || "00000000-0000-4000-8000-000000000000"), base),
      { status: 303, headers: { "Cache-Control": "private, no-store" } },
    );

  if (!isSupabaseConfigured) {
    if (asForm) return formRedirect();
    return reply({ error: "DEMO", message: "La anulación solo aplica con Supabase conectado." }, 503);
  }

  const user = await getCurrentUser();
  if (!user || !canManageFinance(user)) {
    if (asForm)
      return NextResponse.redirect(
        new URL(`/${/^[a-z]{2}$/.test(formLocale) ? formLocale : "es"}/ingresar`, base),
        { status: 303 },
      );
    return reply({ error: "AUTH", message: voidMessage("AUTH") }, 403);
  }

  const raw = asForm
    ? {
        transactionId: form?.get("transactionId"),
        reason: form?.get("reason"),
        requestId: form?.get("requestId"),
      }
    : await request.json().catch(() => null);
  const parsed = voidRequestSchema.safeParse(raw);
  if (!parsed.success) {
    if (asForm) return formRedirect();
    const issue = parsed.error.issues[0]?.message ?? voidMessage("INVALID_REQUEST");
    return reply({ error: "INVALID", message: issue }, 422);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (asForm) return formRedirect();
    return reply({ error: "DEMO", message: "La anulación solo aplica con Supabase conectado." }, 503);
  }

  // Reintento después de una respuesta perdida: si la anulación ya existe, se
  // devuelve esa misma. No se llama dos veces a la base.
  const already = await readStoredVoid(supabase, parsed.data.transactionId, 1);
  if (already) {
    if (asForm) return formRedirect();
    return reply({ ok: true, receipt: already, recovered: true });
  }

  let data: unknown = null;
  let error: { message?: string; code?: string } | null = null;
  try {
    const rpc = await supabase.rpc("finance_void_movement", {
      p_request: parsed.data.requestId,
      p_transaction: parsed.data.transactionId,
      p_reason: parsed.data.reason,
    });
    data = rpc.data;
    error = rpc.error;
  } catch (thrown) {
    // La llamada puede cortarse después de anular: se verifica antes de avisar.
    error = { code: "FETCH", message: thrown instanceof Error ? thrown.name : "FETCH" };
  }

  if (error) {
    const code = (error.message ?? "").trim().toUpperCase();
    const known = [
      "AUTH",
      "NOT_FOUND",
      "ALREADY_VOIDED",
      "IS_REVERSAL",
      "PERMISSION_OFF",
      "NOT_YOURS",
      "NOT_TODAY",
      "NOT_ALLOWED",
      "INVALID_REASON",
      "REQUEST_CONFLICT",
      "INVALID_REQUEST",
      "INVALID_ACCOUNT",
      "INVALID_PAYMENT",
      "FINANCE_REVIEW_REQUIRED",
    ];
    const match = known.find((item) => code.startsWith(item));
    if (match) {
      // Con formulario, el motivo lo explica la página de resultado leyendo
      // `finance_void_plan`: un solo lugar para las reglas.
      if (asForm) return formRedirect();
      const status =
        match === "AUTH"
          ? 403
          : match === "NOT_FOUND"
            ? 404
            : match === "REQUEST_CONFLICT" || match === "ALREADY_VOIDED"
              ? 409
              : match === "INVALID_REASON" || match === "INVALID_REQUEST"
                ? 422
                : match === "NOT_ALLOWED" ||
                    match === "PERMISSION_OFF" ||
                    match === "NOT_YOURS" ||
                    match === "NOT_TODAY"
                  ? 403
                  : 409;
      return reply({ error: match, message: voidMessage(match) }, status);
    }
    console.error("[finance] anulación", { code: error.code, stage: "rpc" });
    // El error puede haber llegado después de anular: si la bitácora ya tiene
    // la reversa, se responde con ella en vez de asustar con un fallo falso.
    const stored = await readStoredVoid(supabase, parsed.data.transactionId);
    if (stored) {
      if (asForm) return formRedirect();
      return reply({ ok: true, receipt: stored, recovered: true });
    }
    if (asForm) return formRedirect();
    return reply(
      {
        error: "UNCONFIRMED",
        stage: "rpc",
        diagnostic: voidDiagnostic("RPC", error.code),
        message: voidMessage("UNCONFIRMED"),
      },
      502,
    );
  }

  const receipt = parseVoidReceipt(data);
  if (!receipt) {
    // Mismo criterio: antes de decir que no hay comprobante, se mira la base.
    const stored = await readStoredVoid(supabase, parsed.data.transactionId);
    if (stored) {
      if (asForm) return formRedirect();
      return reply({ ok: true, receipt: stored, recovered: true });
    }
    if (asForm) return formRedirect();
    return reply(
      {
        error: "UNCONFIRMED",
        stage: "receipt",
        diagnostic: voidDiagnostic("COMPROBANTE"),
        message: voidMessage("UNCONFIRMED"),
      },
      503,
    );
  }

  if (asForm) return formRedirect();
  return reply({ ok: true, receipt });
}
