# Plan de migración de roles (caja y entrenador)

Inventario en Supabase (sólo lectura, 18 oct 2026):
- 29 funciones de base de datos mencionan roles; 24 usan `is_staff()` o `crm_is_staff()` (funciones SECURITY DEFINER de clientes y finanzas).
- 22 reglas de acceso (RLS) usan `is_staff()`.
- Un disparador (`crm_protect_profile_role`) protege el cambio de rol en perfiles.

Como hoy el personal tiene casi los mismos permisos que el administrador, el cajero o el entrenador
heredarían acceso total si sólo se agregan roles. Por eso el cambio se hace por fases.

## Fase A — base segura (sin cambiar comportamiento actual)

Estado (18 oct 2026): SQL preparado en `supabase/migrations/00033_roles_fase_a.sql` y probado localmente
con `scripts/test-roles-fase-a-sql.mjs`: 28 de 28 comprobaciones. **APLICADO en Supabase el 18 oct 2026** con autorización; verificado en solo lectura (roles cashier y trainer, tabla staff_permissions con cashier_can_void=false, RLS activo, anon sin acceso, is_staff sin cambios).
Nota: hoy nadie puede cambiar el rol de un perfil desde la API (sólo por SQL del administrador). Asignar roles
desde el panel es parte de la Fase B y requiere su propia prueba.
- Agregar roles `cashier` y `trainer` a la restricción de perfiles.
- Tabla de permisos del administrador (`staff_permissions`): clave, activo, quién cambió, cuándo.
  Sólo el administrador lee y escribe. Valor inicial: `cashier_can_void = false`.
- Funciones de ayuda con aal2: `is_admin()`, `is_cashier()`, `is_trainer()`.
- Ninguna regla existente cambia en esta fase. Se prueba localmente con los cuatro roles.

## Fase B — separar permisos por función

Estado (18 oct 2026): **LISTA EN CÓDIGO, NO APLICADA EN SUPABASE.**
- SQL: `supabase/migrations/00034_roles_fase_b.sql`. Prueba local: `node scripts/test-roles-fase-b-sql.mjs` (58/58). `npm run test:roles` corre A y B.
- Decisiones del dueño aplicadas: las cuentas con rol `staff` pasan a `trainer`; la asignación de roles entra en esta fase.
- Personal con acceso a datos = administrador o caja, con MFA. El entrenador queda fuera de `is_staff` y `crm_is_staff`.
- Sólo administrador: planes, clases, entrenadores, horarios, reporte de deudas (`finance_debt_report`) e importación (`crm_import_client`).
- Entrenador: `trainer_roster()` devuelve sólo id, nombre, asistencia de 30 días y si asistió hoy. Sin teléfono, correo ni notas.
  Pendiente de confirmar: hoy la lista incluye a todos los clientes activos (no hay asignación entrenador-cliente).
- Asignación de roles: `admin_set_role(id, rol)`, sólo admin con MFA, no permite cambiar el propio rol, no quita al último admin, guarda bitácora en `role_changes`.
- Nota: en `planes`, `clases`, `entrenadores` y `horarios` authenticated sólo tiene SELECT (sin GRANT de escritura). La política nueva es defensa adicional.
- App (sin UI nueva, por la regla de no reorganizar el menú): permisos por página (caja/cuentas/gastos = admin o caja; reportes/importar/herramientas/reset = admin), tipos de rol, endpoint `POST /api/admin/roles` (admin con MFA).
- Pruebas: `npm run test:auth` 551/551; `tsc` y eslint sin errores.
- Pendiente antes de aplicar: autorización expresa para ejecutar 00034 en Supabase y verificación posterior en solo lectura.
- Pendiente de UI (requiere aprobación del lugar en el menú): vista del entrenador.

## Asignación entrenador-cliente (00035)
Estado: APLICADO en Supabase (después de 00034). Prueba local 59/59.
- El entrenador sólo ve a los clientes con acceso APROBADO para él.
- Decisión del usuario (23 oct 2026): un cliente puede tener dos o más entrenadores a la vez. La asignación es un permiso por pareja entrenador-cliente, no una pertenencia exclusiva; no cambiar esta regla sin una decisión nueva.
- Prueba con cuenta real (23 oct 2026, cuenta «Entrenador 2»): rol asignado desde Personal y roles con bitácora, ficha de cliente cancelada al pasar a personal, MFA TOTP verificado, asignación directa del administrador, pedido del entrenador, aprobación, revocación por pareja (no afecta a otro entrenador) y reasignación posterior. «Mis clientes» mostró solo la cliente asignada, sin datos de contacto (verificado en la base y en el celular del usuario).
- Interruptor del administrador `trainer_can_request_clients` (en staff_permissions, desactivado por defecto): si está apagado, el entrenador no busca ni pide clientes. Lo cambia sólo el administrador con MFA. Apagarlo no quita los clientes ya aprobados; los pedidos de caja siguen pendientes de aprobación.
- El entrenador pide clientes para sí mismo. Caja puede registrar un pedido en nombre de un entrenador.
- Caja NO aprueba. Sólo el administrador con MFA aprueba, rechaza o revoca.
- Cada pedido queda con quién lo pidió (entrenador o caja), motivo opcional y quién decidió.
- El entrenador busca clientes por nombre (mínimo 3 letras, máximo 10) sólo para pedirlos: ve id, nombre y su estado.
- Prueba: `node scripts/test-trainer-access-sql.mjs` (59 comprobaciones).
- Pendiente de UI: pantalla de pedidos para el administrador y vista del entrenador.
- Finanzas (cobros, abonos, gastos, recibos): admin o caja.
- Clientes: admin y caja ven datos de contacto; entrenador ve sólo nombre y asistencia
  (función aparte que no devuelve teléfono ni correo).
- Reportes, planes, personal y roles: sólo admin.
- Se reescribe función por función y cada cambio tiene una prueba.

## Fase C — anulación controlada
- Función de anulación: genera movimiento de reversa, nunca borra, y guarda motivo y bitácora.
- Permitida al cajero sólo si `cashier_can_void = true`. Si no, el administrador la aplica.
- Panel del administrador: interruptor del permiso y registro de anulaciones.

## Antes de cada aplicación
- Prueba local con administrador, caja, entrenador y cliente, incluidos casos negativos.
- Autorización expresa para aplicar SQL en Supabase.
- Verificación posterior en Supabase, como con 00031 y 00032.
