# Plan de migración de roles (caja y entrenador)

Inventario en Supabase (sólo lectura, 18 oct 2026):
- 29 funciones de base de datos mencionan roles; 24 usan `is_staff()` o `crm_is_staff()` (funciones SECURITY DEFINER de clientes y finanzas).
- 22 reglas de acceso (RLS) usan `is_staff()`.
- Un disparador (`crm_protect_profile_role`) protege el cambio de rol en perfiles.

Como hoy el personal tiene casi los mismos permisos que el administrador, el cajero o el entrenador
heredarían acceso total si sólo se agregan roles. Por eso el cambio se hace por fases.

## Fase A — base segura (sin cambiar comportamiento actual)
- Agregar roles `cashier` y `trainer` a la restricción de perfiles.
- Tabla de permisos del administrador (`staff_permissions`): clave, activo, quién cambió, cuándo.
  Sólo el administrador lee y escribe. Valor inicial: `cashier_can_void = false`.
- Funciones de ayuda con aal2: `is_admin()`, `is_cashier()`, `is_trainer()`.
- Ninguna regla existente cambia en esta fase. Se prueba localmente con los cuatro roles.

## Fase B — separar permisos por función
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
