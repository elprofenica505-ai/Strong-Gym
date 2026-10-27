import type { NextConfig } from "next";
import { resolveAppMode } from "./src/lib/supabase/config-policy";

// Rechazar configuración parcial/privilegiada ANTES de compilar NEXT_PUBLIC.
const hasConnectionValues = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
if (hasConnectionValues && resolveAppMode({
  nodeEnv: process.env.NODE_ENV,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}) !== "supabase") {
  throw new Error("Configuración Supabase inválida: usar HTTPS y clave pública anon/publishable. No se muestran valores.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Fuerza HTTPS en navegadores durante un año (sin includeSubDomains para no afectar otros subdominios).
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Cámara sólo para este sitio (lector de QR); sin micrófono, ubicación ni pago de terceros.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          // CSP obligatoria con los únicos orígenes externos que usa la app:
          // Supabase (datos/realtime/imágenes), Unsplash (fotos permitidas por
          // next/image) y Google Maps (mapa embebido). Next todavía necesita
          // scripts/estilos inline; no se permiten scripts de otros dominios.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              "media-src 'self' blob:",
              "frame-src 'self' https://www.google.com https://maps.google.com",
            ].join("; "),
          },
        ],
      },
      {
        source: "/:locale/recuperar/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
