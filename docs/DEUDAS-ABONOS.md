# Deudas y abonos manuales — bank_accounts_split

## Decisión explícita del usuario

El usuario eligió `reject_excess`: se permiten abonos parciales, pero un abono
mayor que la deuda en la misma moneda se rechaza. El sobrante NO se convierte en
crédito. No se compensan créditos ni monedas, no se renuevan planes ni generan
cargos periódicos automáticamente. No hay bloqueo automático de entradas.

## Operaciones y permisos

- `charge`: personal autorizado registra obligación manual positiva, moneda y
  motivo. Aumenta sólo la deuda elegida, no registra entrada de dinero en Caja.
- `payment`: personal autorizado recibe dinero en cuenta activa de la misma
  moneda y reduce deuda por el importe original. FX manual explícito sólo para
  equivalentes del movimiento; no convierte la deuda. Excedente se rechaza bajo
  bloqueo de saldo, aunque la UI tuviera una lectura antigua.
- `opening`: sólo administrador, cuatro importes iniciales explícitos, sin
  defaults ni inferencia del historial. No reemplaza saldo existente. No entra
  dinero en Caja. Registro de datos reales únicamente después de conciliación y
  aprobación del dueño; durante pruebas, sólo fichas ficticias autorizadas.
  La API valida y SQL verifica rol real. Es una herramienta, no una ejecución
  autorizada por el agente ni una importación automática de saldos.

Los tres generan historial con autor, fecha Managua, motivo, referencia UUID y
snapshot antes/después. Son operaciones internas, no factura fiscal. Todavía no
hay anulación de un cargo erróneo, devolución de abono ni aplicación de créditos;
requieren recorrido reversible auditado, no borrar o editar a mano los saldos.

## Sin exigir correo, QR ni cuenta web

- Ficha con `profile_id`: utiliza la fila real de `member_balances` ya existente.
- Ficha sin cuenta: `client_debt_balances` por ID de ficha, sin crear profiles.
- Si no hay fila, no se supone cero: se necesita apertura administrativa explícita.
- Cambiar vínculo con saldos presentes o borrar identidad con saldo exige
  conciliación previa; los triggers impiden mezclar o perder saldos silenciosamente.
- Lectura de ficha actualizada muestra saldo de esta ficha cuando no hay login.
  Cuentas por cobrar admite `client_id` sin fingir que sea un ID de perfil.

## Integridad, recuperación y autorización

00028 es incremental **sólo bank_accounts_split**; exige COBROS-GASTOS ya instalado.
No carga ejemplos ni saldos, no modifica registros de negocio al instalar. Crea
cuenta local y libro de operaciones vacíos. RLS de ambos sólo permite SELECT al
personal; escrituras directas denegadas, incluyendo member_balances. Escritores
SECURITY DEFINER con guard de rol desde profiles y bloqueo compartido del actor.

Los UUID se serializan antes del saldo. Bloqueo por dueño de saldo y FOR UPDATE;
se rechazan payloads distintos o referencias ya utilizadas en Caja. Abono reutiliza
el escritor financiero privado revisado y reclasifica el movimiento a
`debt_payment` ANTES del commit; el ingreso, cuenta, reducción de deuda, snapshots
y eventos quedan en una sola transacción. Los reintentos recuperan la misma
operación, aun si nuevas escrituras están bloqueadas por readiness; rol siempre
se vuelve a comprobar. Helpers delegados no tienen EXECUTE para usuarios.

Los abonos no aparecen en historial de «cobro por servicio». Su comprobante de
Caja indica abono/deuda antes/después y conserva importes/tasa/nombres originales.
El historial de ingresos y totales completados sí incluyen el dinero realmente
recibido, no cargos o saldos iniciales. Resumen y cuentas por cobrar incorporan
cuentas manuales; no netean crédito/deuda ni NIO/USD. No se inventa vencimiento.

La UI guarda intento en sessionStorage ANTES del POST. Una respuesta perdida
conserva UUID y payload; remontaje/reintento no genera otro cobro. Estado anterior
no se muestra como comprobante del intento actual. Doble clic bloqueado por ref.
Descartar referencia requiere confirmación de revisión: no revierte una operación.
Almacenamiento ilegible bloquea nuevos envíos. No es recuperación entre dispositivos.

