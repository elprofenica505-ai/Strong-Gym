# C.1 — Cobros por servicio, gastos y comprobantes internos

Fecha: 2026-10-17. PR #10, sin merge. No se ejecutó SQL remoto.

## Diagnóstico recibido

Se revisó el CSV de escritura enviado por el administrador: 10 relaciones,
92 columnas, 29 restricciones, 13 políticas y ninguna entrada de disparadores
no internos en las tablas revisadas. El `record_payment` bancario es un guard
que lanza `FINANCE_REVIEW_REQUIRED`; no un escritor que haya que reactivar.
Las precisiones bancarias confirmadas se incorporaron al fixture local, no
se copiaron datos de clientes, movimientos o cuentas del negocio al repositorio.

## Qué implementa

- Cobro **por servicio** desde la ficha CRM: sólo nombre, sin exigir login,
  correo, teléfono o perfil vinculado.
- Gasto desde Panel → Gastos: categoría, cuenta, método, moneda, concepto,
  importe y tasa explícitos.
- Un solo RPC SQL transaccional registra movimiento, saldo propio de la
  cuenta, comprobante y evento del cliente cuando corresponde. Si falla
  alguna parte, se revierte todo.
- Referencia UUID persistida en sessionStorage **antes** del POST. Doble
  submit bloqueado; respuesta perdida/recarga conserva todo el intento.
  Reintento con el mismo contenido devuelve el mismo comprobante; cambiar
  contenido bajo la misma referencia se rechaza. Descartar el intento local
  no anula un movimiento y requiere revisión manual explícita.
- Bloqueo de fila de cuenta y bloqueo transaccional por referencia para
  serializar saldo e idempotencia. Actor bloqueado/validado desde profiles.
- Cuenta y método activos, moneda compatible; categoría existente; límites y
  decimales se verifican en API y SQL, no sólo en el formulario.
- Ambos tipos de moneda requieren tasa NIO por 1 USD ingresada por el personal.
  NIO: amount_nio=importe, amount_usd=round(importe/tasa,4). USD:
  amount_usd=importe, amount_nio=round(importe*tasa,2). La cuenta sólo cambia
  por el importe en **su moneda**; no hay traslado ni conversión de fondos.
- Comprobante persistido con referencia SG-UUID, importe, fecha Managua,
  concepto, cliente/categoría, método, cuenta, autor, tasa, equivalentes y
  saldos antes/después. Guarda nombres de ese momento, no nombres actuales.
- Consulta de últimos 50 comprobantes por cliente o gastos; lectura individual;
  impresión/PDF del navegador. Son comprobantes internos, no facturas fiscales.
- Reportes existentes incluyen los movimientos completados con sus equivalentes
  guardados; no recalculan históricos con una tasa nueva.

## Reglas explícitas y límites del alcance

Estos cobros NO son abonos de deuda, anticipos/créditos ni renovaciones de plan.
No modifican member_balances, sus fechas, vigencias ni etiquetas. La interfaz
lo advierte antes de confirmar. Deudas/créditos e inicialización de saldos
continúan pendientes como operaciones independientes, también para clientes
sin cuenta web. No presentar este bloque como finanzas completas.

No se descuentan comisiones automáticamente: el importe es el movimiento bruto
registrado y las comisiones se registran como gastos separados. No se impone
una política comercial de sobregiro: un gasto puede dejar saldo negativo, con
aviso previo y advertencia en el comprobante. No certifica un arqueo ni corrige
saldos iniciales o históricos no conciliados.

Los movimientos del nuevo registro no se editan, anulan ni borran desde la app.
Una futura corrección deberá ser una operación trazable, no un DELETE. No hay
transferencias, arqueo/cierre, nómina ni facturación fiscal implementados aquí.

## Seguridad y compatibilidad

`00024_finance_movements.sql` es una actualización **sólo** para el modelo
bank_accounts_split confirmado. Una base nativa del repositorio se rechaza
antes de una instalación parcial; no se debe aplicar ahí. No es un instalador
ni se concatena a SETUP/FASE2 nativos. El generador mantiene su copia exacta
`supabase/COBROS-GASTOS.sql` y CI verifica sincronización.

Instalación y ejecución rechazan disparadores financieros habilitados que no
se hayan revisado. Si aparecen después, se deshabilitan nuevas escrituras;
los reintentos ya confirmados y comprobantes siguen recuperables. La escritura
directa de transactions/bank_accounts queda revocada para PUBLIC/anon/authenticated,
con SELECT de authenticated conservado bajo RLS existente. finance_entries sólo
permite lectura a staff mediante RLS. Los RPC comprueban profiles en SQL y la API
verifica sesión, rol y origen. No usa service_role ni roles de metadata/JWT.

