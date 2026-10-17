# Inventario funcional inicial — Strong Gym

## 1. Alcance y evidencia

Revisión de código del 2026-10-17 sobre `9910268` (PR #10 abierto). Esta entrega
agrega documentación, no implementa las reparaciones descritas abajo.

**No es una certificación de cada botón en producción.** No hubo acceso nuevo a
la sesión del administrador ni escrituras/lecturas directas de su Supabase.
Se revisaron rutas, componentes, APIs, funciones SQL del repositorio, pruebas e
historial documentado. Las capturas anteriores comprueban sólo los casos visibles.
Las políticas y esquema reales pueden diferir del instalador del repositorio.

Estados:

- **Implementado / verificar:** hay conexión o lógica real; falta completar el
  recorrido conectado y sus casos adversos para darlo por terminado.
- **Sólo visual:** cambia estado React; no hay escritura persistente en esa acción.
- **Parcial:** existe una parte, no el recorrido completo.
- **Bloqueado:** guard protector actual; no se cuenta como función entregada.
- **Pendiente:** no se encontró interfaz/flujo administrativo completo para ello.
- **Riesgo:** comportamiento que debe corregirse antes de presentar/operar.

P0 = bloqueante de confianza/seguridad/persistencia; P1 = operación esencial;
P2 = completar producto/control. No son fechas ni porcentajes de avance.

## 2. Hallazgos bloqueantes con evidencia

| ID | Prioridad | Hallazgo | Fuente concreta | Aceptación de la corrección |
|---|---|---|---|---|
| B01 | P0 | Asistencia, inasistencia y cancelación desde Panel sólo cambian `bookingStatuses` con `setBookingStatuses`. No llaman al backend. | `src/components/admin/admin-panel.tsx`, botones de reservas | Guardar con permiso staff/admin, validar transición/cupo, recargar y verificar otra sesión. Un fallo debe mantener el estado anterior e informar error. No confundir con cancelar reserva propia, que sí usa RPC. |
| B02 | P0 | Marcar consulta como leída/no leída sólo actualiza `readMessages`. | Mismo componente, pestaña mensajes | Persistir `messages.is_read`; comprobar permiso, error y estado tras recarga. No implica enviar respuesta por correo. |
| B03 | P0 | Activar/desactivar disciplina sólo cambia `classActive`. Además el panel carga `getClasses()`, que filtra activas: no ofrece un inventario completo para reactivar las inactivas. | Mismo componente, pestaña clases; `src/lib/data/queries.ts:getClasses`; `src/app/[locale]/panel/page.tsx` | Listar activas/inactivas para administración, guardar con autorización y definir efecto sobre sesiones/reservas existentes antes de aplicar cambios. |
| B04 | P0 | Clases, planes y entrenadores retornan ejemplos si la consulta falla **o devuelve lista vacía**. Las sesiones generan grilla ficticia ante error conectado. | `src/lib/data/queries.ts:getClasses/getCoaches/getPlans/getSessionsForWeek` | Demo local explícita sólo sin configurar; conectado: vacío válido o error visible. Desactivar todo no debe hacer reaparecer ejemplos. |
| B05 | P0 | Fallo al leer ocupación se trata como cero; errores de reservas/mensajes se convierten en listas vacías; el conteo de clientes puede caer a cero por error. | `queries.ts:getSessionsForWeek/getMyBookings/getBookedSessionIds/getAllBookings/getContactMessages/countMembers` | Diferenciar error de vacío/cero; no anunciar cupos o ausencia de reservas sin lectura válida. El control SQL de cupo no sustituye la información correcta. |
| B06 | P0 | Reset permite staff, selecciona entrenadores por tres IDs fijos, ignora errores de múltiples borrados y devuelve `ok:true` sin atomicidad. No cubre el conjunto CRM/financiero actual. | `src/app/api/admin/reset/route.ts`; `src/components/admin/import-tools.tsx:ResetTool` | Retirar/inhabilitar el procedimiento inseguro de forma explícita y preparar limpieza final revisada, con identificación de pruebas, respaldo, dependencias, control de errores y verificación de saldos. No ejecutar este reset para entregar el negocio. |
| B07 | P0 | Contacto/newsletter pueden responder éxito demo si no se obtiene cliente Supabase, incluso con configuración presente. La actualización de perfil sin configurar también responde éxito demo. | `src/app/api/contact/route.ts`, `newsletter/route.ts`, `account/route.ts` | Modo local inequívoco; fallo conectado no es envío/guardado exitoso. Verificar que UI respete ese contrato. |
| B08 | P0 | Cobros del esquema real `bank_accounts_split` siguen protegidos; quitar el guard sin un escritor compatible reproduciría el riesgo financiero. | `supabase/migrations/00022_crm_finance_compat.sql:crm_record_payment`; `00023_finance_read_bank_accounts.sql`; API CRM | Implementar un escritor seguro para el esquema confirmado, con reglas aceptadas, permisos SQL, atomicidad, misma moneda e idempotencia. Mientras tanto conservar bloqueo. |

## 3. Inventario por módulo y acción

Rutas de páginas bajo `/es` y `/en`. Los enlaces/navegación y controles puramente
visuales (pestañas, filtros, mostrar contraseña, modal) no requieren escritura;
una operación comercial sí. Se agrupan controles repetidos por acción.

### Sitio público y cuenta

| ID | Acción / pantalla | Estado observado | Fuente / trabajo de aceptación |
|---|---|---|---|
| PUB01 | Landing, idiomas, navegación, precios, entrenadores y disciplinas | Implementado / verificar; B04 | `src/app/[locale]/page.tsx`, `src/components/sections/`, diccionarios. Revisar enlaces, móvil, contenido vigente y origen real; ausencia válida sin ejemplos sorpresa. |
| PUB02 | WhatsApp, teléfono, correo, mapa y redes | Implementado / verificar | `src/components/sections/contact.tsx`, layout y `src/config/site.ts`. Comprobar destinos reales con el dueño; son enlaces, no conversaciones guardadas. |
| PUB03 | Contacto: validar y enviar consulta | Implementado / verificar; B07 | `sections/contact-form.tsx`, `/api/contact`. Comprobar guardado en `messages`, error, antispam y visualización en Panel; no promete envío de email. |
| PUB04 | Suscripción a novedades | Parcial; B07 | `layout/newsletter-form.tsx`, `/api/newsletter`. Guarda suscripción con upsert; no hay módulo de campañas/envío entregado. |
| PUB05 | SEO e imagen al compartir ES/EN | Prueba HTTP local existente / verificar publicación | `docs/METADATOS.md`, `scripts/test-metadata.mjs`. Build y HTTP local no prueban caché de redes sociales. |
| ACC01 | Registro, ingreso y salida | Implementado / verificar | `auth/auth-form.tsx`, `providers/app-provider.tsx`, Supabase Auth. Probar confirmación de correo si está configurada, sesión expirada y roles sin escalada. |
| ACC02 | Editar nombre/teléfono propio | Implementado / verificar; B07 | `account/account-dashboard.tsx`, `/api/account`. Recarga, errores y límites; no cambia roles. |
| ACC03 | Ver/cancelar reservas propias | Implementado / verificar; B05 | Dashboard, `/api/bookings`, `book_session/cancel_booking`. Probar propiedad, plazo, cupo y respuesta perdida. |
| ACC04 | Ver carnet QR propio | Implementado / verificar | `/api/account/pass`, `crm_my_pass`. Sólo carnet propio, sin directorio ni cobros. |
| ACC05 | Recuperación de contraseña y cambio de correo/admin | Pendiente de flujo completo verificado | No se encontró pantalla dedicada de recuperación/entrega del admin entre las rutas actuales. Diseñar retorno seguro y procedimiento de entrega; no editar emails de `profiles` como sustituto de Auth. |

### Reservas, clases y recepción

| ID | Acción / pantalla | Estado observado | Fuente / trabajo de aceptación |
|---|---|---|---|
| OPE01 | Semana anterior/siguiente/actual, filtro y detalle de clase | Implementado / verificar; B04/B05 | `schedule/schedule-board.tsx`, `/api/sessions`. Vacío real, error, fecha Managua y ocupación válida. |
| OPE02 | Reservar/cancelar como cliente web | Implementado / verificar | `/api/bookings`, SQL `book_session/cancel_booking`. Ensayo conectado de último cupo concurrente, repetición, clase pasada/cancelada y cancelación fuera de plazo. |
| OPE03 | Atendido/ausente/cancelado desde Panel | Sólo visual; B01 | No usar como control real hasta guardar/validar en backend. |
| OPE04 | Activar/desactivar disciplina desde Panel | Sólo visual y listado parcial; B03 | Definir transición segura; no cancelar reservas en cascada por inventar una regla. |
| OPE05 | Crear/editar disciplina, sesión, horario, cupo, sala y entrenador | Pendiente de gestión completa | Existen tablas/RLS/generación SQL; no se encontró CRUD administrativo completo en las rutas actuales. Evitar sobreventa al reducir cupo y documentar efecto de cambios. |
| CRM01 | Buscar nombre/teléfono/número, etiqueta y paginación | Implementado / verificar | `crm/clients-panel.tsx`, `/api/admin/clients`, `crm_directory`. Recepción manual prioritaria; errores independientes; no buscar sólo por QR. |
| CRM02 | Alta sólo con nombre y confirmación de coincidencias | Implementado / verificar | Mismos archivos, `crm_create_client`. No crea cuenta Auth; homónimos requieren revisión, no prohibición automática. |
| CRM03 | Editar ficha, estado, etiqueta, plan y notas comerciales | Implementado / parcial | `crm_update_client`; etiqueta sólo admin. Campos adicionales importados no tienen editor completo; no convertir asignación de plan en renovación automática. |
| CRM04 | Confirmar entrada y reentrada del día | Implementado / evidencia previa de reentrada | `crm_check_in`; caso Hellen documentado en FASE2. Ampliar aceptación a activo/congelado, Managua, concurrencia y permisos; visita no equivale a asistencia de clase. |
| CRM05 | Escanear QR, buscar por token, detener cámara | Implementado / verificar dispositivo | `crm/qr-scanner.tsx`, `crm_find_card`. Permiso cámara real, salida de pantalla y búsqueda manual siempre. Escanear no registra entrada ni cobra. |
| CRM06 | Imprimir carnet / reemplazar QR | Implementado / verificar | `crm/client-card.tsx`, `crm_rotate_card`. Impresión móvil y rechazo del token antiguo. |
| CRM07 | Historial de visitas, pagos y eventos | Implementado / verificar | `crm_detail`, `clients-panel.tsx`. Límites de listado no equivalen a historial exportable completo. |
| CRM08 | Vincular ficha de recepción con cuenta web posterior | Pendiente | Arquitectura separada documentada en FASE2. Flujo verificado de vinculación/fusión; no unir por nombre/email automáticamente. |
| CRM09 | Vigencias, renovaciones y vencimientos | Pendiente | Plan asignado es dato comercial actual. Definir inicio/fin, congelación y efecto de un pago antes de automatizar. |

### Finanzas y control

| ID | Acción / pantalla | Estado observado | Fuente / trabajo de aceptación |
|---|---|---|---|
| FIN01 | Caja: resumen, cuentas, movimientos y filtros | Lectura implementada / capturas previas | `panel/caja/page.tsx`, `admin/cash-panel.tsx`, `lib/finance/`. Comprobar totales contra lote conocido; no inferir saldo inicial auditado. |
| FIN02 | Cobro desde ficha, confirmación y reintento | Bloqueado en esquema legado; B08 | Formulario/referencia sessionStorage existen; eso no entrega el escritor financiero compatible. Definir reglas y probar antes de habilitar. |
| FIN03 | Gastos: consultar categorías | Lectura implementada / capturas previas | `panel/gastos/page.tsx`. No es registro de gastos. |
| FIN04 | Crear gasto y afectar cuenta | Pendiente | La pantalla declara formulario no implementado. Requiere API/SQL, confirmación, idempotencia, permisos y reporte coherente. |
| FIN05 | Cuentas por cobrar y créditos por moneda | Lectura implementada / verificación parcial | `panel/cuentas/page.tsx`, lector legado. Captura vacía no prueba deuda real; no netear crédito/deuda ni ambas monedas. |
| FIN06 | Reportes: ingresos, egresos y métodos | Lectura implementada / prueba local de diseño | `panel/reportes/page.tsx`; tests RSC y reportes. Volumen no es ganancia; método desconocido explícito; falta conciliación conectada de un lote completo. |
| FIN07 | Cuentas: alta/edición, transferencias y conciliación | Pendiente de flujo administrativo completo | Hay estructuras financieras; no se encontró un CRUD/flujo integral de estas acciones en el panel actual. Transferencia no es ingreso ni gasto; monedas y cuentas distintas requieren regla explícita. |
| FIN08 | Apertura/cierre de caja y diferencias | Parcial en modelo / interfaz pendiente | `cash_registers` en SQL y resumen. Tener tabla no entrega cierre operativo, responsables, efectivo contado ni control de diferencias. |
| FIN09 | Comprobante interno y corrección/anulación | Pendiente de recorrido completo | No prometer factura fiscal por existir tablas `invoices`. Definir numeración, permisos, trazabilidad y reversión, sin borrar pagos reales. |
| FIN10 | Venta de productos e inventario | Mejora por definir | No se encontró módulo completo de productos/stock/POS. Separar cobro de membresía/servicio de inventario comercial. |

### Personal, herramientas y entrega

| ID | Acción / pantalla | Estado observado | Fuente / trabajo de aceptación |
|---|---|---|---|
| ADM01 | Guard de Panel, alias `/admin` y menú por rol | Implementado / pruebas y evidencia previas | `docs/PANEL-ADMIN.md`, `lib/auth`, proxy. Ampliar prueba conectada admin/staff/cliente/anónimo por acción. |
| ADM02 | Mensaje leído/no leído | Sólo visual; B02 | Panel obtiene mensajes reales pero no persiste este cambio. |
| ADM03 | Alta/edición/baja de personal y entrenadores | Pendiente de gestión completa | Tabla pública de entrenadores no equivale a trabajador con acceso ni nómina. Definir responsabilidades y datos sensibles antes del CRUD. |
| ADM04 | Gestionar roles y acceso del dueño | Parcial en permisos / flujo pendiente | SQL protege rol; no se encontró gestión visual completa ni transferencia de admin comprobada. No retirar acceso actual antes de verificar al dueño. |
| ADM05 | Auditoría de acciones importantes | Parcial | `client_events` cubre acciones CRM, no todo el sistema. Definir cobertura para dinero, reservas, personal y configuración. |
| DAT01 | Descargar plantilla, cargar CSV, mapear y previsualizar | Implementado / verificar casos límite | `admin/import-tools.tsx`, `panel/importar`. Revisar acentos, separadores, comillas, filas inválidas y límite de 500 del endpoint. No acepta automáticamente cualquier Excel. |
| DAT02 | Importar clientes sin crear cuentas web | Implementado / verificar | `/api/admin/import-members`, `crm_import_client`. Resultados parciales por fila, duplicados/reintentos y campos opcionales. No importa deuda, personal ni reservas. |
| DAT03 | Reset antiguo de clientes/gastos/entrenadores | Riesgo; B06 | No usar para limpieza integral ni para revertir operaciones. No es el SQL final solicitado. |
| DAT04 | Identificar todo el conjunto de prueba y limpiarlo al final | Pendiente | Sólo ciertas fichas tienen `is_demo`; no hay cobertura global de lotes. Diseñar según PLAN-PRODUCTO, sin marcar/borrar registros remotos por iniciativa propia. |
| DAT05 | Importar saldos/históricos reales y exportar datos | Pendiente de alcance/implementación completa | Preparar revisión de procedencia, moneda, duplicados, saldos de apertura y permisos. CSV de clientes no entrega estas funciones. |
| DAT06 | Ayuda y herramientas | Existentes / actualizar al completar | `panel/ayuda`, `panel/herramientas`, README. Corregir promesas heredadas de reset y finanzas conforme se implementen, no tratar la guía como evidencia funcional. |

## 4. Orden de ejecución de los próximos bloques

1. **B.1 — Confianza de lecturas:** B04/B05/B07; errores explícitos y cero/vacío
   legítimos, modo local separado, pruebas de regresión. Reutilizar el patrón de
   resultado explícito financiero sin cambiar consultas de dinero por accidente.
2. **B.2 — Acciones administrativas persistentes:** B01/B02/B03; APIs y permisos,
   transiciones seguras, estado pendiente/error y verificación tras recarga.
3. **Protección de limpieza:** B06; impedir que el reset legado aparente una
   limpieza segura; no reemplazarlo por otro borrado destructivo improvisado.
4. **B.3 — Completar operación:** edición de sesiones/horarios, recepción y planes,
   vinculación verificada y recorridos de cuenta según dependencias.
5. **C — Escrituras financieras:** confirmar reglas no acordadas y contrato del
   esquema real antes de nuevo SQL; cobro/gasto atómicos e idempotentes; saldos y
   reportes con lotes de prueba conocidos. No volver al escritor antiguo inseguro.
6. **D/E — Personal, seguridad y control:** gestión de acceso y configuración,
   auditoría, cierres, reportes y exportación, con matriz de permisos comprobada.
7. **F/G — Aceptación integral y transición:** demostrar al dueño antes de limpiar;
   respaldo, ensayo de limpieza, SQL revisado, importación y acceso del dueño.

No se habilitan escrituras financieras ni se eligen políticas comerciales con
este inventario. El objetivo aprobado es completarlas, no conservar el bloqueo
como producto final. No se pide autorización repetida para continuar el trabajo
local ya acordado; sí se separan decisiones comerciales y acciones remotas.

## 5. Evidencia técnica de esta revisión

Resultados de ejecución y límites: [VALIDACION-INVENTARIO.md](./VALIDACION-INVENTARIO.md).
Los tests automatizados no cubren aún todos los hallazgos de este documento;
que estén verdes no hace persistentes los botones que sólo usan estado local.

## 6. Cobertura de rutas del repositorio

Índice estático; que una ruta exista no implica aceptación funcional. Las páginas
localizadas aplican a ES/EN; `/admin` es alias, no un segundo panel independiente.

### Páginas

- `/[locale]/admin` — `src/app/[locale]/admin/page.tsx`
- `/[locale]/horarios` — `src/app/[locale]/horarios/page.tsx`
- `/[locale]/ingresar` — `src/app/[locale]/ingresar/page.tsx`
- `/[locale]/mi-cuenta` — `src/app/[locale]/mi-cuenta/page.tsx`
- `/[locale]/offline` — `src/app/[locale]/offline/page.tsx`
- `/[locale]` — `src/app/[locale]/page.tsx`
- `/[locale]/panel/ayuda` — `src/app/[locale]/panel/ayuda/page.tsx`
- `/[locale]/panel/caja` — `src/app/[locale]/panel/caja/page.tsx`
- `/[locale]/panel/clientes` — `src/app/[locale]/panel/clientes/page.tsx`
- `/[locale]/panel/cuentas` — `src/app/[locale]/panel/cuentas/page.tsx`
- `/[locale]/panel/gastos` — `src/app/[locale]/panel/gastos/page.tsx`
- `/[locale]/panel/herramientas` — `src/app/[locale]/panel/herramientas/page.tsx`
- `/[locale]/panel/importar` — `src/app/[locale]/panel/importar/page.tsx`
- `/[locale]/panel` — `src/app/[locale]/panel/page.tsx`
- `/[locale]/panel/reportes` — `src/app/[locale]/panel/reportes/page.tsx`
- `/[locale]/panel/reset` — `src/app/[locale]/panel/reset/page.tsx`
- `/[locale]/registro` — `src/app/[locale]/registro/page.tsx`

### APIs

| Ruta | Métodos exportados | Fuente |
|---|---|---|
| `/api/account/pass` | GET | `src/app/api/account/pass/route.ts` |
| `/api/account` | PATCH | `src/app/api/account/route.ts` |
| `/api/admin/clients` | GET, POST | `src/app/api/admin/clients/route.ts` |
| `/api/admin/import-members` | POST | `src/app/api/admin/import-members/route.ts` |
| `/api/admin/reset` | POST | `src/app/api/admin/reset/route.ts` |
| `/api/bookings` | GET, POST, DELETE | `src/app/api/bookings/route.ts` |
| `/api/contact` | POST | `src/app/api/contact/route.ts` |
| `/api/newsletter` | POST | `src/app/api/newsletter/route.ts` |
| `/api/sessions` | GET | `src/app/api/sessions/route.ts` |
