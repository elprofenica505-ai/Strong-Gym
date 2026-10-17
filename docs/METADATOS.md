# Metadatos y URL pública

## Corrección del aviso metadataBase (2026-10-16)

El layout `src/app/[locale]/layout.tsx` **ya tenía metadataBase**; no era correcto
resumir el problema como ausencia total de esa configuración. La imagen global
`src/app/opengraph-image.tsx` se descubría fuera de ese layout, también para el
404 global generado. Eso dejaba resolución de imágenes sin una base explícita
y provocaba el aviso en el build local. Además getSiteUrl podía devolver localhost
fuera de desarrollo o adoptar por defecto la URL temporal de un Preview.

- La misma imagen existente, sin cambiar su diseño ni usar generación IA, ahora
  está en `src/app/[locale]/opengraph-image.tsx`. Hereda el layout de idioma.
- MetadataBase también se devuelve al resolver metadatos de un locale inválido.
- Por defecto producción utiliza `https://strong-gym-gamma.vercel.app`, dominio
  público confirmado. Se conserva NEXT_PUBLIC_SITE_URL para configuración
  explícita y VERCEL_PROJECT_PRODUCTION_URL para dominio de producción del hosting.
  Un VERCEL_URL temporal de Preview no se usa como URL canónica por defecto.
- Localhost/127.0.0.1/IPv6 loopback de una vieja plantilla no se publican si
  NODE_ENV=production. Desarrollo permite localhost, incluso con puerto explícito.
- `.env.example` ahora indica el dominio público y explica el override local.
- Se mantienen html lang español/inglés y la estructura actual de layouts; no
  se agrega un segundo html/body ni se altera autenticación, finanzas o SQL.

## Rutas y compatibilidad

Las imágenes quedan en `/es/opengraph-image` y `/en/opengraph-image`. Los tags
Open Graph y Twitter se resuelven automáticamente con URLs absolutas.
El enlace antiguo `/opengraph-image` sigue atendido por la redirección de idioma
que ya existía en proxy.ts; se comprobó que termina en una imagen PNG válida.
No se agregó un segundo generador ni se cambió el archivo fuente de la imagen.

En Preview, Next puede usar el host del despliegue para la imagen de metadatos;
la URL canónica pública sigue separada, según la configuración de getSiteUrl.
Para otra instalación/domino se configura NEXT_PUBLIC_SITE_URL con su URL real.
No es una credencial ni requiere SQL o cambios en Supabase.

## Validación

1. `npm run test:auth`: incluye seis tests de URL pública: producción sin env,
   desarrollo, URL explícita, producción Vercel, Preview y rechazo de localhost
   heredado en producción.
2. `npm run build`: terminado 40/40 y **sin** el aviso metadataBase. La variación
   del contador corresponde a reubicar la ruta de imagen, no a borrar módulos.
3. `npm run test:metadata`: usa el build local/demo con Supabase sin configurar.
   Arranca un servidor Next de producción efímero, solicita ES/EN como bot,
   comprueba idioma y canonical, tags OG/Twitter absolutos, imágenes PNG 1200×630
   con HTTP 200, compatibilidad de enlace antiguo y una ruta inexistente HTTP 404.
   Verifica ausencia del aviso durante solicitudes y cierra el proceso al salir.
   Agregado a CI después del build. No necesita dependencias adicionales.
4. Siguen pasando typecheck, pruebas financieras Next/RSC, build-sql y SQL.

Salida real local:

```text
typecheck: tsc --noEmit (exit 0)
lint: 10 problems (0 errors, 10 warnings) anteriores
test:auth: 131 pass, 0 fail
Next/RSC: Cuentas y Reportes con filas/vacío PASS
build: Compiled successfully; Generating static pages (40/40)
metadataBase: sin advertencia en build
metadata HTTP: ES/EN + OG/Twitter PNG + enlace anterior + 404 PASS
test:sql: Todo pasó; CRM 48; compatibilidad 67
build-sql --check y git diff --check: PASS
```

Esto comprueba el build y las respuestas HTTP locales reales, **no** que una red
social haya renovado su caché ni la propagación en el dominio desplegado.
Se requiere el Preview/producción con este commit para comprobar el despliegue.
PR #10 continúa sin merge. No se modifican saldos, clientes, cobros o permisos.
