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
- Base de datos: migraciones del repositorio 00001 a 00056; la última en el historial remoto es `permisos_caja_separados` (00056, versión remota `20261024205844`). La 00049 sigue aplicada pero registrada a mano (no volver a ejecutarla).

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
- [x] Siguiente tanda de la Etapa 3: interruptores separados de caja (arrancan apagados), sobre la tabla existente `staff_permissions`, con aplicación también en servidor/base de datos. Cerrada en la tanda 2 de abajo.
- [ ] Después: cierre automático del personal a los 15 minutos de inactividad, sobre la base existente de `session-policy.ts`.

## Actualización 24 oct 2026 — Etapa 3, tanda 2 cerrada

- [x] Permisos separados de caja: migración **00056** aplicada en producción (`permisos_caja_separados`, versión remota `20261024205844`). Reutiliza `staff_permissions`; el cierre del día quedó como estaba (**encendido**) y los cinco permisos nuevos quedaron **apagados**: resultado mensual, gráficos financieros, saldos de cuentas del gimnasio, gastos (ver/registrar) y cuentas por cobrar.
- [x] Administración > Entrenadores y accesos muestra los seis interruptores por separado. Sirven para delegar solo lo necesario cuando caja reemplaza temporalmente al administrador; **no vencen solos**, hay que apagarlos al volver.
- [x] La regla se aplica en páginas/componentes, en las RPC financieras y en RLS directa de `bank_accounts`, `member_balances`, `client_debt_balances` y `client_debt_entries`. Caja conserva cobrar servicios, emitir comprobantes y registrar abonos desde la ficha; el permiso de cuentas por cobrar controla la lista consolidada y sus totales.
- [x] Verificación: 98 comprobaciones de Fase B con 00056, 685/685 en `npm run test:auth`, suites SQL/RSC/medidas/productos/metadata, tipos, lint y build; en producción se comprobaron las claves, `finance_debt_ready() = true` y las cuatro políticas restrictivas nuevas.
- [ ] Siguiente tanda de la Etapa 3: cierre automático del personal a los 15 minutos de inactividad.

## Actualización 24 oct 2026 — Recepción ordenada: pase del día

- [x] Migración **00057** aplicada en producción (`pase_del_dia_tarifa`, versión remota `20261025044906`). Agrega `plans.price_nio` como tarifa en córdobas, separada de `plans.price` (USD histórico): el pase del día quedó en **C$40** con `price = null` y Boxeo conserva **US$20** con `price_nio = null`. `crm_options()` ahora entrega `slug`, `period` y `price_nio`; el editor `admin_set_day_pass_price_nio(numeric)` solo lo puede usar un administrador con MFA. Verificado en producción: restricción de precio presente, `anon` sin ejecución y `authenticated` con ejecución sujeta a la comprobación interna de rol/MFA.
- [x] Flujo corto en Clientes y recepción: botón **«Cobrar pase del día»** al inicio de la ficha, cobro visible antes del resumen financiero y sin el formulario duplicado de abajo. Reutiliza el alta rápida, `MovementForm`, su intento idempotente y el registro manual/QR ya existentes. Precarga monto y concepto, mantiene la elección explícita de método, cuenta y tasa, y trae marcada la casilla **«Registrar entrada ahora al confirmarse el cobro»**. La entrada solo se intenta después de un cobro confirmado; si ya había visita hoy no se duplica, y si la entrada no se confirma tras pagar, el aviso dice que **no se repita el cobro**.
- [x] Administración > **Tarifas** permite cambiar el precio en C$ o quitar la tarifa rápida. La web muestra la tarifa NIO cuando existe y conserva el precio USD histórico cuando no hay tarifa NIO válida. Desde Caja, el acceso principal ahora dice «Cobrar o registrar entrada · buscar cliente».
- [x] Verificación local de esta tanda: pruebas SQL por rol con 00057 (admin con MFA sí; caja, admin sin MFA y visitante no; importes inválidos rechazados; `NULL` quita la tarifa), cuatro casos de recepción en `tests/crm-panel.test.mjs`, preset/`onSuccess` en `tests/finance-write-form.test.mjs`, 691/691 en `npm run test:auth`, además de tipos, lint, build, metadata, RSC financiero, SQL, medidas y productos. La prueba local de concurrencia financiera no arrancó por faltar `TEST_POSTGRES_URL` en este entorno; debe verse en CI.
- [ ] Al publicar esta tanda queda la **prueba guiada del usuario desde el celular**: administrador ve/cambia la tarifa, caja cobra un pase y ve la entrada, desmarcar la casilla cobra sin registrar entrada y un cliente que ya entró hoy no genera otra visita. No crear cobros de prueba en producción sin coordinarlo.
- [ ] La inactividad automática de 15 minutos sigue aprobada y queda para la siguiente tanda.

## Actualización oct 2026 — Tarifas completas de pesas y máquinas