`crm_record_payment`/`record_payment` legacy siguen bloqueados en banco y
`crm_options.payments_enabled` sigue false a propósito: el frontend viejo no
puede activar silenciosamente un cobro NIO con tasa 1. El nuevo formulario usa
su protocolo separado `service-v1` (`finance_options` + `finance_record_movement`).
No confundir la señal legacy con un bloqueo del nuevo módulo.

## Instalación y prueba desde celular

1. Hacer un respaldo de la base. No ejecutar SETUP/ACTUALIZAR ni seeds.
2. Copiar **completo** COBROS-GASTOS.sql al SQL Editor de Supabase y ejecutar.
   Requiere FASE2, COMPATIBILIDAD-CRM y LECTURA-CAJA ya instalados.
3. Revisar el resultado; si falla, no quitar guards ni habilitar el escritor viejo.
   La transacción revierte la instalación. Compartir el código, no claves.
4. Probar la versión del PR que contenga este bloque, no la producción anterior.
   Usar una ficha y cuentas identificadas como EJEMPLO, sin mezclar movimientos
   inventados con la operación real. La instalación no crea esos registros.
5. Registrar un cobro por servicio en NIO usando el monto y tasa de prueba
   explícitamente acordados. Revisar comprobante, autor y saldo incremental.
6. Registrar un gasto de prueba y revisar descuento propio, categoría y reportes.
7. Probar USD con cuenta USD y tasa ingresada. No se debe sumar USD a la cuenta NIO.
8. Simular respuesta perdida y recuperar el mismo intento: sólo un movimiento,
   un comprobante y una variación del saldo. Verificar permisos como cliente.
9. Comparar deudas/créditos y vigencias antes/después: deben permanecer intactos.
   No limpiar pruebas hasta aceptación integral y aprobación del dueño.

El agente no aplicó este SQL, no cargó ejemplos en Supabase ni ejecutó cobros.
La prueba remota debe quedar documentada antes de dar el bloque por aceptado.

## Pruebas

- SQL/PGlite: 82 comprobaciones de instalación repetible, preservación de
  históricos/cuentas/saldos/fichas, NIO/USD, idempotencia, conflictos, permisos,
  RLS, validaciones, fallo de auditoría con rollback, triggers y permisos nuevos,
  snapshots de comprobante, historial limitado y reportes conciliados.
- El fixture usa precisiones del CSV remoto (incluyendo amount_usd numeric(12,4)).
- API/formularios: permisos, origen, validación, protocolo, ausencia de demo,
  referencia guardada antes del envío, doble submit, pérdida de respuesta,
  recuperación tras recarga, respuesta inválida, opciones faltantes y referencia
  corrupta. Integración de ficha bancaria con el nuevo formulario.
- Chromium: 144 casos de shell/pantallas/formularios/comprobante, CSS de producción,
  con filas/vacíos/importes largos a 320–1280 px. No certifica hidratación remota.
- Next/RSC real: Cuentas, Reportes, Gastos y Comprobante con filas y vacíos/error,
  para comprobar también las fronteras servidor/cliente de formato e impresión.

PGlite tiene una sola conexión: no sustituye una prueba de contención real entre
sesiones PostgreSQL, ni estas pruebas prueban la persistencia en Supabase remoto.

### Salida real final de esta entrega

```text
npm run typecheck
> tsc --noEmit
(exit 0)

npm run lint
✖ 10 problems (0 errors, 10 warnings)
(exit 0; advertencias previas no silenciadas)

npm run build
✓ Compiled successfully in 962ms
✓ Generating static pages using 1 worker (40/40) in 207ms
(exit 0)

npm run test:auth
# tests 294
# pass 294
# fail 0
(exit 0)

npm run test:sql
🎉 Todo pasó
🎉 CRM: 49 comprobaciones pasaron
🎉 Compatibilidad CRM: 69 comprobaciones pasaron
🎉 Escritura financiera: 82 comprobaciones pasaron (PGlite; sin concurrencia multiconexión ni SQL remoto)
(exit 0)

npm run test:layout
PASS: 144 casos (6 pantallas/formularios × 3 fixtures EJEMPLO × 8 anchos, 320–1280 px).
(exit 0)

npm run test:finance:rsc
✅ Next/RSC: Cuentas, Reportes, Gastos y Comprobante prerenderizados con filas y vacíos, sin llamadas servidor→función cliente.
(exit 0)

node scripts/build-sql.mjs --check
✅ Todo al día — 9 clases por semana.
(exit 0)

npm run test:metadata
✅ /es y /en: idioma, canonical, OG/Twitter y PNG 1200×630 HTTP 200.
✅ Enlace anterior redirigido; 404 correcto y sin aviso metadataBase.
(exit 0)
```

No hay afirmación de CI remoto terminado ni de aceptación en Supabase real.
Los 5 avisos high de npm audit en la cadena DEV de ESLint documentados en la
entrega anterior siguen pendientes de una actualización compatible; este bloque
no añade dependencias ni aplica audit fix --force.
