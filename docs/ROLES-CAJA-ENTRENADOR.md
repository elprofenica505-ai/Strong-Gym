# Roles de caja y entrenador (diseño, pendiente de autorización)

Estado: DISEÑO. No hay SQL aplicado ni cambios de base de datos para esto.

## Decisiones confirmadas por el usuario
- Roles separados: administrador, caja, entrenador, cliente, visitante.
- Sólo el administrador asigna roles.
- **Anular cobros** es un permiso que el administrador activa y desactiva desde un panel de permisos.
  - Desactivado (por defecto): el cajero que cometió un error pide autorización al administrador.
  - El administrador autoriza y aplica la anulación desde el panel.
  - Activado: el cajero puede anular cobros propios del día, con motivo obligatorio.

## Reglas de datos
- Anular nunca borra: se registra un movimiento de reversa que apunta al original, con quién, cuándo y motivo.
- Toda anulación queda en la bitácora del administrador.
- El cierre diario no cambia para movimientos ya cerrados.

## Permisos base (antes de cualquier ajuste del administrador)

| Acción | Admin | Caja | Entrenador | Cliente |
|---|---|---|---|---|
| Registrar cobros y abonos | sí | sí | no | no |
| Anular cobro | sí | sólo si el permiso está activo | no | no |
| Emitir recibos | sí | sí | no | no |
| Ver saldos y deudas | sí | sí | no | propios |
| Registrar gastos | sí | sí | no | no |
| Cambiar planes o precios | sí | no | no | no |
| Reportes completos | sí | no | no | no |
| Asignar roles | sí | no | no | no |
| Marcar asistencia de sus clases | sí | no | sí | no |
| Ver datos de contacto de clientes | sí | sí | pendiente de decisión | no |

## Pendiente de decisión
1. El entrenador: ¿ve teléfono y correo de sus clientes o sólo nombre y asistencia?
2. ~~Confirmar el cierre de 2 horas también para el personal~~: **resuelto, sólo administrador** (confirmado por el usuario).

## Decisiones confirmadas adicionales
- Entrenador: no ve teléfono ni correo de clientes; sólo nombre y asistencia.

## Pendiente de autorización
- SQL: nuevos roles, tabla de permisos del administrador, reglas RLS por rol y función de anulación con bitácora.
- Se prepara en `supabase/migrations/`, se prueba localmente y se aplica sólo con autorización expresa.
