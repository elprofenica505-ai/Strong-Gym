# Pendiente: quitar la apariencia de demo y preparar la entrega

**Estado:** pendiente por decisión del dueño el 23 de octubre de 2026 («todavía estamos lejos del día de la entrega; esto queda para cuando estemos más avanzados»).
**No ejecutar todavía.** No se cambia código ni se borran datos de esta tarea sin una orden nueva.

## Qué se verificó (23 oct 2026)

| Pregunta | Respuesta comprobada |
|---|---|
| ¿La app publicada está en modo demo? | **No.** En Vercel, el proyecto `strong-gym` tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` cargadas para producción. El despliegue vigente sale de `main`. |
| ¿Se puede activar el modo demo en producción? | **No.** `src/lib/supabase/config-policy.ts` exige `NODE_ENV=development`, `NEXT_PUBLIC_ENABLE_DEMO=true` y cero credenciales. En Vercel no se cumple ninguna. |
| ¿Por qué se ve como demo? | En el repositorio solo existe `.env.example`. Sin `.env.local`, la copia local arranca en el modo de ejemplo de solo lectura. |
| ¿La portada pública habla de demo? | **No.** `https://strong-gym-gamma.vercel.app/es` no muestra ningún aviso de demo. |

## Por qué se «lee» como demo

1. **Andamio de código** (invisible para el dueño): `src/lib/data/demo-content.ts`, `demo-sessions.ts`, `demo-admin.ts`, `src/components/layout/demo-banner.tsx` y las variables `DEMO_MODE` / `isDemo`.
2. **Textos «Modo demo»** en el panel: finanzas, progreso, roles, entrenadores, importar, herramientas, reportes y clientes. Solo aparecen si no hay base conectada.
3. **Guía interna** `src/app/[locale]/panel/ayuda/page.tsx`: habla de «datos de ejemplo» y de limpiarlos. **Se ve siempre** al entrar como administrador.
4. **Registros inventados en la base**: usuarios de prueba (con correos del desarrollador), ventas, reservas y mediciones. **Esto es lo que el dueño vería como real.**
5. **Nombre engañoso:** `demoGallery` en `src/lib/data/demo-content.ts` son las fotos **reales** del gimnasio, no datos falsos.

## Fase 1 · Antes de que el dueño pruebe (cambio chico, sin datos)

- [ ] Cambiar los textos visibles «Modo demo» por «Sin conexión a la base de datos» y el aviso de portada por «Versión local sin base».
- [ ] Quitar de `panel/ayuda` las frases que suenan a demo.
- [ ] Renombrar `demoGallery` a `gallery` (solo nombre; las fotos son reales).
- [ ] Decidir si los registros de prueba se marcan con el prefijo «PRUEBA» durante la revisión del dueño.

Archivos: `src/i18n/dictionaries/es.ts`, `src/i18n/dictionaries/en.ts`, `src/components/layout/demo-banner.tsx`, páginas de `src/app/[locale]/panel/` y `src/components/sections/gallery.tsx`.

## Fase 2 · Día de la entrega (después del pago y con respaldo previo)

- [ ] Respaldo completo y verificado antes de tocar nada.
- [ ] Borrar clientes, ventas, reservas, mediciones y usuarios de prueba **de Auth** (borrar el perfil no basta).
- [ ] Cargar los datos reales del gimnasio y conciliar saldos.
- [ ] Verificar que la app publicada quedó sin datos ficticios.

Herramienta existente: `src/app/[locale]/panel/reset/page.tsx` («Preparar limpieza final»). Requiere inventario y autorización expresa; la limpieza de datos ficticios sigue la regla vigente: **no hacerla sin orden del dueño**.

## Fase 3 · Después de entregar

- [ ] Retirar el modo demo del código: `src/lib/data/demo-*.ts`, `DemoBanner`, `DEMO_MODE` en `src/lib/supabase/env.ts` y `config-policy.ts`, y las ramas `isDemo` del proveedor y las páginas.
- [ ] Actualizar `docs/DEMO-PRODUCCION.md` y las referencias de `docs/MAPA-PENDIENTES.md`.

**Por qué en este orden:** el modo demo es hoy la red de seguridad para abrir la app sin credenciales. Si se retira antes de la entrega, no habría nada que mostrar si falla la configuración.

## Datos que faltan antes de empezar la Fase 1

- [ ] ¿Los entrenadores de la portada (Douglas García, José Luis Pérez, María Rodríguez) son reales o de ejemplo? Si son inventados, se cambian antes de que el dueño mire.
- [ ] ¿Se marcan los registros de prueba con «PRUEBA» o se explican en persona?

## Para ver la app real en una computadora

Crear `.env.local` copiando `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` desde Vercel (Settings → Environment Variables). Son las claves públicas; la `service_role` nunca va ahí.
