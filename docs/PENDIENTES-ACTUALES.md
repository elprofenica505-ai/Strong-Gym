# Strong Gym — Ruta única y pendientes actuales

Actualizada: 24 de octubre de 2026. PR #1 a #40 fusionados en `main`
(base vigente `1e493a9`, merge del PR #40); CI en verde y producción en Vercel
con ese mismo commit. Las secciones con fecha al final («Actualización …»)
reemplazan las marcas anteriores donde haya diferencia: si dos casillas se
contradicen, vale la de fecha más nueva. Esta lista separa construir de
verificar: no asigna un porcentaje inventado ni certifica toda la plataforma.

## 1. Base funcional conservada: no volver a empezar

Comprobado con las capturas previas del usuario: ficha de prueba Carlicheta,
recepción manual, rechazo de segunda entrada del día, reserva/cancelación propias,
cobro NIO10, gasto NIO4, cobro USD1 y recorrido de deuda NIO100 → abonos40+20+40 →0.
Últimos dos abonos con recibido100/vueltos80 y60; Caja final NIO106, cuentas por
cobrar0 y créditos intactos. No repetir esos cargos/abonos ni reinstalar00028/29.
Esto acredita esos recorridos, no cada módulo, moneda, rol o fallo de red posible.

## 1B. En espera: no hacer hasta hablar con el dueño y confirmar pago

Estos pendientes dependen de una decisión del dueño, de un dato que sólo él puede dar
o de un servicio de pago. No se ejecutan mientras tanto. Se retoman cuando el usuario lo indique.

- [ ] Correo propio del gimnasio: remitente, dominio y proveedor SMTP reales. Requiere datos del dueño y autorización expresa.
- [ ] Prueba de recuperación de contraseña con correo real desde la dirección principal (hay que esperar la hora de límite del proyecto).
- [ ] Sesiones con tiempo límite e inactividad en Supabase: requiere plan Pro (pago).
- [ ] Verificador antispam externo (tipo Turnstile): requiere cuenta externa y decisión.
- [ ] Política de contenido (CSP): probarla en modo informativo antes de activarla.
- [ ] Dueño como segundo administrador: requiere su correo y autorización escrita, y que la app esté lista.
- [x] Cierre por inactividad (18 oct, rama arena/985edb39): sólo administrador cierra sesión tras 2 horas sin actividad (personal confirmado sin cierre automático); clientes no se cierran solos (sólo cierre manual). Pruebas en tests/session-policy.test.mjs. Pendiente: verificar en navegador real.
- [~] Roles de caja y entrenador. Fase A aplicada (00033). Fase B lista en código y SQL 00034 probada localmente (58/58), pendiente de autorización para aplicar en Supabase. Pendiente de UI: panel de asignación de roles y vista del entrenador (requieren aprobar dónde van en el menú). Fase C (anulación) sin empezar. Ver docs/ROLES-MIGRACION-PLAN.md.
- [ ] Llave de acceso (huella o rostro): cuando Supabase la saque de versión experimental.
- [ ] Cuenta de prueba de cliente (`baltodano19932025@gmail.com`): sólo recibe correos si se agrega como miembro del equipo o si hay correo propio; no se creó.

Ya quedó hecho en esta misma etapa (sin pendientes de pago): MFA del personal, verificación en dos pasos de la cuenta Supabase, 00031 y 00032, antispam básico, cabeceras HSTS y Permissions-Policy, revisión de bundle y secretos, alcance de la app instalada.

## 2. Una sola secuencia de trabajo

### Etapa 1 — Proteger lo construido (ACTUAL)

- [x] Consultar estructura y permisos reales de Supabase, sin leer filas comerciales.
- [x] Preparar corrección de perfiles, vistas financieras y cuentas/RPC;147 pruebas
  locales adicionales en dos estructuras, sin reconstruir la aplicación.
- [x] Aplicar y verificar incremental00030 en Supabase con autorización específica.
- [x] Usuario reportó pantallas normales tras00030. Es prueba de humo visual,
  no auditoría completa ni nueva prueba de pagos.
  [Detalle y evidencia de Seguridad 1A](SEGURIDAD-ACCESOS.md).
- [x] Construir y probar aislamiento demo/producción y eliminación de contraseñas
  demo guardadas: [Seguridad1B](DEMO-PRODUCCION.md). PR12 mergeado con autorización.
- [x] Usuario confirmó ingreso/Clientes/Caja/Reportes tras publicar1B. Sólo prueba de humo, no todos los permisos.
- [x] Construir recuperación PKCE/redirects/validación de contraseñas/logout explícito:
  [Seguridad1C](AUTH-RECUPERACION.md). Pendiente de merge autorizado y correo real.
- [x] Revisar allowlist/templates/SMTP real en sólo lectura: destinos/templates compatibles;
  [SMTP propio no configurado](REVISION-CORREO-AUTH.md), límite integrado2/h. Sin cambios remotos.
- [ ] Confirmar remitente/dominio/proveedor con el usuario, configurar envío con autorización
  y aceptar recuperación por correo real después de publicar. No listo aún para entrega general.
- [ ] Revisar secretos, historial/bundles/variables y exclusiones de archivos env.
- [ ] Auth: contraseñas, recuperación, confirmación/redirects, sesiones y MFA admin
  sin bloquear al administrador; no sustituir Auth editando profiles.
- [ ] Revisar restante de RLS/RPC, políticas de Storage/Realtime si se usan, abuso,
  límites, CSRF y cabeceras. Seguridad se prueba en cada entrega, no sólo al final.

### Etapa 2 — Ordenar navegación

- [ ] Inicio, Clientes, Agenda, Finanzas (Caja/gastos/cuentas), Personal, Reportes,
  Configuración; accesos directos y menú móvil. Mantener oscuro/rojo.
- [ ] Cada sección localizable y adecuada al rol; no duplicar/reconstruir operaciones.
  Todavía no se implementó el rediseño ni se considera aprobado por capturas antiguas.

### Etapa 3 — Completar operación diaria

- [ ] Ficha sin cuenta/correo/teléfono/QR con recorrido financiero conectado propio.
- [ ] Planes/vigencias/servicios y reglas comerciales pendientes explícitas; no inventar
  descuentos por etiquetas, bloqueos por deuda ni renovaciones por cualquier cobro.
- [ ] Reservas/cupos/horarios; cerrar asistencia, inasistencia y cancelación administrativa.
- [ ] Hacer persistentes mensajes leídos/no leídos y activación/reactivación de disciplinas.
- [ ] QR opcional/cámara/reemplazo en dispositivo real; búsqueda manual siempre.
- [ ] Revisar actualización de «Hoy»/horarios con Managua en páginas abiertas.

### Etapa 4 — Gestión y finanzas completas

- [ ] Personal: alta/edición/desactivación/asignación, responsabilidades, auditoría y roles.
- [ ] Extender recibido/vuelto a cobros por servicio: hoy está comprobado en abonos.
- [ ] Verificar deuda/abonos/vuelto USD sin alterar NIO; no repetir simple cobro USD1.
- [ ] Cierres/conciliación, cuentas/transferencias y reglas de reversión/devolución/crédito
  por definir y construir cuando corresponda, nunca simular con DELETE.
- [ ] Reportes coherentes, filtros y exportación completa/autorizada, no sólo últimos40/50.
- [ ] Importación validada: archivo pequeño, duplicados, errores y reintentos. Excel
  requiere importación propia; no considerar que CSV admite cualquier .xlsx o saldos.
- [ ] Comprobantes PDF en celular; recibos internos no fiscales, monedas separadas,
  FX manual y comisiones separadas, sin conversión/neteo automático.

### Etapa 5 — Aceptación integral

- [ ] Recorrido conectado con ficticios identificados: alta → plan/vigencia → reserva/
  entrada → cobro/abono → gasto → reporte/exportación.
- [ ] Admin/personal/cliente/anónimo y clientes A/B por API/base; revocación de rol,
  doble clic, respuesta perdida, red/sesión expirada y concurrencia sin duplicar cobros.
- [ ] Navegación/errores/recarga en celular y escritorio, textos públicos ES/EN, enlaces
  y formularios antispam; confirmar precios/contacto/horarios con el dueño.
- [ ] Cerrar vulnerabilidades importantes conocidas, dependencias, cabeceras/cookies,
  certificado TLS válido/renovación/HTTP→HTTPS/sin contenido mixto del dominio final.
- [ ] Respaldo y restauración ensayados, recuperación de acceso y guía de incidentes.
- [ ] Demostración y aprobación del dueño, con resultados y límites documentados.

### Etapa 6 — Entrega al dueño (NO ejecutar ahora)

- [ ] Inventario/preview de ficticios y relaciones, respaldo y aprobación de limpieza.
- [ ] Eliminar sólo ficticios autorizados; conservar tablas/módulos/funciones/políticas.
- [ ] Carga real manual/importación y cuatro saldos explícitos conciliados por cliente;
  no reconstruir deuda de cobros históricos ni asumir ausencia de fila como cero.
- [ ] Crear/verificar acceso del dueño ANTES de retirar administrador temporal.
- [ ] Verificar operación con datos reales, entregar manual y mantenimiento.

## 3. Forma de avanzar

Cada entrega explica qué cambió, prueba real, qué queda y siguiente paso. Conservar
pruebas/operaciones ya aprobadas como regresión; no pedir repetirlas sin motivo.
No hacer nuevos merges sin autorización. Merge no ejecuta SQL ni equivale a entrega.
El agente resuelve detalles técnicos; al usuario se piden sólo pruebas guiadas,
reglas comerciales o autorizaciones necesarias. Nunca claves/contraseñas por chat.

Inventario/ventas, mantenimiento, campañas, nómina y facturación fiscal son ampliaciones
con alcance/reglas propios; no abrirlas antes de cerrar lo comprometido salvo decisión
explícita. No afirmar seguridad absoluta ni certificación externa por tener HTTPS.

## Actualización 18 oct 2026 (rama arena/764b16e9-strong-gym)

- [x] MFA obligatorio para personal: PR #14 mergeado (`3cc754c`) y SQL 00031 aplicado en Supabase.
- [x] Prueba manual: ingreso con código de app y datos sin cambios.
- [x] Activar verificación en dos pasos en la cuenta de Supabase (panel). Verificado en sólo lectura: mfa_enabled = true.
- [ ] Correo del gimnasio (remitente real y dominio). En espera del dato del usuario; bloquea los pasos de recuperación con correo real.
- [ ] Recuperación con correo real: sólo después de tener remitente. Cuenta de prueba de cliente: `baltodano19932025@gmail.com`, que no es miembro del equipo de Supabase; no recibe correos del servicio integrado.
- [ ] Dueño como segundo administrador: sólo con correo del dueño y autorización escrita, cuando la aplicación esté lista.
- [x] Revisión de secretos en código e historial (sólo lectura): sin claves reales; `.env` ignorado; sólo ejemplos y nombres en documentación/pruebas. Falta revisar el bundle compilado en el build de producción.
- [x] HALLAZGO 18 oct: 22 políticas usan is_staff() sin aal2. Corregido con 00032 (aplicado y verificado: is_staff exige aal2; anon no ejecuta is_staff).
- [x] HALLAZGO 18 oct: anon y authenticated tenían TRUNCATE/REFERENCES/TRIGGER en 12 tablas. Quitado con 00032 (verificado: 0 tablas con permiso sobrante).
- [x] Revisión del bundle de producción (18 oct, `next build` local): sin claves secretas; sólo variables públicas esperadas (URL, clave pública, URL del sitio, interruptor demo); sin mapas de código fuente publicados. El único coincidencia es una regla de validación, no un valor.
- [x] Revisado: profiles sólo permite actualizar full_name y phone (no el rol). Políticas públicas de clases, planes, horarios, mensajes y suscripciones son de intención pública; falta antispam (paso 16).
- [x] Antispam básico en contacto y suscripción (18 oct): límite de 5 envíos por IP cada 10 min (en memoria por instancia) y campo trampa en ambos formularios; el campo trampa responde OK sin guardar. Pruebas en tests/antispam.test.mjs.
- [ ] Antispam fuerte (opcional, requiere decisión y cuenta externa): verificador tipo Turnstile. Límite actual es parcial.
- [x] Prueba en navegador tras 00032 (landing sin cuenta y panel con código): confirmada por el usuario.
- [ ] Recuperación por correo: el enlace abre la app instalada (alcance del manifiesto era "/"). Corrección en rama: alcance "/es" (commit de manifest.ts). Requiere merge y despliegue con autorización; después, reinstalar o abrir la app para que tome el nuevo alcance.
- [x] Cabeceras (18 oct, rama arena/45b6501d): añadidas Strict-Transport-Security (1 año) y Permissions-Policy (cámara sólo para el sitio, para el lector de QR). Verificadas en build de producción local.
- [ ] Política de contenido (CSP): pendiente; requiere probarla en modo informativo antes de activarla, para no romper páginas.
- [ ] Llave de acceso (huella/rostro): cuando Supabase la saque de versión experimental.

## Organización del panel de gestión (18 oct 2026)
- [x] Módulos: Inicio (resumen y gráficos), Clientes, Finanzas (caja, cuentas, gastos, reportes), Operación (reservas, mensajes, clases) y Administración (personal y roles, importar, herramientas, guía).
- [x] Menú de módulos por rol: administrador ve todo; caja ve finanzas, clientes y operación; entrenador sin módulos por ahora.
- [x] Gráficos de barras con datos reales; si una lectura falla se muestra "no disponible", nunca cero.
- [x] Pantalla de personal y roles (sólo administrador con MFA), conectada a admin_set_role.
- [x] Revisión visual en navegador real de las páginas nuevas (hecha el 23 oct en demo local con Chromium, ver «Actualización 23 oct 2026»; quedan fuera solo las vistas que exigen sesión real de cliente).
- [x] Asignación entrenador-cliente en base de datos: SQL 00035 probado (59/59), con interruptor del administrador para búsqueda y pedidos del entrenador (desactivado por defecto). Aprobación sólo del administrador; caja registra pedidos.
- [x] Pantalla de administración: interruptor y pedidos de acceso (Administración > Entrenadores y accesos).
- [x] Vista del entrenador "Mis clientes" (clientes asignados con asistencia y pedido de acceso). Probada con cuenta real de entrenador el 23 oct 2026.
- [x] Aplicar 00034 y 00035 en Supabase (aplicadas con autorización del dueño; 00034 incluye quitar la política antigua de escritura de entrenadores para caja).
- [x] Aplicar 00034 en Supabase antes de desplegar este código (hecho: es la misma aplicación marcada en la línea anterior; esta casilla quedó duplicada).


- [x] Aplicar 00036 (personal no es cliente) en Supabase: aplicada (ver «Actualización 19 oct 2026»: 0 fichas de personal activas). Esta casilla era el paso previo a esa aplicación.
- [x] Cierre del día para caja (SQL 00037 aplicada en Supabase el 2026-10-19, interruptor apagado): interruptor en Accesos del administrador (apagado por defecto); caja ve sólo el cierre del día si está encendido. Prueba local 10/10. Limitación: RLS ya deja leer `transactions` a caja; un control fuerte requiere cambiar políticas (decisión aparte).

## Actualización 19 oct 2026 (rama arena/903ffcdc-strong-gym)

Estado al cierre de hoy. Reemplaza las marcas anteriores donde haya diferencia.

**Hecho y en `main`**
- [x] PR #17 (panel por módulos, asignación de entrenadores, personal separado de clientes), fusionado `8ea8762`.
- [x] PR #18 (reportes financieros y Excel maestro), fusionado `ea788ab`. Producción Vercel READY.
- [x] 00036 (personal no es cliente) aplicada en Supabase: 0 fichas de personal activas.

**Hecho en la rama (pendiente de llevar a `main` con autorización)**
- [x] 00037 aplicada en Supabase: interruptor "Cierre del día para caja" en Accesos, apagado por defecto. Verificado en base.
- [x] 00038 aplicada en Supabase: `finance_debt_report` acepta caja con aal2 (`crm_is_staff`). Corrige el error de la página de Caja (`FIN_DEBT_REPORT_P0001`) causado por 00034. Verificado en base: anon sin permiso.
- [x] Caja ve sólo el cierre del día en Reportes cuando el interruptor está encendido. Pruebas locales: página 8/8, 00037 10/10, Fase B 59/59.
- [x] Gráfico de finanzas: pestaña activa y etiqueta flotante legibles en modo oscuro (`--color-ink` es blanco en el tema oscuro). `test:auth` 573/573.

**Pendiente de prueba en navegador real**
- [ ] Caja: Reportes > Cierre del día con el interruptor encendido.
- [x] Vista "Mis clientes" con una cuenta de entrenador real (23 oct 2026).
- [ ] Cierre por inactividad de 2 horas (sólo administrador).
- [ ] Recuperación de contraseña en la app instalada.
- [ ] Gráfico de finanzas en celular tras el arreglo de contraste.

**Esperando al dueño (no ejecutar sin decisión o dato)**
- [ ] Correo propio del gimnasio (remitente, dominio y proveedor SMTP) y prueba de recuperación con correo real.
- [ ] Sesiones con tiempo límite en Supabase: requiere plan Pro.
- [ ] Verificador antispam externo tipo Turnstile.
- [ ] Política de contenido (CSP): probar en modo informativo antes de activar.
- [ ] Dueño como segundo administrador: requiere su correo y autorización escrita.
- [ ] Llave de acceso (huella o rostro) cuando Supabase la saque de versión experimental.
- [ ] Cuenta de prueba de cliente: requiere correo propio o ser miembro del equipo.
- [ ] Limpieza de datos de prueba: NO hacer todavía, por instrucción del dueño.

**Trabajo técnico pendiente**
- [ ] Roles: UI de asignación de roles, vista de entrenador completa y anulación controlada (Fase C).
- [ ] Revisión restante de RLS, Storage, abuso, CSRF y cabeceras.
- [ ] Rediseño de navegación por etapas (Inicio, Clientes, Agenda, Finanzas, Personal, Reportes, Configuración).
- [ ] Operación diaria: planes y vigencias, reservas y cupos, asistencia e inasistencia, mensajes leídos o no leídos, QR en dispositivo real, horarios en hora de Managua.
- [ ] Gestión: personal con auditoría, recibido y vuelto en todos los cobros, cierres y conciliación, reglas de reversión, importación validada, comprobantes PDF.
- [ ] Aceptación integral: recorrido completo con datos ficticios, pruebas por rol, doble clic y concurrencia, TLS, respaldo y restauración, guía de incidentes.

**Entrega al dueño (no ejecutar todavía)**
- [ ] Inventario y aprobación de limpieza de datos de prueba.
- [ ] Carga de datos reales y conciliación de los cuatro saldos por cliente.
- [ ] Cuenta del dueño verificada antes de retirar el administrador temporal.
- [ ] Demostración final y manual de uso.

## Actualización 23 oct 2026 (rama arena/27bc8286-strong-gym)

- [x] Lint: las 10 advertencias de `react-hooks/set-state-in-effect` se corrigieron de raíz (sin silenciarlas) y la regla quedó como error. Detalle: `docs/TAREA-LINT-REACT-HOOKS.md`.
- [x] `braces` (desarrollo): parche propio en `patches/braces+3.0.3.patch`, con `postinstall` y prueba de regresión en `tests/braces-depth.test.mjs`. Detalle: `docs/DECISIONES-SEGURIDAD.md`.
- [ ] Siguen pendientes, hasta hablar con el dueño: revisión legal de las descargas con datos personales y copia de seguridad semanal.
- [ ] Apariencia de demo y limpieza para la entrega: **aplazado por el dueño** el 23 oct («todavía lejos de la entrega»). Plan en tres fases en `docs/PENDIENTE-DEMO-Y-ENTREGA.md`. Faltan dos datos: si los entrenadores de la portada son reales y si se marca «PRUEBA» a los registros ficticios.
- [x] Cuenta real de entrenador («Entrenador 2»): rol asignado con bitácora, MFA verificado y recorrido completo asignación → pedido → aprobación → revocación → reasignación probado por el usuario y verificado en la base. Decisión del usuario: un cliente puede tener dos o más entrenadores; se mantiene así.
- [x] Revisión visual en navegador de las pantallas reescritas al corregir el lint (23 oct, modo demo local con Chromium): inicio con animaciones (59/59 visibles al recorrer), aviso de demo, horarios con cambio de semana y filtro por día, Mi cuenta sin sesión, puerta de Productos en demo y menú de celular OK; sin desborde horizontal. Se encontró y corrigió que el cierre del aviso de demo no persistía tras recargar (la limpieza de claves legadas `strong-gym:demo-*` también borraba la clave del aviso). **Siguen sin poder probarse en demo** la calculadora y el resumen del socio con sesión real: requieren una cuenta de cliente conectada.
- [x] Altura en la vista del propio cliente (24 oct): la migración 00054 agrega `ficha_height_cm` a la función `my_progress` (aplicada en producción y verificada: `authenticated` ejecuta, `anon` no), `getMyProgress` la mapea a `fichaHeightCm` y «Mi progreso» prefiere la altura de la ficha igual que el panel, con la última medición solo como respaldo. Así, una corrección del administrador se refleja al cliente sin esperar la próxima medición. Pruebas: unidad (`tests/my-progress.test.mjs`) y PGlite (sección 9 de `scripts/test-progress-sql.mjs`). De paso se reparó una fecha fija vencida en esa suite y se conectaron al CI las suites `test:roles`, `test:medidas` y `test:productos`, que existían pero no corrían.

## Actualización 24 oct 2026 — foto actual (reemplaza marcas anteriores en conflicto)

**Estado comprobado hoy (no de memoria):**

- Código: PR #1 a #40 fusionados en `main` (`1e493a9`); sin PR abiertos al iniciar esta actualización.
- CI de `main` en verde (corrida `40064327502`): tipos/build, base de datos (ya incluye `test:roles`, `test:medidas` y `test:productos`) y concurrencia PostgreSQL.
- Producción: Vercel `strong-gym` en READY con el commit `1e493a9` (alias `strong-gym-gamma.vercel.app`); Supabase `hcnuepdxmbsmlzdmvwhx` ACTIVE_HEALTHY.
- Base de datos: migraciones del repositorio 00001 a 00055; la última en el historial remoto es `menores_rutas_personal` (00055, versión remota `20261024190943`). La 00049 sigue aplicada pero registrada a mano (no volver a ejecutarla).

**Realizado y cerrado (resumen por área):**

- Seguridad/accesos: endurecimiento RLS/RPC, `crm_is_staff` con aal2, MFA de personal, token de sesión a 20 min, vista pública de entrenadores sin datos sensibles, lint en 0 con la regla de hooks como error y parche de `braces`.
- Roles: personal y roles (admin con MFA, bitácora), entrenadores y accesos (asignación directa, pedidos con aprobación, revocación), «Mis clientes» probado con cuenta real; regla aceptada: un cliente puede tener dos o más entrenadores.
- Cliente/progreso: altura única en ficha (00052), corrección solo admin con bitácora (00053), «Mi progreso» usando la altura de la ficha (00054), menores también bloqueados en guardar/aprobar por el personal (00055), personal sin botón «Reservar», voseo unificado en las vistas tocadas (quedan los textos legales en «usted» hasta la revisión legal).
- Calidad: CI reparado y suites SQL olvidadas conectadas; revisión visual en navegador de las pantallas reescritas (23 oct), con la corrección del aviso de demo que no persistía.
- Detalles de texto (esta actualización): «Intentá de nuevo» en los errores de Mi cuenta y del panel de progreso, tarjeta de Horarios que ya no repite el subtítulo, y guía en el estado vacío de entrenadores («Asigná el rol… desde Personal y roles»).

**Qué falta, en orden (sin mezclar con lo hecho):**

1. *Depende de una cuenta real de cliente (la crea el usuario):* probar con sesión real la calculadora de nutrición y el resumen del socio en Mi cuenta; no se pueden validar en modo demo.
2. *Depende de decisiones/datos del dueño (no ejecutar sin su palabra):* revisión legal (incluye textos legales y descargas con datos personales), copia de seguridad semanal automática, correo propio del gimnasio (remitente/dominio/SMTP) y prueba de recuperación, pagos/plan, segundo administrador, y la decisión Sheets A/B/C.
3. *Aplazado a propósito cerca de la entrega:* quitar apariencia demo, retirar código demo y limpiar datos ficticios (`docs/PENDIENTE-DEMO-Y-ENTREGA.md`); faltan dos datos: si los entrenadores de portada son reales y si se marca «PRUEBA» a los registros ficticios.
4. *Sigue en la ruta por etapas (secciones 2 a 6 de este documento):* lo no marcado de operación diaria, finanzas completas y aceptación integral se trabaja etapa por etapa, con inventario previo; no está «a medias» en una rama: no hay PR abiertos ni trabajo sin fusionar.

## Actualización 24 oct 2026 — Etapa 3, tanda 1 cerrada

- [x] Menores en rutas del personal: migración **00055** aplicada en producción (`menores_rutas_personal`, versión remota `20261024190943`). `nutrition_save` y `nutrition_approve` ahora devuelven `MINOR` si el cliente es menor y `NO_BIRTHDATE` si falta la fecha de nacimiento. `nutrition_get` sigue permitiendo al personal leer la ficha y la edad. Verificado con 170 comprobaciones en `npm run test:productos` y por consulta de solo lectura en producción.
- [ ] Siguiente tanda de la Etapa 3: interruptores separados de caja (arrancan apagados), sobre la tabla existente `staff_permissions`, con aplicación también en servidor/base de datos.
- [ ] Después: cierre automático del personal a los 15 minutos de inactividad, sobre la base existente de `session-policy.ts`.
