# Reparación de reservas, diseño móvil y preparación de escritura financiera

Esta es la entrega histórica `56df90e`. Estado posterior: [C.1 cobros y gastos](./COBROS-GASTOS.md); el CSV de escritura ya fue recibido y revisado.

Fecha: 2026-10-17. Rama `arena/9bdd978c-strong-gym`. PR #10 sin merge.

## 1. Reservas: eliminar la dependencia de relaciones embebidas

`getMyBookings`, `getAllBookings` y `getSessionsForWeek` leen columnas planas.
Componen sesiones, disciplinas, entrenadores y perfiles mediante IDs bajo el
mismo cliente Supabase y la misma sesión/RLS. No usan service-role, no crean FK
por suposición y no necesitan que PostgREST reconozca relaciones embebidas.

Las lecturas por ID deduplican, usan lotes de 100 y timeout de 15 segundos por
consulta. Una referencia ausente/invisible o un error de permisos sigue siendo
un fallo explícito: no elimina reservas ni devuelve un éxito vacío. Un entrenador
NULL sí es válido. No se filtran referencias históricas por estar inactivas.

Regresión: un doble devuelve PGRST200 ante cualquier embedding. Las consultas
nuevas funcionan sin solicitarlo. También se prueban permisos, referencias
faltantes, ocupación, lotes grandes y entrenador opcional. Esto no sustituye
verificar el despliegue conectado a Supabase real.

## 2. Diseño: causa reproducida en el shell completo

Antes: viewport de 393 px, contenido de 412 px. El CTA del encabezado tenía
`inline-flex` y `hidden` compitiendo en el mismo enlace. Ahora la visibilidad
responsive pertenece a un contenedor separado; el enlace conserva su layout.

Se agregan restricciones de ancho mínimo al shell, espacio lateral en pantallas
financieras, saltos para textos largos y distribución adaptable para métodos,
movimientos y cuentas. Se corrige la plantilla de columnas de Cuentas; las tablas
conservan desplazamiento local y los importes no se truncan.

Prueba reproducible con Chromium, shell/header/footer/componentes reales y CSS
de producción. Sólo sesión y lecturas están sustituidas por fixtures EJEMPLO;
no se insertan en Supabase. Incluye Caja/Reportes/Cuentas/Gastos, fixtures con
filas, vacíos e importes/textos largos, a 320/360/393/414/640/768/1024/1280 px.
Desactiva `overflow-x: clip` durante la medición para no ocultar desbordamientos.
Verifica geometría, visibilidad del CTA y scroll local de tablas. Son 96 casos,
no una prueba de hidratación, formularios o persistencia remota.

```bash
npm ci
npm run build
npx playwright-core install --with-deps chromium
npm run test:layout
# También admite CHROMIUM_PATH=/ruta/a/chromium para un navegador instalado.
```

CI instala Chromium y ejecuta la misma prueba después del build.

## 3. Seguridad de la entrega

Se retira definitivamente el endpoint antiguo de reset por correos/prefijos/IDs.
Admin recibe HTTP 410 y ningún borrado; otros roles, HTTP 403. No se importa un
cliente de escritura. La pantalla ahora explica el procedimiento de limpieza
SQL revisado, respaldo, conciliación y aprobación del dueño. La guía ya no
incluye DELETE por coincidencias ni recomienda reinstalar para recuperar datos.
Esto no ejecuta la limpieza final ni elimina tablas, módulos o datos existentes.

## 4. Cobros y gastos: autorización aceptada, implementación no terminada

El permiso del administrador permite desarrollarlos y habilitarlos correctamente.
No se atribuye el bloqueo actual a una decisión vigente del usuario. No se
habilita el escritor legacy desconocido sólo cambiando un booleano.

Falta inspeccionar las funciones y disparadores de la base remota para evitar
actualizar saldos dos veces o ignorar una automatización existente. El fixture
local tiene un escritor centinela, no la implementación bancaria real.
`supabase/DIAGNOSTICO-ESCRITURA-FINANCIERA.sql` ahora exporta también triggers,
sus funciones (aunque estén en otro esquema), constraints y defaults. Sigue
siendo un único SELECT de metadatos; no ejecuta las funciones que exporta ni
incluye filas de clientes o movimientos. Se prueba dentro de una transacción
READ ONLY con un trigger que lanzaría error si se ejecutara.

Siguiente paso: obtener esa salida actual, implementar y probar cobros/gastos
transaccionales, idempotencia, comprobantes internos, autoría y saldos NIO/USD;
después hacer pruebas persistidas con registros ficticios identificados en la
base real. No se inventa compensación de deuda/crédito, conversión FX, renovación
de planes ni política fiscal. Los botones locales de administración pendientes
(B.2), personal, exportaciones e importación general siguen en el plan de producto;
esta reparación no certifica toda la plataforma.

## 5. Salida real de validación de esta entrega

```text
npm run typecheck
> tsc --noEmit
(exit 0)

npm run lint
✖ 10 problems (0 errors, 10 warnings)
(exit 0; advertencias preexistentes, no silenciadas)

npm run build
✓ Compiled successfully
✓ Generating static pages using 1 worker (40/40)
(exit 0)

npm run test:auth
# tests 251
# pass 251
# fail 0
(exit 0)

npm run test:sql
🎉 Todo pasó
🎉 CRM: 48 comprobaciones pasaron
🎉 Compatibilidad CRM: 69 comprobaciones pasaron
(exit 0)

npm run test:layout
PASS: 96 casos (4 pantallas × 3 fixtures EJEMPLO × 8 anchos, 320–1280 px).
(exit 0)

npm run test:finance:rsc
✅ Next/RSC: Cuentas y Reportes prerenderizados con filas y vacíos, sin llamadas servidor→función cliente.
(exit 0)

npm run test:metadata
✅ /es y /en: idioma, canonical, OG/Twitter, PNG 1200×630 HTTP 200.
✅ Redirección heredada y 404 sin advertencia metadataBase.
(exit 0)

node scripts/build-sql.mjs --check
✅ Todo al día — 9 clases por semana.
(exit 0)
```

`npm audit` informa 5 entradas high en la cadena de desarrollo de ESLint
(`braces`/`micromatch`/`fast-glob`/plugin/config Next). El aviso de braces afecta
hasta 3.0.3 y la herramienta propone degradar eslint-config-next a 14.2.35.
No se aplica `audit fix --force` ni esa degradación incompatible. No son cinco
vulnerabilidades nuevas del navegador ni una certificación de seguridad total;
queda seguimiento del aviso y de una actualización compatible.

No se ejecutó SQL remoto, no se registraron cobros/gastos reales, no se borraron
datos y no se mergeó el PR.