- [x] Migración **00058** aplicada en producción (`tarifas_gimnasio_nio`, versión remota `20261025061632`). Reutiliza `plans.price_nio` y permite el periodo `fortnight`: **Día C$40, Semana C$150, Quincena C$280 y Mes C$560**. Semana y Quincena se crearon solo si faltaban; Mes solo se completó si su tarifa NIO estaba vacía. El orden público es Boxeo, Día, Semana, Quincena y Mes. Boxeo sigue aparte con **US$20** en `plans.price` y `price_nio = null`.
- [x] Administración > **Tarifas** muestra los cuatro editores de pesas y máquinas. La API y `admin_set_plan_price_nio(text, numeric)` solo aceptan esos cuatro `slug` con su periodo correcto y exigen administrador con MFA; `NULL` quita solo la tarifa rápida elegida, sin borrar el plan ni cobros anteriores. En producción se verificó que `anon` no puede ejecutar la función.
- [x] La web publica las tarifas NIO por visita, semana, quincena y mes. En Clientes y recepción hay botones rápidos para las cuatro tarifas válidas; reutilizan `MovementForm`, su idempotencia y el comprobante existente. Caja sigue eligiendo método, cuenta y tasa, y la entrada opcional solo se intenta tras confirmarse el cobro, sin duplicar una visita del día.
- [x] Alcance cerrado por decisión del dueño: cobrar Semana, Quincena o Mes **solo registra el pago; no activa, renueva ni calcula vigencia**. La pantalla lo avisa antes de confirmar el cobro. La vigencia automática requerirá otra tanda con reglas propias.
- [x] Verificación local: 29/29 en `tests/crm-panel.test.mjs`, 123 comprobaciones de Fase B dentro de `npm run test:roles`, 695/695 en `npm run test:auth`, además de tipos, lint, build, metadata, RSC financiero, SQL, medidas y productos. `npm run test:layout` no arrancó localmente por no estar instalado Chromium; queda cubierto por CI. La concurrencia financiera sigue siendo validación de CI con PostgreSQL desechable.
- [x] El usuario revisó la ficha y Caja desde el celular: le gustó el flujo y pidió que los controles principales no se vieran como texto plano. Las cuatro tarifas rápidas usan ahora el mismo botón rojo, «Solo confirmar entrada» usa un fondo sólido secundario, los accesos de la ficha tienen fondo táctil y el acceso de Caja es un botón grande rojo con ícono y flecha.
- [x] El ajuste visual de botones (PR #47) quedó publicado y el usuario confirmó desde el celular: «Listo todo pasó las pruebas».
- [ ] La prueba guiada con cobros reales se completa junto con la venta integrada de productos de la sección siguiente; no se confirman cobros ficticios en producción.
- [ ] Después de cerrar la venta integrada sigue la tanda aprobada de cierre automático del personal a los 15 minutos de inactividad.

## Actualización oct 2026 — Venta de productos desde la ficha

- [x] Flujo decidido con autorización del usuario: no hay venta anónima ni cliente genérico. Primero se busca o se crea la ficha con el alta rápida; desde esa ficha caja puede cobrar **servicio + productos** o **solo productos**. Con productos, todo el cobro es en **NIO**, con un solo método y una sola cuenta.
- [x] Migración **00059** aplicada en producción (`cobro_con_productos`, versión remota `20261025202029`). Agrega `finance_checkout_groups`, `product_sale_catalog()` y `finance_record_checkout(...)`. El catálogo de recepción solo devuelve productos activos con precio y stock, sin costo ni ganancia. Verificado tras aplicarla: `finance_writes_ready() = true`, `anon` no puede ejecutar las funciones nuevas, `authenticated` queda sujeto a la comprobación interna de rol/MFA y no cambió el conteo de movimientos existentes.
- [x] El cobro combinado es atómico e idempotente: la base bloquea los productos en orden, vuelve a comprobar estado, precio y stock, y registra un comprobante interno por el servicio y por cada producto. Si falta stock o cambió un precio, no queda registrado ni el servicio. Reintentar el mismo intento no duplica dinero ni existencias; usar la misma referencia con otro contenido devuelve conflicto.
- [x] `MovementForm` muestra buscador, precio, stock, cantidades, subtotales y total antes de confirmar. Permite dejar el servicio en cero solo cuando hay productos, conserva las líneas en un intento pendiente, limpia el carrito tras confirmar y enlaza todos los comprobantes. Si el catálogo no carga, el cobro solo por servicio sigue disponible, pero no se envía una venta con productos sin catálogo confirmado.
- [x] Las tarifas rápidas pueden sumar productos antes de confirmar; el total visible une tarifa y productos. La entrada automática solo se intenta después de un cobro confirmado que incluyó un servicio mayor que cero. Una venta solo de productos no registra entrada. Caja también enlaza a **Productos y stock** para crear productos, registrar compras y revisar existencias; ese módulo sigue siendo el lugar de mantenimiento del inventario.
- [x] Verificación local de esta tanda: 96/96 en formulario, API, CRM y reglas de productos; 703/703 en `npm run test:auth`; 188 comprobaciones en `npm run test:productos`; además pasaron roles, SQL financiero, RSC, tipos, lint, build y metadata.
- [x] Prueba real en producción confirmada por el usuario («Si funciona»): se creó el producto real **Agua fuente pura 600 ml** (costo C$18, precio C$24) con compra de 12 unidades y se vendió 1 desde la ficha; el stock bajó a 11. No se crearon productos ni ventas ficticias.

## Actualización 26 oct 2026 — Orden visual de Productos y de la ficha (migración 00060)

- [x] **Productos y stock en tarjetas:** la tabla ancha se reemplazó por tarjetas visuales alineadas: nombre arriba, categoría breve, foto completa sin recorte debajo y, al pie, precio de venta y unidades en stock (con aviso de stock bajo e inactivo). Hay botones **Ver productos** y **Categorías**, buscador y categorías con su cantidad; se muestran **25 por página** del resultado filtrado, con botones Anterior/Siguiente. Al tocar una tarjeta se abre la ficha completa del producto (categoría, costo, ganancia, alerta de stock y detalles) con las mismas acciones de siempre: Editar, Comprar, Vender y Ajustar stock. No cambió ninguna regla de inventario ni de dinero; pruebas en `tests/product-manager.test.mjs`.
- [x] **Ficha del cliente enfocada:** al abrir un cliente se ocultan el buscador, la lista y el personal; la ficha queda con «← Volver a clientes», «Actualizar ficha» y un encabezado compacto (número, nombre, categoría, estado, si ya entró hoy solo lectura desde las visitas y deuda si existe, teléfono y plan). Debajo va un menú de tarjetas y **cada tarjeta abre una pantalla propia a pantalla completa**, con desplazamiento interno y un encabezado fijo con «← Volver a la ficha», en este orden: Registrar entrada (tarifas rápidas y entrada manual), Cobrar un servicio, Vender productos, Deudas y abonos, Saldo e historial y Datos del cliente y carnet; al final quedan los enlaces a Progreso y medidas y a Asistencia. «Nuevo cliente» sigue junto al buscador. Ajuste posterior del mismo 26 oct, tras la revisión del usuario: las tarjetas ya no se despliegan en el mismo lugar empujando todo hacia abajo, y el enlace de Asistencia abre su **vista propia** (`?vista=asistencia`) con solo las visitas por día, semana y mes, sin cargar Medidas; los enlaces antiguos con `#asistencia` conservan el salto de apoyo (`HashScroll`).
- [x] Es el **mismo formulario seguro de siempre** el que se muestra según el módulo (`MovementForm`/`PaymentForm` con sus mismas claves de intento): si quedó un cobro o una operación de deuda sin confirmar, su módulo se abre solo al entrar a la ficha y, si la persona cambia de módulo, queda un aviso visible arriba con botón «Revisar intento pendiente». No cambió ninguna regla de cobro, stock, deuda, asistencia ni permisos.
- [x] Historiales resumidos: entradas e ingresos muestran las primeras 5 y el resto se despliega a pedido («Ver las N entradas» / «Ver los demás ingresos»). El catálogo para cobrar usa tarjetas compactas y adaptables —nombre, categoría, foto completa sin recorte, precio, disponibles y cantidad al pie— con botones **Ver productos** y **Categorías**, buscador y **25 tarjetas por página**; cambiar de página o de categoría no pierde los productos ya elegidos ni su resumen.
- [x] Migración **00060** aplicada en producción (`catalogo_venta_con_imagen`, versión remota `20261026034707`): el catálogo de recepción además devuelve la foto del producto; sigue sin exponer costo ni ganancia y `anon` no puede ejecutarlo. El esquema del cliente acepta respuestas anteriores sin la clave (`.default(null)`), así que el orden de despliegue no rompe nada.
- [x] Verificación local de esta tanda: 30/30 en `tests/crm-panel.test.mjs` (adaptadas a abrir módulos y volver al listado), 3/3 en `tests/product-manager.test.mjs`, 706/706 en `npm run test:auth`, 191 comprobaciones en `npm run test:productos`, además de roles, SQL, RSC financiero, tipos, lint, build y metadata. `npm run test:layout` no arrancó localmente por falta de Chromium; queda cubierto por CI. Con el ajuste a vistas por tarjeta: 31/31 en `tests/crm-panel.test.mjs` (incluye la navegación tarjeta → vista → volver y el destino de Asistencia) y 707/707 en `npm run test:auth`. Con el rediseño de los catálogos: 23/23 entre `tests/finance-write-form.test.mjs` y `tests/product-manager.test.mjs` (paginación de 25 y filtros por categoría/búsqueda), 709/709 en `npm run test:auth`, 191 comprobaciones en `npm run test:productos`, y tipos, lint, build y metadata en verde.
- [ ] Prueba guiada desde el celular de la nueva presentación: abrir Productos y stock (tarjetas, paginación, entrar y volver de una ficha de producto) y una ficha de cliente (volver al listado, abrir cada módulo, cobrar una tarifa, vender solo un producto, revisar saldo e historial). Entrenador y cliente no deben ver el catálogo de venta ni registrar estos cobros.
- [ ] Siguiente tanda aprobada: cierre automático del personal a los 15 minutos de inactividad.
