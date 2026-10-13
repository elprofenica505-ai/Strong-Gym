import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, defaultLocale, detectLocale, isLocale } from "@/i18n/config";
import { updateSession } from "@/lib/supabase/proxy-client";

/**
 * Decide a qué idioma mandar al usuario: primero la cookie
 * (elección explícita), después el idioma del navegador.
 */
function pickLocale(request: NextRequest): string {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return detectLocale(request.headers.get("accept-language")) ?? defaultLocale;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale = isLocale(firstSegment);

  // 1) La raíz redirige al idioma detectado conservando querystring y hash
  //    (ej: /?week=2026-W42 → /es?week=2026-W42).
  if (pathname === "/") {
    const locale = pickLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return updateSession(request, response);
  }

  // 2) Si no empieza con un idioma válido (y no es un asset o API),
  //    lo mandamos al idioma preferido con la misma ruta.
  const isSystemPath =
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(firstSegment ?? "");

  if (!hasLocale && !isSystemPath) {
    const locale = pickLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // 3) Recordamos el idioma que el usuario está navegando.
  if (hasLocale) {
    response.cookies.set(LOCALE_COOKIE, firstSegment, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  // 4) Refrescamos la sesión de Supabase (si está configurado).
  return updateSession(request, response);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas menos:
     *  - archivos de Next (_next/static, _next/image)
     *  - archivos estáticos de /public
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