## Instalación y validación remotas pendientes

1. Respaldar antes de cambios estructurales. Ejecutar sólo
   `supabase/DEUDAS-ABONOS.sql` completo. No repetir FASE2 ni COBROS-GASTOS.
   Incluye la lectura actualizada de ficha (sustituye SALDO-CLIENTE00027 para este
   modelo); no hace falta repetir ese SQL anterior si seguía pendiente.
2. Si da error, la transacción no debe darse por instalada. Enviar error, no hacer
   cobros ni reinicializar registros para ocultarlo.
3. En preview/admin abrir la ficha ficticia. Confirmar lectura y disponibilidad
   de controles antes de efectuar la prueba guiada. No repetir reservas o planes.
4. La siguiente prueba será con datos ficticios autorizados: apertura explícita si
   falta fila, cargo sin entrada de dinero, abono parcial con entrada igual, exceso
   rechazado sin movimiento, liquidación sin crédito. Comparar historial, Caja,
   cuentas por cobrar y comprobante. No se ha ejecutado este recorrido en Supabase.

No volver a ejecutar migraciones financieras anteriores después de00028: podrían
reemplazar los lectores/escritores envueltos. Readiness detecta si faltan los
wrappers del writer, lector y ficha; bloquea operaciones de deuda nuevas hasta
revisar instalación. Conservar referencias pendientes para recuperación.

## Pruebas

- PGlite: instalación dos veces sin datos alterados; inicialización explícita
  admin/valores válidos, no reset; cuenta sin login; cargos y abonos NIO/USD;
  excedentes rechazados sin Caja; liquidación sin crédito; idempotencia global;
  lector de ficha/Cuentas/resumen; fallos intermedios revierten todo; permisos,
  RLS, rol retirado, escritores privados, vínculo/deleción protegidos.
- PostgreSQL18.4 local (y17 en CI):10 controles de contención total,4 nuevos para
  abono mismo UUID, distintos abonos excediendo deuda, cargos concurrentes y
  rollback. No se infiere concurrencia de PGlite.
- Integración local React/API/SQL:10 controles,3 nuevos. COMMIT real con respuesta
  perdida: disminuye deuda/sube Caja una vez; remontaje y mismo intento recuperan;
  comprobante API conserva deuda antes/después. No HTTP Next, cookies, PostgREST
  ni Supabase real.
- Contrato/API/React: origen/roles antes de RPC, sin coerción, respuesta coincidente,
  rechazo de excedentes, doble clic, intento corrupto, campos iniciales vacíos,
  confirmación y no reutilizar comprobante viejo en intento incierto.
- Diseño SSR con CSS de producción: octava pantalla, tres fixtures y ocho anchos.
  Comprobar en CI/Chromium; no sustituye validación remota en celular.

No merge, limpieza, movimientos remotos, cambios de administrador ni carga real.

La capacidad opcional `finance_debt_report` hace que Caja y Cuentas prefieran el
lector consolidado una vez instalado, incluso si quedan vistas nativas antiguas
que responden sin error pero omiten las fichas sin login. Sólo la ausencia real
del RPC permite el lector anterior; permisos, red o respuesta inválida se muestran
como error, no como cero. Tres regresiones cubren esta prioridad/fallo explícito.

### Evidencia local del cambio

- `typecheck`: exit0, sin errores.
- `lint`:0 errores y10 advertencias preexistentes.
- `build`: compilación correcta,40/40 páginas estáticas.
- `test:auth`:422/422,0 fallos.
- `test:sql`: suites anteriores intactas +67 controles del módulo nuevo.
- PostgreSQL18.4 local:10 concurrencia +10 recuperación UI/API/SQL. Servidor de
  pruebas detenido y datos desechables retirados; ninguna conexión a Supabase.
- SQL generado sincronizado y `git diff --check` correctos.

`SD-…` identifica la operación de deuda; `SG-…` el comprobante del ingreso en Caja
asociado al abono. Son dos referencias del mismo abono, no dos cobros.
