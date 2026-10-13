import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Refresca la sesión de Supabase en cada request y devuelve la respuesta
 * con las cookies actualizadas. Sin esto, el usuario se desloguea solo
 * cuando vence el token de acceso.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], headers) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value as string);
        }
      },
    },
  });

  // Importante: no metas lógica entre createServerClient y getUser(),
  // o la sesión puede quedar sin refrescar.
  try {
    await supabase.auth.getUser();
  } catch {
    // Si Supabase no responde, seguimos con la request igual.
  }

  return response;
}

/** Borra la sesión del usuario (logout forzado desde el servidor). */
export async function clearSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, options } of cookiesToSet) {
          response.cookies.set(name, "", { ...options, maxAge: 0 });
        }
      },
    },
  });

  try {
    await supabase.auth.signOut();
  } catch {
    // ignoramos
  }

  return response;
}
