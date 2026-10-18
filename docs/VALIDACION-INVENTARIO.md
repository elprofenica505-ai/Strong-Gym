# Validación técnica del inventario inicial

Fecha: 2026-10-17. Base de código: `9910268`, rama
`arena/9bdd978c-strong-gym`, PR #10 sin merge.

## 1. Cambios de esta entrega

- Plan de producto, criterios de terminado y transición de pruebas a datos reales.
- Inventario inicial de módulos/acciones, bloqueantes con fuentes e índice de rutas.
- Enlaces en README para no confundir la descripción histórica con el alcance real.
- No se modificó código de aplicación, migraciones, seeds, permisos ni datos.
- No se agregaron tests funcionales: se volvió a ejecutar la suite existente como
  línea base. No cubre todavía todos los pendientes encontrados.

## 2. Salida real de comandos

Todos se ejecutaron secuencialmente sobre el repositorio. Logs completos de esta
sesión: `/home/user/inventario-*.log` (fuera del repositorio; no son archivos de
la entrega ni contienen credenciales). Extractos relevantes:

### `npm run typecheck` — exit 0

```text
> strong-gym@1.0.0 typecheck
> tsc --noEmit
```

### `npm run lint` — exit 0

```text
✖ 10 problems (0 errors, 10 warnings)
```

Persisten los 10 avisos ya presentes; no se ocultan ni se presentan como cero
advertencias. En esta entrega no se cambió código para resolverlos.

### `npm run test:auth` — exit 0

```text
1..131
# tests 131
# suites 0
# pass 131
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

El nombre histórico del comando incluye actualmente tests de auth, CRM,
finanzas, render, proxy, service worker y URLs; no significa 131 E2E remotos.

### `npm run test:finance:rsc` — exit 0

```text
✅ Next/RSC: Cuentas y Reportes prerenderizados con filas y vacíos, sin llamadas servidor→función cliente.
```

Cuatro casos con builds Next reales y datos/fronteras controlados: Cuentas y
Reportes, cada uno con filas y vacío. No es Supabase remoto.

### `npm run build` — exit 0

```text
✓ Compiled successfully in 657ms
✓ Generating static pages using 1 worker (40/40) in 205ms
```

Sin advertencia `metadataBase`. Build con entorno local disponible, no sesión
remota de admin. Las 40 salidas del build no equivalen a 40 módulos funcionales.

### `npm run test:metadata` — exit 0

```text
✅ /es: idioma, canonical y OG/Twitter absolutos; PNG 1200×630 responde 200.
✅ /en: idioma, canonical y OG/Twitter absolutos; PNG 1200×630 responde 200.
✅ Enlace anterior /opengraph-image sigue funcionando mediante redirección por idioma.
✅ Ruta inexistente devuelve 404; sin advertencia de metadataBase en las solicitudes.
```

### `npm run test:sql` — exit 0

```text
🎉 Todo pasó
🎉 CRM: 48 comprobaciones pasaron
🎉 Compatibilidad CRM: 67 comprobaciones pasaron
```

El comando ejecuta `test-sql.mjs`, `test-crm-sql.mjs` y
`test-crm-compat-sql.mjs` en PostgreSQL/PGlite descartable. Instala y manipula
fixtures locales; **no ejecuta SQL sobre la base del usuario**. Verifica también
que los cobros incompatibles continúen rechazándose; no prueba un escritor nuevo.

### `node scripts/build-sql.mjs --check` — exit 0

```text
✅ Todo al día — 9 clases por semana.
```

Es verificación del generador, no actualización remota de horarios.

## 3. Límites y siguiente paso

No se comprobó en esta entrega cada botón en navegador conectado, cámara física,
impresión móvil, conciliación bancaria, cambio de administrador ni limpieza de
pruebas. No se afirma que esos pendientes ya estén resueltos por tener tests
verdes. El inventario revela específicamente acciones sin persistencia que la
suite anterior no detecta.

Siguiente bloque de implementación: B.1 del inventario (lecturas conectadas sin
fallback ficticio ni vacíos/éxitos falsos), después persistencia administrativa y
protección del reset legado. Las escrituras financieras requieren su adaptación
y reglas explícitas antes de sustituir el bloqueo protector.
